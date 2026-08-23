// Write a brand into a composition: tokens + logo, then check the result is actually legible.
//
//   node <skill>/scripts/apply-brand.mjs [project-dir] [--brand ./brand.json]
//                                        [--target ./index.html] [--check]
//
// WHY THIS EXISTS. The design system is one look with swappable tokens, so "use our brand"
// should be a mechanical step, not a hand-edit of six CSS values and two inline SVGs across a
// file that also carries the timeline. Hand-editing them drifts: the intro logo gets swapped
// and the outro one does not, or a palette lands with near-black ink on a near-black canvas and
// nothing in the pipeline notices, because every other check measures geometry and timing.
//
// So this rewrites the marked blocks and refuses a palette the viewer could not read:
//   /* BRAND:START */ … /* BRAND:END */   the :root token block
//   <!-- LOGO:START --> … <!-- LOGO:END --> every logo slot (intro AND outro)
//
// --check validates brand.json and the current file without writing anything.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join, resolve, relative, extname } from "path";
import {
  parseColor, toHex, rgbaString, paletteChecks, printPaletteTable, injectSvgAttributes,
} from "./brand-lib.mjs";

const argv = process.argv.slice(2);
const options = { check: false, brand: undefined, target: undefined };
const positional = [];
for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index];
  if (argument === "--check") options.check = true;
  else if (argument === "--brand" || argument === "--target") options[argument.slice(2)] = argv[++index];
  else positional.push(argument);
}
const projectDir = resolve(positional[0] || ".");
const checkOnly = options.check;
const brandFile = resolve(options.brand || join(projectDir, "brand.json"));
const targetFile = resolve(options.target || join(projectDir, "index.html"));

if (!existsSync(brandFile)) {
  console.error(
    `no brand file at ${brandFile}\n` +
    `Start from the skill's assets/brand.example.json, or extract one from a website:\n` +
    `  node <skill>/scripts/extract-brand.mjs https://example.com --out ./brand.json`);
  process.exit(2);
}
if (!existsSync(targetFile)) {
  console.error(`no composition at ${targetFile} — copy <skill>/assets/template.html there first.`);
  process.exit(2);
}

const brand = JSON.parse(readFileSync(brandFile, "utf8"));
const colors = brand.colors || {};
const errors = [];
const warnings = [];

const required = ["bg", "ink", "ink2", "card"];
const parsed = {};
for (const key of required) {
  const color = parseColor(colors[key]);
  if (!color) errors.push(`colors.${key} is missing or not a color: ${JSON.stringify(colors[key] ?? null)}`);
  else parsed[key] = color;
}

const highlightInput = colors.highlight ?? colors.hl;
const highlightStops = (Array.isArray(highlightInput) ? highlightInput : [highlightInput, highlightInput])
  .slice(0, 2).map((stop) => parseColor(stop));
if (!highlightStops[0] || !highlightStops[1]) {
  errors.push(`colors.highlight must be a color or a two-color gradient: ${JSON.stringify(highlightInput ?? null)}`);
}

if (errors.length) {
  console.error(`\n  ${brandFile}\n` + errors.map((line) => `  ✗ ${line}`).join("\n") + "\n");
  process.exit(1);
}

const audit = paletteChecks({ ...parsed, highlight: highlightStops });
console.log(`\n  brand: ${brand.name || "(unnamed)"}\n`);
printPaletteTable(audit.rows);
errors.push(...audit.errors);
warnings.push(...audit.warnings);

const dot = colors.dot || rgbaString(parsed.ink, ".10");
const fontStack = brand.font?.sans ||
  `-apple-system,system-ui,"Segoe UI","Helvetica Neue",Arial,sans-serif`;

const tokenBlock =
`/* BRAND:START — generated from ${relative(dirname(targetFile), brandFile) || "brand.json"} by scripts/apply-brand.mjs.
         Edit that file and re-run; hand-edits here are overwritten on the next run. */
      :root { --bg:${toHex(parsed.bg)}; --ink:${toHex(parsed.ink)}; --ink2:${toHex(parsed.ink2)}; --card:${toHex(parsed.card)};
        --hl:${toHex(highlightStops[0])}; --hl2:${toHex(highlightStops[1])};
        --sans:${fontStack};
        --dot:${dot}; }
      /* BRAND:END */`;

function readLogoMarkup() {
  const logo = brand.logo || {};
  if (logo.inline) return { kind: "svg", markup: logo.inline.trim() };
  if (!logo.path) return null;
  const logoPath = resolve(dirname(brandFile), logo.path);
  if (!existsSync(logoPath)) {
    errors.push(`logo.path points at a file that does not exist: ${logoPath}`);
    return null;
  }
  if (extname(logoPath).toLowerCase() === ".svg") {
    const source = readFileSync(logoPath, "utf8")
      .replace(/<\?xml[\s\S]*?\?>/g, "")
      .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
    if (!source.startsWith("<svg")) {
      errors.push(`logo.path is not an SVG document: ${logoPath}`);
      return null;
    }
    return { kind: "svg", markup: source };
  }
  return { kind: "img", src: relative(dirname(targetFile), logoPath).split("\\").join("/") };
}

// Preserve whatever the slot already carried: `.logo` sizes the intro mark and the outro one
// overrides it inline, so a replacement that drops the style silently shrinks the outro.
//
// The widths are configurable because the defaults assume a roughly SQUARE mark. `.logo` sizes by
// width, so a wide wordmark at 72px comes out ~19px tall next to a 128px title and reads as a
// mistake. A named slot (`<!-- LOGO:START intro -->`) takes brand.json's logo.width /
// logo.outroWidth when they are set.
const SLOT_WIDTHS = { intro: brand.logo?.width, outro: brand.logo?.outroWidth };

function attributesOf(block, slotName) {
  const tag = block.match(/<(?:svg|img)\b[^>]*>/i);
  const className = tag?.[0].match(/\bclass="([^"]*)"/i)?.[1] ?? "logo";
  const existing = tag?.[0].match(/\bstyle="([^"]*)"/i)?.[1] ?? "";
  const configured = SLOT_WIDTHS[slotName];
  if (configured === undefined) return { className, style: existing };
  const style = existing.replace(/\bwidth\s*:[^;]*;?/gi, "").trim();
  return { className, style: `width:${configured}px${style ? `; ${style}` : ""}` };
}

function renderLogo(logo, { className, style }) {
  const label = brand.name ? `${brand.name} logo` : "logo";
  if (logo.kind === "img") {
    const attributes = `class="${className}"${style ? ` style="${style}"` : ""}`;
    return `<img ${attributes} src="${logo.src}" alt="${label}" />`;
  }
  const withAttributes = injectSvgAttributes(logo.markup, { className, style });
  return /\brole=/i.test(withAttributes)
    ? withAttributes
    : withAttributes.replace(/^<svg\b/i, `<svg role="img" aria-label="${label}"`);
}

let html = readFileSync(targetFile, "utf8");
const brandBlock = /\/\* BRAND:START[\s\S]*?\/\* BRAND:END \*\//;
if (!brandBlock.test(html)) {
  errors.push(`${targetFile} has no /* BRAND:START */ … /* BRAND:END */ block — it is not a template-derived composition`);
} else {
  html = html.replace(brandBlock, tokenBlock);
}

const logo = readLogoMarkup();
const logoSlots = [...html.matchAll(/<!-- LOGO:START\s*([a-z]*)[\s\S]*?<!-- LOGO:END -->/g)];
if (!logoSlots.length) {
  warnings.push(`${targetFile} has no <!-- LOGO:START --> … <!-- LOGO:END --> slots — the logo was not replaced`);
} else if (!logo) {
  warnings.push("brand.json declares no logo, so the placeholder mark is still in the intro and outro");
} else {
  for (const slot of logoSlots) {
    const slotName = slot[1] || "";
    const marker = `<!-- LOGO:START${slotName ? ` ${slotName}` : ""} -->`;
    html = html.replace(slot[0],
      `${marker}\n          ${renderLogo(logo, attributesOf(slot[0], slotName))}\n          <!-- LOGO:END -->`);
  }
}

if (warnings.length) console.log("\n" + warnings.map((line) => `  ! ${line}`).join("\n"));
if (errors.length) {
  console.error("\n" + errors.map((line) => `  ✗ ${line}`).join("\n") +
    "\n\n  Nothing was written. Fix brand.json and re-run.\n");
  process.exit(1);
}

const shortestPath = (file) => {
  const fromHere = relative(process.cwd(), file);
  return fromHere && fromHere.length < file.length ? fromHere : file;
};

if (checkOnly) {
  console.log(`\n  --check: brand.json is usable and ${shortestPath(targetFile)} has the slots. Nothing written.\n`);
  process.exit(0);
}

writeFileSync(targetFile, html);
console.log(`\n  wrote tokens${logoSlots.length ? ` and ${logoSlots.length} logo slot(s)` : ""} into ${shortestPath(targetFile)}\n` +
  `  Re-render, then read a snapshot: a palette that passes contrast can still look wrong.\n`);
