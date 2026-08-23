// Render a brand.json as a page you can look at, before anything is composed or rendered.
//
//   node <skill>/scripts/preview-brand.mjs [project-dir] [--brand ./brand.json]
//                                          [--out ./brand-preview.html]
//
// WHY THIS EXISTS. Contrast maths says a palette is legible. It does not say the highlighter
// looks like a highlighter, that the canvas reads as a surface rather than as dirt, or that the
// logo survives at 190px on it. Those are eye questions, and the only honest answer to them is a
// picture — which until now cost a full render, or at least a hyperframes snapshot of a
// composition that does not exist yet at the point the brand gets chosen.
//
// So this draws the four surfaces the design actually has, at true size, from the same token
// values apply-brand.mjs will write: the dot-grid canvas, the floating window with a spotlight,
// a caption card with a two-line headline on the highlighter bar, and the intro and outro cards.
// Same CSS as assets/template.html — if it looks wrong here it will look wrong in the video.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, join, dirname, relative, extname } from "path";
import {
  parseColor, toHex, rgbaString, paletteChecks, printPaletteTable, injectSvgAttributes,
} from "./brand-lib.mjs";

const argv = process.argv.slice(2);
const options = { brand: undefined, out: undefined };
const positional = [];
for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index];
  if (argument === "--brand" || argument === "--out") options[argument.slice(2)] = argv[++index];
  else positional.push(argument);
}
const projectDir = resolve(positional[0] || ".");
const brandFile = resolve(options.brand || join(projectDir, "brand.json"));
const outFile = resolve(options.out || join(projectDir, "brand-preview.html"));

if (!existsSync(brandFile)) {
  console.error(`no brand file at ${brandFile}`);
  process.exit(2);
}

const brand = JSON.parse(readFileSync(brandFile, "utf8"));
const colors = brand.colors || {};
const parsed = {};
for (const key of ["bg", "ink", "ink2", "card"]) {
  const color = parseColor(colors[key]);
  if (!color) {
    console.error(`colors.${key} is missing or not a color`);
    process.exit(1);
  }
  parsed[key] = color;
}
const highlightInput = colors.highlight ?? colors.hl;
const highlight = (Array.isArray(highlightInput) ? highlightInput : [highlightInput, highlightInput])
  .slice(0, 2).map((stop) => parseColor(stop));
if (!highlight[0] || !highlight[1]) {
  console.error("colors.highlight must be a color or a two-color gradient");
  process.exit(1);
}

const audit = paletteChecks({ ...parsed, highlight });
const dot = colors.dot || rgbaString(parsed.ink, ".10");
const fontStack = brand.font?.sans || `-apple-system,system-ui,"Segoe UI","Helvetica Neue",Arial,sans-serif`;

const PLACEHOLDER_LOGO = `<svg class="logo" viewBox="0 0 72 72" fill="none" stroke="currentColor" stroke-width="4">
  <rect x="6" y="6" width="60" height="60" rx="16" />
  <path d="M24 46V26l12 14 12-14v20" stroke-linecap="round" stroke-linejoin="round" /></svg>`;

function logoMarkup(style) {
  const logo = brand.logo || {};
  const attributes = { className: "logo", style };
  if (logo.inline) return injectSvgAttributes(logo.inline.trim(), attributes);
  const logoPath = logo.path ? resolve(dirname(brandFile), logo.path) : null;
  if (!logoPath || !existsSync(logoPath)) return injectSvgAttributes(PLACEHOLDER_LOGO, attributes);
  if (extname(logoPath).toLowerCase() === ".svg") {
    const source = readFileSync(logoPath, "utf8")
      .replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "").trim();
    return injectSvgAttributes(source, attributes);
  }
  const source = relative(dirname(outFile), logoPath).split("\\").join("/");
  return `<img class="logo"${style ? ` style="${style}"` : ""} src="${source}" alt="" />`;
}

const usingPlaceholderLogo = !brand.logo?.inline &&
  (!brand.logo?.path || !existsSync(resolve(dirname(brandFile), brand.logo.path)));
const introWidth = brand.logo?.width ?? 72;
const outroWidth = brand.logo?.outroWidth ?? 190;

// `.logo` sizes by WIDTH, so a wide wordmark at the square-mark default comes out a fraction of
// the height the design assumes and reads as broken next to a 128px title. The aspect is in the
// mark's own viewBox, so this is measurable rather than a matter of looking at it.
function wordmarkWarning() {
  if (usingPlaceholderLogo || brand.logo?.width) return null;
  const markup = brand.logo?.inline ??
    (extname(resolve(dirname(brandFile), brand.logo.path)).toLowerCase() === ".svg"
      ? readFileSync(resolve(dirname(brandFile), brand.logo.path), "utf8")
      : null);
  const viewBox = markup?.match(/viewBox\s*=\s*"([\d.\s-]+)"/i)?.[1].trim().split(/\s+/).map(Number);
  if (!viewBox || viewBox.length !== 4 || !viewBox[3]) return null;
  const aspect = viewBox[2] / viewBox[3];
  if (aspect < 2) return null;
  return `the mark is ${aspect.toFixed(1)}:1 — at the default 72px width it renders only ` +
    `${Math.round(72 / aspect)}px tall beside a 128px title. Set logo.width (and logo.outroWidth) in brand.json.`;
}
const wordmark = wordmarkWarning();

const swatches = [
  ["--bg", toHex(parsed.bg), "canvas"],
  ["--card", toHex(parsed.card), "cards + panels"],
  ["--ink", toHex(parsed.ink), "headlines, titles, mark"],
  ["--ink2", toHex(parsed.ink2), "secondary text"],
  ["--hl", toHex(highlight[0]), "highlighter, stop 1"],
  ["--hl2", toHex(highlight[1]), "highlighter, stop 2"],
];

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${brand.name || "brand"} — preview</title>
<style>
  :root { --bg:${toHex(parsed.bg)}; --ink:${toHex(parsed.ink)}; --ink2:${toHex(parsed.ink2)};
    --card:${toHex(parsed.card)}; --hl:${toHex(highlight[0])}; --hl2:${toHex(highlight[1])};
    --dot:${dot}; --sans:${fontStack}; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#2b2b2e; color:#e8e8ea; font-family:var(--sans); padding:40px 24px 80px; }
  .wrap { max-width:1000px; margin:0 auto; }
  h1 { font-size:22px; font-weight:700; margin-bottom:4px; }
  .meta { color:#9a9aa2; font-size:14px; margin-bottom:28px; }
  h2 { font-size:13px; font-weight:600; letter-spacing:.08em; text-transform:uppercase;
       color:#9a9aa2; margin:34px 0 12px; }
  /* the stage is the real 1920x1080 frame, scaled down as a whole so every size below is the
     size it will render at — never re-tuned to look right in the preview */
  .stage { width:960px; height:540px; position:relative; overflow:hidden; border-radius:10px; }
  .stage > .frame { position:absolute; top:0; left:0; width:1920px; height:1080px;
    transform:scale(.5); transform-origin:0 0; font-family:var(--sans);
    background-color:var(--bg);
    background-image:radial-gradient(circle, var(--dot) 1.5px, transparent 1.6px);
    background-size:27px 27px; background-position:-3px -3px; }
  .win { position:absolute; left:60px; top:72px; width:1800px; height:936px; border-radius:20px;
    background:var(--card); overflow:hidden;
    box-shadow:0 34px 80px rgba(38,34,26,.18), 0 8px 22px rgba(38,34,26,.10), inset 0 0 0 1px rgba(0,0,0,.05); }
  /* a stand-in for the app, so the window is not an empty rectangle */
  .app { position:absolute; inset:0; padding:54px 60px; color:var(--ink); }
  .app .bar { height:14px; border-radius:7px; background:var(--ink); opacity:.14; margin-bottom:22px; }
  .app .bar.short { width:38%; } .app .bar.mid { width:64%; } .app .bar.long { width:86%; }
  .app .tile { position:absolute; left:60px; top:300px; width:640px; height:260px; border-radius:16px;
    background:var(--bg); box-shadow:inset 0 0 0 1px rgba(0,0,0,.06); }
  .scrim { position:absolute; top:72px; left:60px; width:1800px; height:936px; border-radius:20px;
    overflow:hidden; pointer-events:none; }
  .spot { position:absolute; left:60px; top:300px; width:640px; height:260px; border-radius:14px;
    box-shadow:0 0 0 9999px rgba(24,22,16,.52), 0 0 0 2px rgba(255,255,255,.92), 0 16px 40px rgba(0,0,0,.28); }
  .ov { position:absolute; left:96px; bottom:118px; background:var(--card); border-radius:16px;
    padding:26px 40px 30px 34px; max-width:940px;
    background-image:radial-gradient(circle, rgba(0,0,0,.05) 1px, transparent 1.2px); background-size:18px 18px;
    box-shadow:0 26px 54px rgba(38,34,26,.16), 0 6px 16px rgba(38,34,26,.08), inset 0 0 0 1px rgba(0,0,0,.05); }
  .ov .head { display:inline; font-weight:800; font-size:38px; line-height:1.55; letter-spacing:-.01em;
    color:var(--ink); background:linear-gradient(90deg,var(--hl) 0%,var(--hl2) 100%);
    padding:0.06em 0.18em; border-radius:6px;
    -webkit-box-decoration-break:clone; box-decoration-break:clone; }
  .card { position:absolute; inset:0; display:grid; place-items:center; }
  .card .inner { text-align:center; }
  .logo { width:72px; margin:0 auto 34px; color:var(--ink); display:block; }
  .title { font-weight:850; font-size:128px; line-height:.98; letter-spacing:-.03em; color:var(--ink); }
  .row { display:flex; flex-direction:column; gap:16px; }
  .sw { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; }
  .sw div { border-radius:8px; padding:10px 12px; font-size:12px; background:#37373b; }
  .sw i { display:block; height:38px; border-radius:5px; margin-bottom:8px;
          box-shadow:inset 0 0 0 1px rgba(255,255,255,.14); font-style:normal; }
  .sw code { font-size:11px; color:#b9b9c2; }
  table { border-collapse:collapse; font-size:13px; width:100%; }
  td { padding:5px 10px 5px 0; border-bottom:1px solid #3a3a3f; }
  td.n { text-align:right; font-variant-numeric:tabular-nums; width:70px; }
  .ok { color:#7fd48a; } .thin { color:#e6c169; } .FAIL { color:#f08a7a; font-weight:700; }
  .loud { color:#e6c169; }
  .note { font-size:13px; color:#9a9aa2; margin-top:10px; line-height:1.6; }
</style></head>
<body><div class="wrap">
  <h1>${brand.name || "Untitled brand"}</h1>
  <div class="meta">${brandFile}${brand.generatedFrom
    ? ` · generated from ${brand.generatedFrom.accent}, mood "${brand.generatedFrom.mood}", ${brand.generatedFrom.scheme}`
    : brand.extractedFrom ? ` · extracted from ${brand.extractedFrom.url}` : ""}</div>

  <h2>A caption card over a spotlit window</h2>
  <div class="stage"><div class="frame">
    <div class="win"><div class="app">
      <div class="bar short"></div><div class="bar long"></div><div class="bar mid"></div>
      <div class="tile"></div>
    </div></div>
    <div class="scrim"><div class="spot"></div></div>
    <div class="ov"><div class="head">A headline that runs<br/>to a second line.</div></div>
  </div></div>

  <h2>Intro and outro</h2>
  <div class="row">
    <div class="stage"><div class="frame"><div class="card"><div class="inner">
      ${logoMarkup(`width:${introWidth}px`)}<div class="title">Feature</div>
    </div></div></div></div>
    <div class="stage"><div class="frame"><div class="card"><div class="inner">
      ${logoMarkup(`width:${outroWidth}px`)}
    </div></div></div></div>
  </div>
  ${usingPlaceholderLogo ? '<div class="note">⚠ No usable <code>logo</code> in brand.json — the placeholder mark is shown. Get the real file before you build anything.</div>' : ""}
  ${wordmark ? `<div class="note">⚠ ${wordmark}</div>` : ""}

  <h2>Tokens</h2>
  <div class="sw">${swatches.map(([token, value, role]) =>
    `<div><i style="background:${value}"></i><b>${token}</b><br/><code>${value} · ${role}</code></div>`).join("")}</div>

  <h2>Checks</h2>
  <table>${audit.rows.map((row) =>
    `<tr><td>${row.label}</td><td class="n">${row.ratio.toFixed(2)}</td><td class="${row.verdict}">${row.verdict}</td></tr>`).join("")}</table>
  <div class="note">Every surface above is drawn at its real size from the same values
    <code>apply-brand.mjs</code> writes into the composition — the frame is scaled as a whole, not
    re-tuned. What this cannot tell you: whether the type stack resolves on the rendering machine
    (verify that on a snapshot) and whether the brand is the right brand.</div>
</div></body></html>
`;

writeFileSync(outFile, page);

console.log(`\n  ${brand.name || "(unnamed)"}\n`);
printPaletteTable(audit.rows);
if (audit.warnings.length) console.log("\n" + audit.warnings.map((line) => `  ! ${line}`).join("\n"));
if (audit.errors.length) console.log("\n" + audit.errors.map((line) => `  ✗ ${line}`).join("\n"));
if (usingPlaceholderLogo) console.log("\n  ! no usable logo in brand.json — the preview shows the placeholder mark");
if (wordmark) console.log(`\n  ! ${wordmark}`);

const shown = relative(process.cwd(), outFile);
console.log(`\n  wrote ${shown && shown.length < outFile.length ? shown : outFile}`);
console.log(`  Open it, or serve the folder and open it in a browser pane:\n` +
  `    (cd ${dirname(outFile)} && python3 -m http.server 8802 --bind 127.0.0.1)\n`);
