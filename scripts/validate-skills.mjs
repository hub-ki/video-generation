// Frontmatter constraints every SKILL.md in this repository has to satisfy.
//
//   node scripts/validate-skills.mjs
//
// It exists because both skills silently exceeded the 1024-character description limit and were
// therefore rejected by the loader — the skills themselves were fine, and neither would start.
// Nothing in a Markdown file fails loudly on its own, so this does.

import { readFileSync, readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = join(ROOT, 'skills');

// The loader's limit, and a working margin below it. A description trimmed to exactly 1023 is one
// clause away from breaking again, and the failure is invisible: the skill simply never fires.
const MAX_DESCRIPTION = 1024;
const COMFORTABLE = 980;
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Fold a YAML `>` block the way the parser does: lines join with spaces. */
function foldedDescription(frontmatter) {
  const match = frontmatter.match(/^description: >\n((?:[ ]{2}.*\n|\n)+?)(?=^[a-z]|\Z)/m);
  if (!match) return null;
  return match[1].trim().split('\n').map((line) => line.trim()).filter(Boolean).join(' ');
}

let failures = 0;
const fail = (name, message) => { failures += 1; console.log(`  FAIL ${name} — ${message}`); };
const pass = (name, message) => console.log(`  ok   ${name} — ${message}`);

for (const skill of readdirSync(SKILLS)) {
  const path = join(SKILLS, skill, 'SKILL.md');
  if (!existsSync(path)) { fail(skill, 'has no SKILL.md'); continue; }

  const source = readFileSync(path, 'utf8');
  const parts = source.split('---');
  if (parts.length < 3 || parts[0].trim() !== '') { fail(skill, 'has no leading frontmatter block'); continue; }
  const frontmatter = parts[1];

  const declaredName = (frontmatter.match(/^name:[ ]*(\S+)/m) || [])[1];
  if (!declaredName) fail(skill, 'frontmatter has no `name`');
  else if (declaredName !== skill) fail(skill, `frontmatter name "${declaredName}" does not match its directory`);
  else if (!NAME_PATTERN.test(declaredName)) fail(skill, `name "${declaredName}" is not lowercase-kebab`);

  const description = foldedDescription(frontmatter);
  if (description === null) {
    fail(skill, 'has no `description: >` block');
  } else if (description.length > MAX_DESCRIPTION) {
    fail(skill, `description is ${description.length} characters, over the ${MAX_DESCRIPTION} limit by `
      + `${description.length - MAX_DESCRIPTION} — the loader rejects it and the skill never starts`);
  } else if (description.length > COMFORTABLE) {
    fail(skill, `description is ${description.length} characters — under the ${MAX_DESCRIPTION} limit but `
      + `past the ${COMFORTABLE} working margin, so the next clause added breaks it`);
  } else {
    pass(skill, `description ${description.length}/${MAX_DESCRIPTION} characters`);
  }
}

console.log(failures ? `\n${failures} problem(s)\n` : '\nfrontmatter ok\n');
process.exit(failures ? 1 : 0);
