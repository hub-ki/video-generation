// Build a complete, valid brand.json from one colour.
//
//   node <skill>/scripts/make-brand.mjs --accent "#2f6df6" --name Acme [--out ./brand.json]
//                                       [--mood tinted|warm|cool|mono] [--dark]
//                                       [--font "Inter"] [--logo ./assets/logo.svg]
//                                       [--from-logo ./assets/logo.svg]
//
// WHY THIS EXISTS. The brand step has three ways in — the user hands you tokens, you extract them
// from their site, or you ship the neutral default. There is a fourth case it did not cover, and
// it is common: there IS no brand guide and no website, just "our colour is this blue".
//
// Left to improvise, that becomes a grey design with one blue bar bolted on — because the obvious
// move is to keep the neutrals neutral and paint only the accent. This derives the whole palette
// from the accent instead: the neutrals carry a trace of its hue, so the frame reads as one
// system rather than a template someone recoloured.
//
// It is not a taste engine. It gets the RELATIONSHIPS right (canvas under card, ink that clears
// its backgrounds, a highlighter the headline can sit on) and repairs itself until every bar in
// paletteChecks passes. Whether that blue is the right blue is the user's call — show them
// `preview-brand.mjs` before you build anything on it.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname, relative, extname } from "path";
import {
  parseColor, toHex, toHsl, fromHsl, mix, contrastRatio,
  canvasFromCard, highlighterFromAccent, rgbaString, paletteChecks, printPaletteTable,
} from "./brand-lib.mjs";

const argv = process.argv.slice(2);
const options = { mood: "tinted", out: "./brand.json", dark: false };
for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index];
  if (argument === "--dark") options.dark = true;
  else if (argument.startsWith("--")) options[argument.slice(2)] = argv[++index];
}

// A logo is often the only artifact that exists, and its dominant colour IS the brand colour.
// SVG only: the colours are literals in the markup, so no image decoder is needed. A raster logo
// has to be sampled by eye or by a tool this skill does not ship — say so rather than guessing.
function accentFromLogo(logoPath) {
  const file = resolve(logoPath);
  if (!existsSync(file)) {
    console.error(`--from-logo: no file at ${file}`);
    process.exit(2);
  }
  if (extname(file).toLowerCase() !== ".svg") {
    console.error(
      `--from-logo reads SVG only (${extname(file) || "no extension"} given).\n` +
      `  Open the raster logo, pick the brand colour, and pass it as --accent "#rrggbb".`);
    process.exit(2);
  }
  const markup = readFileSync(file, "utf8");
  const candidates = [...markup.matchAll(/(?:fill|stroke|stop-color)\s*[:=]\s*["']?(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g)]
    .map((match) => parseColor(match[1]))
    .filter((color) => color && color.alpha !== 0);
  const ranked = candidates
    .map((color) => ({ color, hsl: toHsl(color) }))
    .filter((entry) => entry.hsl.saturation > 0.15 && entry.hsl.lightness > 0.08 && entry.hsl.lightness < 0.92)
    .sort((first, second) => second.hsl.saturation - first.hsl.saturation);
  if (!ranked.length) {
    console.error(
      `--from-logo: ${file} has no saturated colour (it is probably monochrome, or paints via\n` +
      `  currentColor). Pass the brand colour as --accent "#rrggbb".`);
    process.exit(2);
  }
  return ranked[0].color;
}

const accent = options["from-logo"]
  ? accentFromLogo(options["from-logo"])
  : parseColor(options.accent);
if (!accent) {
  console.error(
    'give the brand colour: --accent "#2f6df6"  (or --from-logo ./logo.svg for an SVG mark)');
  process.exit(2);
}

// The neutrals are not grey. They carry a fraction of the accent's hue — a "tinted neutral" — so
// the canvas, the cards and the ink belong to the same family as the highlighter. Fully grey
// neutrals next to a saturated bar are what makes a recoloured template look recoloured.
const MOODS = {
  tinted: { saturation: 0.09 },
  warm: { saturation: 0.11, hue: 34 },
  cool: { saturation: 0.07, hue: 214 },
  mono: { saturation: 0 },
};
const mood = MOODS[options.mood];
if (!mood) {
  console.error(`--mood must be one of: ${Object.keys(MOODS).join(", ")}`);
  process.exit(2);
}

const accentHsl = toHsl(accent);
const neutralHue = mood.hue ?? accentHsl.hue;
const neutral = (lightness, saturationScale = 1) =>
  fromHsl({ hue: neutralHue, saturation: mood.saturation * saturationScale, lightness });

const dark = options.dark;
let card = neutral(dark ? 0.17 : 0.975, dark ? 1.4 : 1);
let bg = canvasFromCard(card, dark ? 0.06 : 0.055);
let ink = fromHsl({
  hue: neutralHue,
  saturation: Math.min(accentHsl.saturation, 0.3) * (mood.saturation === 0 ? 0 : 1),
  lightness: dark ? 0.95 : 0.08,
});
let highlight = highlighterFromAccent(accent, { dark }).map((stop) => parseColor(stop));

// Secondary ink is the primary mixed toward the canvas, and how far is not a free choice: too far
// and it drops under the 4.5:1 this design wants for it. Take the softest mix that still clears.
const secondaryInk = (primary, canvas) => {
  for (let weight = 0.42; weight > 0.24; weight -= 0.02) {
    const candidate = mix(primary, canvas, weight);
    if (contrastRatio(candidate, canvas) >= 4.5) return candidate;
  }
  return mix(primary, canvas, 0.24);
};
let ink2 = secondaryInk(ink, bg);

// Repair rather than report. Every failure here has one direction that fixes it, so walk that
// direction until the bar clears — an unusually light accent, or a --mood that tints the neutrals
// far enough to eat the contrast, otherwise lands the user with a palette and no way forward.
const step = dark ? 0.02 : -0.02;
const repairs = [];
for (let attempt = 0; attempt < 24; attempt += 1) {
  const audit = paletteChecks({ bg, ink, ink2, card, highlight });
  if (!audit.errors.length) break;
  const failing = audit.rows.filter((row) => row.verdict === "FAIL").map((row) => row.label);

  if (failing.some((label) => label.startsWith("ink on"))) {
    const inkHsl = toHsl(ink);
    ink = fromHsl({ ...inkHsl, lightness: Math.max(0, Math.min(1, inkHsl.lightness + step)) });
    ink2 = secondaryInk(ink, bg);
    repairs.push("pushed the ink further from its backgrounds");
  }
  if (failing.includes("secondary ink on canvas")) {
    ink2 = mix(ink, bg, 0.24);
    repairs.push("brought the secondary ink closer to the primary");
  }
  if (failing.some((label) => label.startsWith("ink on highlight"))) {
    highlight = highlight.map((stop) => {
      const stopHsl = toHsl(stop);
      return fromHsl({ ...stopHsl, lightness: Math.max(0, Math.min(1, stopHsl.lightness - step)) });
    });
    repairs.push("moved the highlighter away from the ink");
  }
  if (failing.includes("card against canvas")) {
    bg = canvasFromCard(card, 0.055 + 0.02 * (attempt + 1));
    ink2 = secondaryInk(ink, bg);
    repairs.push("deepened the canvas so the window keeps an edge");
  }
}

const audit = paletteChecks({ bg, ink, ink2, card, highlight });

const fontName = options.font;
const brand = {
  name: options.name || "Untitled brand",
  language: options.language || "en",
  colors: {
    bg: toHex(bg),
    ink: toHex(ink),
    ink2: toHex(ink2),
    card: toHex(card),
    highlight: highlight.map(toHex),
    dot: rgbaString(ink, dark ? ".16" : ".10"),
  },
  font: {
    sans: fontName
      ? `"${fontName}",-apple-system,system-ui,"Segoe UI",Arial,sans-serif`
      : `-apple-system,system-ui,"Segoe UI","Helvetica Neue",Arial,sans-serif`,
  },
  ...(options.logo ? { logo: { path: options.logo } } : {}),
  generatedFrom: {
    accent: toHex(accent),
    mood: options.mood,
    scheme: dark ? "dark" : "light",
    note: "Derived from one accent colour — relationships are checked, taste is not. Look at it with preview-brand.mjs before building on it.",
    ...(repairs.length ? { repairs: [...new Set(repairs)] } : {}),
  },
};

const outFile = resolve(options.out);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(brand, null, 2)}\n`);

console.log(`\n  ${brand.name} · ${dark ? "dark" : "light"} · mood "${options.mood}" · accent ${toHex(accent)}\n`);
printPaletteTable(audit.rows);
if (repairs.length) {
  console.log("\n" + [...new Set(repairs)].map((line) => `  · ${line}`).join("\n"));
}
if (audit.warnings.length) console.log("\n" + audit.warnings.map((line) => `  ! ${line}`).join("\n"));
if (audit.errors.length) {
  console.error("\n" + audit.errors.map((line) => `  ✗ ${line}`).join("\n") +
    `\n\n  Written anyway so you can edit it, but apply-brand.mjs will refuse it as it stands.` +
    `\n  Usually the accent is too pale to carry a palette — try a deeper one.\n`);
}

const shown = relative(process.cwd(), outFile) || outFile;
console.log(`\n  wrote ${shown.length < outFile.length ? shown : outFile}`);
console.log(
  `  Look at it, then apply it:\n` +
  `    node <skill>/scripts/preview-brand.mjs . --brand ${options.out}   # a page you can open\n` +
  `    node <skill>/scripts/apply-brand.mjs . --brand ${options.out}\n`);
process.exit(audit.errors.length ? 1 : 0);
