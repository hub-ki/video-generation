#!/usr/bin/env node
// Transcribe the generated narration and diff it against narration.mjs.
//
//   node <skill>/scripts/verify-narration.mjs <project-dir> [--language de] [--model large-v3]
//   exit 1 = the voice does not say what the script says
//
// WHY THIS EXISTS. Every other audio check in this pipeline measures the SHAPE of the sound
// and never its content: the fit table compares durations, `volumedetect` compares levels,
// `silencedetect` finds pauses. A mispronounced word has a normal duration, a normal level
// and normal pauses, so it passes all three by construction — and "audio verified" then means
// "placement verified", which is not the same claim.
//
// It shipped exactly that way once. `voiceover.md` says to respell a brand name phonetically
// in the TTS input, because the engine mangles a short foreign word inside a sentence. A build
// wrote the on-screen spelling anyway; the fit table said yes, every section measured -2 dB, and
// the rendered narration mispronounced the brand in both places it was spoken. A prose rule did
// not bind. This does.
//
// THE POINT IS THE PRINTED DIFF, not the exit code. One wrong word in thirty is ~3% WER, so
// no sane threshold fails it — but the brand name is the word that matters most and the one
// a TTS most reliably breaks. So risky tokens (brand names, acronyms, dotted names) are
// checked individually and always reported, and the word diff is printed for every line.
import { execFileSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { pathToFileURL } from "url";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((entry) => entry.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
};

const projectDir = resolve(args.find((entry) => !entry.startsWith("--")) || ".");
const audioDir = join(projectDir, "assets", "audio");
const narrationPath = join(projectDir, "narration.mjs");

if (!existsSync(narrationPath)) {
  console.error(`no narration.mjs in ${projectDir}`);
  process.exit(2);
}
if (!existsSync(audioDir)) {
  console.error(`no assets/audio in ${projectDir} — run make-audio.mjs first`);
  process.exit(2);
}

const narration = await import(pathToFileURL(narrationPath).href);
const sections = narration.sections ?? [];
if (sections.length === 0) {
  console.error("narration.mjs exports no sections");
  process.exit(2);
}

// A pronunciation respelling means the TTS input deliberately differs from the words that
// should be HEARD (`voiceover.md` -> "Spell them for the voice"). Comparing the transcript
// against the input would then flag the fix as the defect — the check must verify the INTENDED
// spoken form. narration.mjs declares the mapping:
//
//   export const pronunciations = { "Akkme": "ACME" };
//
// which also makes the respelling self-documenting and proves it actually worked.
const pronunciations = narration.pronunciations ?? {};
const spokenForm = (text) =>
  Object.entries(pronunciations).reduce(
    (carry, [written, spoken]) => carry.split(written).join(spoken),
    text
  );

const language = flag("language", narration.language ?? "en");
// The .en whisper models cannot do anything but English, and silently return English-shaped
// nonsense for other languages. Set `language` in narration.mjs and this picks the multilingual
// model unless the track really is English.
const model = flag("model", language === "en" ? "small.en" : "large-v3");
const cliPath =
  process.env.HYPERFRAMES_CLI ||
  join(
    process.env.HOME || "",
    ".hyperframes-cli/node_modules/hyperframes/dist/cli.js"
  );
if (!existsSync(cliPath)) {
  console.error(
    "no hyperframes CLI — run scripts/setup-render-env.sh and re-source it"
  );
  process.exit(2);
}

// ── normalisation ──────────────────────────────────────────────────────────
// ASR returns no punctuation and no casing, and an em dash becomes a comma or nothing.
// Compare on words alone, but keep umlauts and ß — a German model produces them, and
// folding them would hide a real "Fahigkeiten".
const words = (text) =>
  text
    .toLowerCase()
    .replace(/[—–-]/g, " ")
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .replace(/\.(?=\s|$)/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const squash = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Tokens a TTS is most likely to break and a reviewer most likely to care about:
 *  dotted names (Acme.ai, SKILL.md), embedded capitals (HubSpot), bare acronyms (MCP, OCR). */
const riskyTokens = (text) => {
  const found = new Set();
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.]+$/gu, "");
    if (token.length < 2) continue;
    const dotted = /\p{L}\.\p{L}/u.test(token);
    const innerCaps = /\p{Ll}\p{Lu}/u.test(token);
    const acronym = /^\p{Lu}{2,}$/u.test(token.replace(/\./g, ""));
    if (dotted || innerCaps || acronym) found.add(token.replace(/\.$/, ""));
  }
  return [...found];
};

/** Word-level LCS diff -> a compact list of edits. */
function diffWords(expected, actual) {
  const rows = expected.length;
  const columns = actual.length;
  const table = Array.from({ length: rows + 1 }, () =>
    new Uint32Array(columns + 1)
  );
  for (let row = rows - 1; row >= 0; row--) {
    for (let column = columns - 1; column >= 0; column--) {
      table[row][column] =
        expected[row] === actual[column]
          ? table[row + 1][column + 1] + 1
          : Math.max(table[row + 1][column], table[row][column + 1]);
    }
  }
  const edits = [];
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (expected[row] === actual[column]) {
      row++;
      column++;
    } else if (table[row + 1][column] >= table[row][column + 1]) {
      edits.push({ type: "missing", word: expected[row++] });
    } else {
      edits.push({ type: "extra", word: actual[column++] });
    }
  }
  while (row < rows) edits.push({ type: "missing", word: expected[row++] });
  while (column < columns) edits.push({ type: "extra", word: actual[column++] });
  return edits;
}

// ── transcribe (cached on the mp3's mtime, so a re-recorded line re-transcribes) ──
function transcribe(mp3Path) {
  const cachePath = `${mp3Path.replace(/\.mp3$/, "")}.stt.json`;
  if (
    existsSync(cachePath) &&
    statSync(cachePath).mtimeMs >= statSync(mp3Path).mtimeMs
  ) {
    return JSON.parse(readFileSync(cachePath, "utf8"));
  }
  const scratch = mkdtempSync(join(tmpdir(), "stt-"));
  try {
    const stdout = execFileSync(
      process.execPath,
      [
        cliPath,
        "transcribe",
        mp3Path,
        "--dir",
        scratch,
        "--model",
        model,
        "--language",
        language,
        "--json",
      ],
      { cwd: scratch, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const summary = JSON.parse(
      stdout.trim().split("\n").filter(Boolean).pop() || "{}"
    );
    if (!summary.transcriptPath || !existsSync(summary.transcriptPath)) {
      throw new Error("transcribe returned no transcriptPath");
    }
    const entries = JSON.parse(readFileSync(summary.transcriptPath, "utf8"));
    const text = entries.map((entry) => entry.text).join(" ");
    writeFileSync(cachePath, JSON.stringify({ text, model, language }, null, 2));
    return { text, model, language };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// ── run ────────────────────────────────────────────────────────────────────
console.log(`\n  narration STT check · model ${model} · language ${language}\n`);

const errors = [];
const notes = [];

for (const section of sections) {
  const mp3Path = join(audioDir, `${section.id}.mp3`);
  if (!existsSync(mp3Path)) {
    errors.push(`${section.id}: no mp3 — run make-audio.mjs`);
    continue;
  }

  let result;
  try {
    result = transcribe(mp3Path);
  } catch (error) {
    errors.push(`${section.id}: transcription failed — ${error.message}`);
    continue;
  }

  // Compare against what should be HEARD, which is the TTS input with every pronunciation
  // respelling mapped back to its real spelling.
  const intended = spokenForm(section.text);
  const expected = words(intended);
  const actual = words(result.text);
  const edits = diffWords(expected, actual);
  const errorRate = expected.length ? edits.length / expected.length : 0;

  // Risky tokens are checked on the squashed transcript, so "ACME.ai" still matches a
  // transcript that writes it "ACME AI" or "acme, ai" — but not one that writes "ackmy eye".
  const squashedActual = squash(result.text);
  const missingRisky = riskyTokens(intended).filter(
    (token) => !squashedActual.includes(squash(token))
  );

  const status = missingRisky.length ? "✗" : edits.length ? "⚠" : "ok";
  console.log(
    `  ${status.padEnd(3)} ${section.id.padEnd(20)} ${(errorRate * 100)
      .toFixed(0)
      .padStart(3)}% off  (${edits.length}/${expected.length} words)`
  );

  if (missingRisky.length) {
    // Report what was heard INSTEAD, not a tail of the line — the bad token is usually
    // mid-sentence, and a tail excerpt then shows everything except the problem.
    const heardInstead = edits
      .filter((edit) => edit.type === "extra")
      .map((edit) => edit.word)
      .join(" ");
    for (const token of missingRisky) {
      errors.push(
        `${section.id}: the voice never says "${token}"` +
          (heardInstead ? ` — heard instead: "${heardInstead}"` : "")
      );
    }
  }
  if (edits.length) {
    const shown = edits
      .slice(0, 8)
      .map((edit) => `${edit.type === "missing" ? "-" : "+"}${edit.word}`)
      .join(" ");
    notes.push(`    ${section.id}: ${shown}${edits.length > 8 ? " …" : ""}`);
  }
}

if (notes.length) {
  console.log("\n  word diffs (- expected, + heard):");
  for (const note of notes) console.log(note);
}

if (errors.length) {
  console.log("");
  for (const error of errors) console.log(`  ✗ ${error}`);
  console.log(
    `\n  ${errors.length} error(s) — the voice does not say what narration.mjs says.` +
      `\n  For a mangled proper noun, respell it phonetically in narration.mjs ONLY` +
      `\n  (voiceover.md -> "Spell the brand for the voice"), delete that section's mp3,` +
      `\n  re-run make-audio.mjs, then re-run this.\n`
  );
  process.exit(1);
}

console.log(
  `\n  0 errors — every line says what it should.` +
    `\n  Word diffs above are ASR noise (punctuation, compounds); read them once anyway.\n`
);
