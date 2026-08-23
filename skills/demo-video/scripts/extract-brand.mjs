// Read a brand off a live website and write a brand.json the composition can consume.
//
//   node <skill>/scripts/extract-brand.mjs https://example.com [--out ./brand.json]
//                                          [--logo-dir ./assets] [--wait 2500] [--headed]
//
// WHY THIS EXISTS. "Use their brand" otherwise means eyeballing a screenshot, and a colour read
// off a downscaled screenshot is a guess (design-system.md → NEVER eyeball coordinates makes
// the same point about geometry). Computed styles are not a guess: this asks the page what it
// actually paints, weights each colour by the area it covers, and derives the four tokens the
// design needs from the two the site really has.
//
// It is a STARTING POINT, not an answer. It prints its candidates, writes them into brand.json,
// and expects a human to look before `apply-brand.mjs` writes them into the composition. A site
// with a dark hero and a light body has two truths and this picks one of them.

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, join, dirname, extname, relative } from "path";
import { createRequire } from "module";
import { pathToFileURL } from "url";
import {
  parseColor, toHex, toHsl, contrastRatio, relativeLuminance,
  mix, canvasFromCard, highlighterFromAccent, rgbaString,
} from "./brand-lib.mjs";

const argv = process.argv.slice(2);
const options = { out: "./brand.json", "logo-dir": "./assets", wait: "2500", headed: false };
const positional = [];
for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index];
  if (argument === "--headed") options.headed = true;
  else if (argument.startsWith("--")) options[argument.slice(2)] = argv[++index];
  else positional.push(argument);
}
const url = positional[0];
if (!url) {
  console.error("usage: node extract-brand.mjs <url> [--out ./brand.json] [--logo-dir ./assets]");
  process.exit(2);
}

// The capture rig installs playwright into <project>/capture, so a project that has already run
// setup-capture-env.sh needs no second install. Fall back to a plain resolve for anyone who has
// it globally or in the project root.
async function loadPlaywright() {
  // playwright is CommonJS, and dynamic-importing it by path hands back a namespace whose named
  // exports may be undefined — so always fall through to `.default`.
  const unwrap = (namespace) => namespace?.chromium ? namespace : namespace?.default;
  const candidates = [
    join(process.cwd(), "capture", "node_modules", "playwright", "index.js"),
    join(process.cwd(), "node_modules", "playwright", "index.js"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return unwrap(await import(pathToFileURL(candidate).href));
  }
  try {
    return unwrap(await import("playwright"));
  } catch {
    const require = createRequire(import.meta.url);
    try {
      return unwrap(await import(pathToFileURL(require.resolve("playwright")).href));
    } catch {
      console.error(
        "playwright is not installed here.\n" +
        "  bash <skill>/scripts/setup-capture-env.sh ./capture   # the rig this skill already uses\n" +
        // NOT `bunx playwright install`: it resolves its own Playwright version and downloads
        // that version's browser revision, so a differently pinned library then looks for a
        // revision nobody fetched and reports "Executable doesn't exist" right after a
        // successful install. Call the pinned CLI. See references/container-capture.md §3.
        "  (or `bun add playwright && node node_modules/playwright/cli.js install chromium`)");
      process.exit(2);
    }
  }
}

const playwright = await loadPlaywright();
if (!playwright?.chromium) {
  console.error("playwright resolved but exposes no chromium — check the install.");
  process.exit(2);
}
const { chromium } = playwright;
// CHROMIUM_EXECUTABLE_PATH covers a machine whose chromium was provisioned outside playwright
// (a preinstalled build, a distro package): playwright pins a build number and refuses to launch
// anything else, so without this the only fix is a second ~150MB download.
const browser = await chromium.launch({
  headless: !options.headed,
  // This script points a browser at a website nobody here controls — it is the FIRST thing in
  // the pipeline to parse hostile input, before the protected recorder ever starts. Playwright
  // defaults `chromiumSandbox` to false, so without this the renderer handling a stranger's
  // JavaScript has no process isolation at all. See references/container-capture.md §5 for the
  // non-root and seccomp requirements this depends on inside a container.
  chromiumSandbox: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

console.log(`\n  loading ${url} …`);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(Number(options.wait));

const observed = await page.evaluate(() => {
  const backgrounds = new Map();
  const inks = new Map();
  const accents = new Map();
  const fonts = new Map();
  const add = (map, key, weight) => map.set(key, (map.get(key) || 0) + weight);
  const opaque = (value) => value && !/^rgba\(.*,\s*0(\.0+)?\)$/.test(value) && value !== "transparent";

  for (const element of document.body.querySelectorAll("*")) {
    const box = element.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) continue;
    if (box.top > window.innerHeight * 3) continue;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) < 0.5) continue;

    if (opaque(style.backgroundColor) && !style.backgroundImage.includes("gradient")) {
      add(backgrounds, style.backgroundColor, box.width * box.height);
    }
    const text = [...element.childNodes]
      .filter((node) => node.nodeType === 3).map((node) => node.textContent.trim()).join("");
    if (text.length > 1) {
      add(inks, style.color, text.length * parseFloat(style.fontSize || "16"));
      add(fonts, style.fontFamily, text.length);
    }
    const tag = element.tagName.toLowerCase();
    const looksInteractive = tag === "button" || tag === "a" ||
      /(^|\s|-)(btn|button|cta|primary|badge|pill)(\s|-|$)/i.test(element.className?.toString?.() || "");
    if (looksInteractive) {
      // Kind matters more than area: a brand paints its accent as a button FILL, and the same
      // button's text colour is usually just white. An unstyled link's colour is the browser's
      // own blue, which outranks a real accent on area alone if the two are pooled together.
      const area = box.width * box.height + 1;
      if (opaque(style.backgroundColor)) add(accents, `background|${style.backgroundColor}`, area * 4);
      if (opaque(style.borderTopColor) && parseFloat(style.borderTopWidth) > 0) {
        add(accents, `border|${style.borderTopColor}`, area * 1.5);
      }
      if (opaque(style.color)) add(accents, `text|${style.color}`, area * 0.5);
    }
  }

  const headingFont = (() => {
    const heading = document.querySelector("h1, h2, [class*=headline], [class*=title]");
    return heading ? getComputedStyle(heading).fontFamily : null;
  })();

  const logoSelectors = [
    "header a[href='/'] svg", "header [class*=logo] svg", "header svg",
    "[class*=logo] svg", "a[aria-label*='ome'] svg",
    "header a[href='/'] img", "header [class*=logo] img", "header img",
    "[class*=logo] img", "img[alt*='ogo']",
  ];
  let logo = null;
  for (const selector of logoSelectors) {
    const node = document.querySelector(selector);
    if (!node) continue;
    const box = node.getBoundingClientRect();
    if (box.width < 12 || box.height < 8) continue;
    logo = node.tagName.toLowerCase() === "svg"
      ? { kind: "svg", markup: node.outerHTML, selector }
      : { kind: "img", source: node.currentSrc || node.src, selector };
    break;
  }

  const sort = (map) => [...map.entries()].sort((first, second) => second[1] - first[1]).slice(0, 8)
    .map(([value, weight]) => ({ value, weight: Math.round(weight) }));
  return {
    pageBackground: getComputedStyle(document.body).backgroundColor,
    backgrounds: sort(backgrounds), inks: sort(inks), accents: sort(accents), fonts: sort(fonts),
    headingFont, title: document.title, logo,
  };
});

async function saveLogo(logo) {
  if (!logo) return null;
  const logoDir = resolve(options["logo-dir"]);
  mkdirSync(logoDir, { recursive: true });
  if (logo.kind === "svg") {
    const file = join(logoDir, "brand-logo.svg");
    writeFileSync(file, `${logo.markup}\n`);
    return file;
  }
  try {
    const response = await context.request.get(new URL(logo.source, url).href);
    if (!response.ok()) return null;
    const suffix = extname(new URL(logo.source, url).pathname) || ".png";
    const file = join(logoDir, `brand-logo${suffix}`);
    writeFileSync(file, await response.body());
    return file;
  } catch {
    return null;
  }
}

const logoFile = await saveLogo(observed.logo ?? null);
await browser.close();

const parsedBackgrounds = observed.backgrounds
  .map((entry) => ({ ...entry, color: parseColor(entry.value) })).filter((entry) => entry.color);
const parsedInks = observed.inks
  .map((entry) => ({ ...entry, color: parseColor(entry.value) })).filter((entry) => entry.color);

const pageBackground = parseColor(observed.pageBackground) ||
  parsedBackgrounds[0]?.color || parseColor("#ffffff");
// The card is the surface the site puts its own content on — its dominant light background.
// Everything else is derived from it, so a site whose body is dark still yields a usable light
// card by falling back to white and saying so.
const lightBackgrounds = parsedBackgrounds.filter((entry) => relativeLuminance(entry.color) > 0.6);
const card = lightBackgrounds[0]?.color ||
  (relativeLuminance(pageBackground) > 0.6 ? pageBackground : parseColor("#ffffff"));
const canvas = canvasFromCard(card);

const inkCandidates = parsedInks
  .filter((entry) => contrastRatio(entry.color, card) >= 4.5)
  .sort((first, second) => relativeLuminance(first.color) - relativeLuminance(second.color));
const ink = inkCandidates[0]?.color || parseColor("#15110c");
const ink2 = parsedInks.find((entry) => {
  const ratio = contrastRatio(entry.color, card);
  return ratio >= 3 && ratio < contrastRatio(ink, card) - 1.5;
})?.color || mix(ink, canvas, 0.42);

// rgb(0,0,238) is the browser's own default link colour, not anybody's brand.
const UNSTYLED_LINK_BLUE = "rgb(0, 0, 238)";
const accentCandidates = observed.accents
  .map((entry) => {
    const [kind, ...rest] = entry.value.split("|");
    const value = rest.join("|");
    return { kind, value, weight: entry.weight, color: parseColor(value) };
  })
  .filter((entry) => entry.color && entry.value !== UNSTYLED_LINK_BLUE &&
    toHsl(entry.color).saturation > 0.25 &&
    relativeLuminance(entry.color) > 0.02 && relativeLuminance(entry.color) < 0.95);
const accent = accentCandidates[0]?.color || parseColor("#f2cf3f");
const highlight = highlighterFromAccent(accent);

const fontStack = (observed.headingFont || observed.fonts[0]?.value || "")
  .split(",").map((part) => part.trim()).filter(Boolean).slice(0, 3).join(",");

const brand = {
  name: observed.title?.split(/[|·—–-]/)[0].trim() || new URL(url).hostname,
  language: "en",
  colors: {
    bg: toHex(canvas),
    ink: toHex(ink),
    ink2: toHex(ink2),
    card: toHex(card),
    highlight,
    dot: rgbaString(ink, ".10"),
  },
  font: {
    sans: fontStack
      ? `${fontStack},-apple-system,system-ui,"Segoe UI",Arial,sans-serif`
      : `-apple-system,system-ui,"Segoe UI","Helvetica Neue",Arial,sans-serif`,
  },
  ...(logoFile ? { logo: { path: `./${relative(dirname(resolve(options.out)), logoFile).split("\\").join("/")}` } } : {}),
  extractedFrom: {
    url,
    note: "Candidates only — read them, then run apply-brand.mjs. The canvas is DERIVED from the card (darkened), never taken from the page, or the floating window has no edge.",
    accentUsedForHighlight: accentCandidates[0]?.value ?? null,
    backgroundCandidates: observed.backgrounds.map((entry) => entry.value),
    inkCandidates: observed.inks.map((entry) => entry.value),
    accentCandidates: accentCandidates.map((entry) => `${entry.value} (as ${entry.kind})`),
    fontCandidates: observed.fonts.map((entry) => entry.value),
    logoSelector: observed.logo?.selector ?? null,
  },
};

const outFile = resolve(options.out);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(brand, null, 2)}\n`);

console.log(`\n  ${brand.name}`);
console.log(`  canvas  ${brand.colors.bg}   (derived: card darkened, so the window has an edge)`);
console.log(`  card    ${brand.colors.card}`);
console.log(`  ink     ${brand.colors.ink}   ink2 ${brand.colors.ink2}`);
console.log(`  hilite  ${highlight[0]} → ${highlight[1]}   from accent ${accentCandidates[0]?.value ?? "(none found — default)"}`);
console.log(`  font    ${brand.font.sans}`);
console.log(`  logo    ${logoFile ? logoFile : "not found — set logo.path by hand"}`);
console.log(`\n  wrote ${outFile}`);
console.log(`  Read it, fix what the page got wrong, then:\n` +
  `    node <skill>/scripts/apply-brand.mjs . --brand ${options.out}\n`);
