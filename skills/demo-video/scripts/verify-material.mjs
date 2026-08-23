#!/usr/bin/env node
// Material verification: does each spotlight actually SHOW its subject, unobstructed?
//
//   node verify-material.mjs <projectDir> [snapshotsDir]
//
// The audit checks a composition's structure and crop-spots.mjs renders crops for a human
// to read. Neither catches the two defects that a reviewer notices immediately, because
// both are about the RELATIONSHIP between a rect and the pixels around it:
//
//   M1. a spotlight whose edge sits on (or inside) its subject's ink — the box "cuts the
//       edges of what we want to show". Measured on the SOURCE asset, where there is no
//       scrim and no dim, so the signal is clean: clearance = distance from each edge to
//       the nearest ink, plus whether that ink CONTINUES past the edge.
//   M2. an overlay card parked on top of the very thing the beat is about. The card is
//       bottom-left and opaque; a composer, a chat bubble or a highlighted phrase in the
//       lower half of the frame ends up behind it. Pure geometry once the card is measured.
//
// Both shipped in the guardrails build: the review-dialog spotlight sliced its own title
// (0px clearance, 97% of the edge had ink crossing it), five more spotlights sat at 0-2px,
// and the "live highlighting" card covered ~25% of the composer whose highlight was the
// entire point of the beat.
//
// A beat's REGION OF INTEREST is its spotlight's rect, or `data-roi="x,y,w,h"` in SOURCE
// pixels for a beat with no spotlight (the typing beat's composer). A beat with neither is
// reported as unverifiable rather than skipped silently (pitfalls #15).
//
// Exit 1 on any ERROR, 2 if a check could not run — a missing snapshot, a missing source
// asset, unreadable geometry, or a beat with no declared subject. "Could not verify" must
// never share an exit code with "verified": a project whose assets are all absent used to
// report 0 errors and exit 0, which reads as a pass.
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const dir = process.argv[2] || '.';
const snapDir = process.argv[3] || join(dir, 'snapshots');
const FFMPEG = process.env.HYPERFRAMES_FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.HYPERFRAMES_FFPROBE_PATH || 'ffprobe';
const CLI = process.env.HYPERFRAMES_CLI ?? '$HYPERFRAMES_CLI';

const htmlPath = join(dir, 'index.html');
const html = readFileSync(htmlPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const htmlMtime = statSync(htmlPath).mtimeMs;
const errors = [], warns = [], notes = [];
const E = (m) => errors.push(m), W = (m) => warns.push(m), N = (m) => notes.push(m);

// Minimum breathing room between a spotlight edge and its subject's ink, in SOURCE px.
// Below MIN_CLEAR the 2px white spot border lands on antialiased glyph edges and reads as
// clipped even when no pixel is strictly lost; 0-2px with ink continuing outside IS a cut.
const MIN_CLEAR = 6, COMFY_CLEAR = 10, INK = 45;

const cssBlock = (sel) => html.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

// The shipped template sizes everything as a ratio of the frame — `calc(var(--h) * .059)` — so a
// parser that only understands literal pixels reads NaN for every box. NaN then loses every
// comparison below, and a verifier that answers "no problems found" to a question it never asked
// is worse than one that fails: the run this was found in reported success on unreadable geometry.
const ROOT_VARS = new Map();
for (const [, name, value] of cssBlock(':root').matchAll(/(--[\w-]+)\s*:\s*(-?[\d.]+)px/g)) {
  ROOT_VARS.set(name, +value);
}
const cssValue = (raw) => {
  const text = raw.trim();
  let m = /^(-?[\d.]+)px$/.exec(text);
  if (m) return +m[1];
  if (/^-?0$/.test(text)) return 0;
  m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(text);
  if (m) return ROOT_VARS.has(m[1]) ? ROOT_VARS.get(m[1]) : NaN;
  m = /^calc\(\s*var\(\s*(--[\w-]+)\s*\)\s*\*\s*(-?[\d.]+)\s*\)$/.exec(text);
  if (m) return ROOT_VARS.has(m[1]) ? ROOT_VARS.get(m[1]) * +m[2] : NaN;
  return NaN;
};
const cssRaw = (blk, prop) =>
  blk.match(new RegExp(`(?:^|[;{])\\s*${prop}\\s*:\\s*([^;}]+)`))?.[1];
const cssPx = (blk, prop) => {
  const raw = cssRaw(blk, prop);
  if (raw !== undefined) return cssValue(raw);
  // `inset: 0` is the shorthand the full-bleed default uses; it sets all four edges at once.
  const inset = cssRaw(blk, 'inset');
  if (inset !== undefined && ['left', 'top', 'right', 'bottom'].includes(prop)) {
    const parts = inset.trim().split(/\s+/).map(cssValue);
    if (parts.length === 1) return parts[0];
    const [top, right = top, bottom = top, left = right] = parts;
    return { top, right, bottom, left }[prop];
  }
  return NaN;
};
const winCss = cssBlock('.win'), scrimCss = cssBlock('.scrim'), ovCss = cssBlock('.ov');
const WIN = { left: cssPx(winCss,'left'), top: cssPx(winCss,'top'),
              w: cssPx(winCss,'width'), h: cssPx(winCss,'height') };
const SCRIM = { left: cssPx(scrimCss,'left') || WIN.left, top: cssPx(scrimCss,'top') || WIN.top };
const OV = { left: cssPx(ovCss,'left'), bottom: cssPx(ovCss,'bottom') };
const COMP_W = +(html.match(/data-width="([\d.]+)"/)?.[1] ?? 1920);
const COMP_H = +(html.match(/data-height="([\d.]+)"/)?.[1] ?? 1080);

// ── parse timed elements ───────────────────────────────────────────────────
const clips = [];
for (const m of html.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*?\bdata-start="([\d.]+)"[^>]*>/g)) {
  const tag = m[0];
  const attr = (n) => tag.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1];
  if (attr('data-composition-id') != null) continue;
  const dur = +(attr('data-duration') ?? NaN);
  clips.push({ tag: m[1].toLowerCase(), id: attr('id') ?? '', cls: attr('class') ?? '',
               src: attr('src') ?? '', roi: attr('data-roi') ?? '',
               start: +m[2], dur, end: +m[2] + dur, index: m.index });
}
const beats  = clips.filter((c) => c.cls.includes('win'));
if (!beats.length) { console.error('no beats found — is this a demo-video project?'); process.exit(2); }

// bound a child lookup to ONE clip's markup (same reason as audit-composition.mjs)
const segmentFor = (id) => {
  const from = html.indexOf(`id="${id}"`);
  if (from < 0) return '';
  const tagEnd = html.indexOf('>', from);
  const off = html.slice(tagEnd).search(/\bdata-start\s*=/);
  if (off < 0) return html.slice(from);
  const cut = html.lastIndexOf('<', tagEnd + off);
  return html.slice(from, cut > from ? cut : tagEnd + off);
};

// A caption card is any timed element that is not a beat, a scrim or a title card — EXCEPT a
// click-pulse layer. The pulse wrapper is a bare `<div class="clip">` holding a `.pulse`, and
// it sits ON the click point BY DESIGN, so treating it as an opaque card made every
// bottom-left spotlight report "pu_bXX covers 50% of what bXX is about" — a false positive
// indistinguishable from the real defect. (Wrapping pulses in `.scrim` also fixes it and
// clips them to the window's rounded corner; this guard catches the ones that are not.)
// A click pulse is neither: not a caption card (it is a transparent ring, and it sits ON the
// click point by design) and not a spotlight scrim (it has no `.spot` rect to frame). Reported
// as either, it produces a false finding that looks exactly like a real one — as a card,
// "pu_bXX covers 50% of what bXX is about" on every bottom-left spotlight; as a scrim,
// "no readable .spot rect". Compositions may wrap pulses in `.scrim` to clip them to the
// window's rounded corner, so both filters need this guard.
const isPulseLayer = (id) => /class="[^"]*\bpulse\b/.test(segmentFor(id));
const scrims = clips.filter((c) => c.cls.includes('scrim') && !isPulseLayer(c.id));
const cards = clips.filter((c) =>
  !c.cls.includes('win') && !c.cls.includes('scrim') && !c.cls.includes('card') &&
  !isPulseLayer(c.id));

// ── pixel helpers: read a region as raw bytes via ffmpeg (no image lib needed) ──
const imageSize = (p) => {
  const out = execFileSync(FFPROBE, ['-v','error','-select_streams','v:0',
    '-show_entries','stream=width,height','-of','csv=p=0', p]).toString().trim().split(',');
  return { w: +out[0], h: +out[1] };
};
const readGray = (p, x, y, w, h) => {
  const buf = execFileSync(FFMPEG, ['-v','error','-i',p,'-vf',`crop=${w}:${h}:${x}:${y}`,
    '-frames:v','1','-f','rawvideo','-pix_fmt','gray','-'], { maxBuffer: 1 << 28 });
  return { buf, w, h, at: (cx, cy) => buf[cy * w + cx] };
};
const readRgb = (p, x, y, w, h) => {
  const buf = execFileSync(FFMPEG, ['-v','error','-i',p,'-vf',`crop=${w}:${h}:${x}:${y}`,
    '-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'], { maxBuffer: 1 << 28 });
  return { buf, w, h, at: (cx, cy) => { const i = (cy * w + cx) * 3; return [buf[i], buf[i+1], buf[i+2]]; } };
};

// ── snapshots (fresh only — a stale one shows a previous timeline) ──────────
const snaps = existsSync(snapDir)
  ? readdirSync(snapDir).map((f) => { const t = f.match(/-at-([\d.]+)s\.png$/); return t ? { f, t: +t[1] } : null; })
      .filter(Boolean).filter((x) => statSync(join(snapDir, x.f)).mtimeMs >= htmlMtime)
  : [];
const snapNear = (t) => snaps.map((s) => ({ ...s, d: Math.abs(s.t - t) })).sort((a,b) => a.d - b.d)
                             .filter((s) => s.d <= 0.9)[0] ?? null;
const missing = [];        // snapshot times a card check needs before it can decide
const unverified = [];     // checks that could not run at all — never a silent pass
const U = (m) => unverified.push(m);

// Every geometry check below multiplies and compares these. NaN loses every comparison silently,
// so an unreadable box has to be said out loud here or the whole file reports a clean pass on
// numbers it never had.
for (const [label, value] of [
  ['.win left', WIN.left], ['.win top', WIN.top], ['.win width', WIN.w], ['.win height', WIN.h],
  ['.ov left', OV.left], ['.ov bottom', OV.bottom],
]) {
  if (!Number.isFinite(value)) {
    U(`${label} in index.html is not a number this script can read. It understands `
      + `<n>px, 0, var(--x) and calc(var(--x) * <n>) against the :root variables. `
      + `Every spotlight and card check that needs it was skipped.`);
  }
}

// ── the source asset behind a beat, and its scale into the window ───────────
const assetFor = (beat) => {
  if (!beat.src) return null;
  const p = join(dir, beat.src);
  if (!existsSync(p)) return null;
  const { w, h } = imageSize(p);
  return { path: p, w, h, scale: WIN.w / w };
};

// spot rect (scrim-local px) for a scrim
const spotOf = (scrim) => {
  const seg = segmentFor(scrim.id);
  const tag = seg.match(/<[a-zA-Z][\w-]*\b[^>]*\bclass="[^"]*\bspot\b[^"]*"[^>]*>/)?.[0] ?? '';
  const style = tag.match(/\bstyle="([^"]*)"/)?.[1] ?? '';
  const p = (n) => cssPx(';' + style, n);
  const r = { left: p('left'), top: p('top'), w: p('width'), h: p('height') };
  return [r.left, r.top, r.w, r.h].every(Number.isFinite) ? r : null;
};

// the beat a spotlight settles over (spot() ramps: settled = [start+1.0, end-0.6])
const hostBeat = (s) => {
  const a = s.start + 1.0, b = s.end - 0.6;
  const inside = beats.filter((x) => a >= x.start - 0.05 && b <= x.end + 0.05);
  return inside[inside.length - 1] ?? null;
};

// ── M1: spotlight clearance, measured on the source asset ──────────────────
console.log('M1 — spotlight clearance (measured on the source asset, in source px)\n');
const roiByBeat = new Map();
for (const s of scrims) {
  const spot = spotOf(s);
  const host = hostBeat(s);
  if (!spot) { U(`${s.id}: no readable .spot rect — cannot verify its framing.`); continue; }
  // composition coords, for M2
  const comp = { x: SCRIM.left + spot.left, y: SCRIM.top + spot.top, w: spot.w, h: spot.h };
  if (host) roiByBeat.set(host.id, { ...comp, from: s.id });
  if (!host) { W(`${s.id}: settles over no single clip — audit rule 3 covers this; skipping framing check.`); continue; }
  const asset = assetFor(host);
  if (!asset) { U(`${s.id}: host ${host.id} has no readable still asset (${host.src || 'none'}) — framing unverified${host.tag === 'video' ? ' (video beat: check a extracted frame by hand)' : ''}.`); continue; }

  // spot -> source px
  const sx = Math.round(spot.left / asset.scale), sy = Math.round(spot.top / asset.scale);
  const sw = Math.round(spot.w / asset.scale), sh = Math.round(spot.h / asset.scale);
  const P = 45;
  const rx = Math.max(0, sx - P), ry = Math.max(0, sy - P);
  const rw = Math.min(asset.w - rx, sw + 2 * P), rh = Math.min(asset.h - ry, sh + 2 * P);
  const img = readGray(asset.path, rx, ry, rw, rh);
  let bg = 0;
  for (let i = 0; i < img.buf.length; i++) if (img.buf[i] > bg) bg = img.buf[i];
  const isInk = (x, y) => x >= 0 && y >= 0 && x < rw && y < rh && img.at(x, y) < bg - INK;
  const lx0 = sx - rx, ly0 = sy - ry, lx1 = lx0 + sw, ly1 = ly0 + sh;

  const edges = [
    ['left',   (d) => ({ fixed: lx0 + d, vertical: true })],
    ['right',  (d) => ({ fixed: lx1 - d, vertical: true })],
    ['top',    (d) => ({ fixed: ly0 + d, vertical: false })],
    ['bottom', (d) => ({ fixed: ly1 - d, vertical: false })],
  ];
  const findings = [];
  for (const [name, at] of edges) {
    const scanV = () => { const a = []; for (let y = ly0 + 2; y < ly1 - 2; y++) a.push(y); return a; };
    const scanH = () => { const a = []; for (let x = lx0 + 2; x < lx1 - 2; x++) a.push(x); return a; };
    const probe = (d) => {
      const { fixed, vertical } = at(d);
      return vertical ? scanV().some((y) => isInk(fixed, y)) : scanH().some((x) => isInk(x, fixed));
    };
    let clear = null;
    for (let d = 0; d <= 40; d++) if (probe(d)) { clear = d; break; }
    // does the ink CONTINUE past the edge? (measured 1..3px outside)
    const line = at(0);
    const scan = line.vertical ? scanV() : scanH();
    const outward = (name === 'left' || name === 'top') ? -1 : +1;
    let crossing = 0;
    for (const c of scan) {
      const hit = [1, 2, 3].some((d) => {
        const f = line.fixed + outward * d;
        return line.vertical ? isInk(f, c) : isInk(c, f);
      });
      if (hit) crossing++;
    }
    const outFrac = crossing / Math.max(1, scan.length);
    findings.push({ name, clear, outFrac });
  }
  const worst = findings.filter((f) => f.clear !== null && f.clear < COMFY_CLEAR);
  const label = `${s.id} (over ${host.id}, ${host.src.replace(/^assets\//,'')})`;
  if (!worst.length) {
    console.log(`  ok    ${label} — all edges ≥ ${COMFY_CLEAR}px clear`);
  } else {
    const parts = worst.map((f) => `${f.name} ${f.clear}px${f.outFrac > 0.02 ? ` (${(f.outFrac*100).toFixed(0)}% ink crossing)` : ''}`);
    const cuts = worst.filter((f) => f.clear <= 2 && f.outFrac > 0.02);
    const tight = worst.filter((f) => f.clear < MIN_CLEAR && !cuts.includes(f));
    console.log(`  ${cuts.length ? 'CUT ' : 'tight'}  ${label} — ${parts.join(', ')}`);
    if (cuts.length) {
      E(`${s.id}: the ${cuts.map((f) => f.name).join(' and ')} edge${cuts.length > 1 ? 's' : ''} cut${cuts.length > 1 ? '' : 's'} through the subject ` +
        `(0-2px clearance and the ink continues past the edge). Grow the rect to include what it slices, ` +
        `or move it to the control you actually mean. Source-px rect is ${sx},${sy},${sw},${sh}.`);
    } else if (tight.length) {
      E(`${s.id}: ${tight.map((f) => `${f.name} edge only ${f.clear}px from the content`).join('; ')} ` +
        `— under ${MIN_CLEAR}px the 2px spot border lands on the glyph edges and reads as clipped. ` +
        `Pad the rect (source-px rect is ${sx},${sy},${sw},${sh}).`);
    } else {
      W(`${s.id}: ${parts.join(', ')} — under ${COMFY_CLEAR}px looks cramped; consider padding.`);
    }
  }
}

// ── M2: does an overlay card sit on the region of interest? ────────────────
console.log('\nM2 — overlay card vs. region of interest\n');
// The card is opaque, anchored at .ov{left,bottom}. Walk out from its known bottom-left
// corner in a snapshot to measure the size its text produced.
// A beat whose subject sits low in the frame may legitimately move its card to the top
// (`.ov.at-top`) — not covering the subject outranks the same-corner rule.
const OV_TOP = cssPx(cssBlock('.ov.at-top') || cssBlock('.at-top'), 'top');
// An app whose persistent chrome owns the bottom-left corner (a left-edge icon rail, say)
// needs cards on the right for a whole class of beats. Model that anchor too — before this,
// a right-anchored card was silently measured as if it were still at OV.left, so it was
// reported as covering subjects it was nowhere near and no edit could satisfy the check.
const OV_RIGHT = cssPx(cssBlock('.ov.at-right') || cssBlock('.at-right'), 'right');
// Any other `.ov` modifier moves the card somewhere this script does not model. Say so
// instead of returning a confidently wrong box.
const KNOWN_OV_VARIANTS = new Set(['ov', 'at-top', 'at-right']);

// The card's HEIGHT is analytic and exact; its WIDTH needs pixels.
//
// Do NOT try to segment the card by colour alone: the card fill (#fcfaf6) and the product's
// own light background (Warm Linen #f9f6f2) differ by 3 per channel, so over an UNDIMMED
// window the walk runs straight off the card and reports nonsense (measured 66x619 for a
// 826x203 card). It only works where a spotlight has dimmed the window behind it.
//
// So: derive y from CSS + the card's own box model, and only measure width when the
// y-ranges actually overlap — which is the only case where width can change the verdict.
// Constants calibrated against six cards measured over dimmed windows (all 203px at 2 head
// lines): padTop 26 + kickerLineBox 22.8 + kickerMargin 16 + n*(52*1.04) + padBottom 30.
const cardHeight = (card) => {
  const seg = segmentFor(card.id);
  const head = seg.match(/class="[^"]*\bhead\b[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
  const lines = Math.max(1, head.split(/<br\s*\/?>/i).length);
  return 94.8 + 54.08 * lines;
};
const ovClassesOf = (card) => {
  const cls = segmentFor(card.id).match(/class="([^"]*\bov\b[^"]*)"/)?.[1] ?? '';
  return cls.trim().split(/\s+/).filter(Boolean);
};
const cardBox = (card, snapFile) => {
  const classes = ovClassesOf(card);
  const unknown = classes.filter((c) => !KNOWN_OV_VARIANTS.has(c));
  const atTop = classes.includes('at-top');
  const atRight = classes.includes('at-right');
  const h = cardHeight(card);
  const y = atTop ? OV_TOP : COMP_H - OV.bottom - h;
  return {
    y, h, snapFile, unknown,
    anchorX: atRight ? 'right' : 'left',
    anchor: `${atTop ? 'top' : 'bottom'}-${atRight ? 'right' : 'left'}`,
    // x is only final once the width is known: a right-anchored card grows leftwards.
    x: OV.left,
  };
};
/** The card's real rect, once its width has been measured or bounded. */
const placed = (box, w) => ({
  ...box, w,
  x: box.anchorX === 'right' ? COMP_W - OV_RIGHT - w : OV.left,
});
// When the pixels can't give a width (no dim behind the card), bound it from the text. The
// bounds are deliberately loose per character — the point is a verdict that cannot be wrong,
// not an accurate width: if even the LOWER bound reaches the subject, the card covers it.
// Advance factors are per-em at weight 800; 0.38 is below any real Latin string, 0.62 above.
const cardWidthBounds = (card) => {
  const seg = segmentFor(card.id);
  const strip = (t) => t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const head = seg.match(/class="[^"]*\bhead\b[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
  const kick = strip(seg.match(/class="[^"]*\bkick\b[^"]*"[^>]*>([\s\S]*?)<\//)?.[1] ?? '');
  const headLines = head.split(/<br\s*\/?>/i).map(strip);
  const longest = Math.max(0, ...headLines.map((l) => l.length));
  const padX = 34 + 40;
  const est = (f) => Math.max(longest * 52 * f, kick.length * 21 * (f + 0.15)) + padX;
  return { min: est(0.38), max: est(0.62) };
};
const measureCardWidth = (box) => {
  if (!box.snapFile) return null;
  const p = join(snapDir, box.snapFile);
  const row = Math.round(box.y + box.h * 0.5);            // mid-height: always inside the card
  // Walk outward from the card's ANCHORED edge — left-anchored cards grow right, right-anchored
  // ones grow left, so the scan has to start at the edge whose position is known.
  const fromRight = box.anchorX === 'right';
  const anchorX = fromRight ? COMP_W - OV_RIGHT : OV.left;
  const regW = Math.min(fromRight ? anchorX : COMP_W - anchorX, 1200);
  const originX = fromRight ? anchorX - regW : anchorX;
  const img = readRgb(p, originX, row, regW, 1);
  const at = (i) => img.at(fromRight ? regW - 1 - i : i, 0);   // i = px from the anchored edge
  const ref = at(4);
  const same = (i) => { const c = at(i);
    return Math.abs(c[0]-ref[0]) < 7 && Math.abs(c[1]-ref[1]) < 7 && Math.abs(c[2]-ref[2]) < 7; };
  let far = 4, gap = 0;
  for (let i = 5; i < regW; i++) {
    if (same(i)) { far = i; gap = 0; }
    else if (++gap > 60) break;                            // 60px of non-fill = past the card
  }
  return far >= regW - 2 ? null : far + 1;                 // ran to the edge = unmeasurable
};
const overlap = (a, b) => {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
};
const roiOf = (beat) => {
  const spot = roiByBeat.get(beat.id);
  if (spot) return { ...spot, kind: `spotlight ${spot.from}` };
  if (beat.roi) {
    const nums = beat.roi.split(',').map(Number);
    const asset = assetFor(beat);
    const scale = asset ? asset.scale : WIN.w / COMP_W;
    if (nums.length === 4 && nums.every(Number.isFinite)) {
      return { x: WIN.left + nums[0] * scale, y: WIN.top + nums[1] * scale,
               w: nums[2] * scale, h: nums[3] * scale, kind: 'data-roi' };
    }
  }
  return null;
};
for (const beat of beats) {
  const roi = roiOf(beat);
  if (!roi) {
    U(`${beat.id}: no spotlight and no data-roi — what this beat is about is undeclared, so the ` +
      `card-occlusion check cannot run on it. Add data-roi="x,y,w,h" in SOURCE px.`);
    continue;
  }
  const active = cards.filter((c) => c.start < beat.end - 0.3 && c.end > beat.start + 0.3);
  for (const card of active) {
    const t = (Math.max(card.start, beat.start) + Math.min(card.end, beat.end)) / 2;
    const snap = snapNear(t);
    const box = cardBox(card, snap?.f);
    if (box.unknown.length) {
      E(`${card.id}: its .ov carries ${box.unknown.map((c) => `"${c}"`).join(', ')}, which this ` +
        `check does not model — it can only place cards anchored via .ov{left,bottom}, .ov.at-top ` +
        `and .ov.at-right, so any verdict here would be guesswork. Use a modelled anchor, or ` +
        `teach cardBox() where this variant puts the card.`);
      continue;
    }
    const roiTag = `roi(${roi.kind}) ${Math.round(roi.x)},${Math.round(roi.y)},${Math.round(roi.w)}x${Math.round(roi.h)}`;
    // vertical separation alone settles most beats, and needs no pixels at all
    const yOverlap = Math.min(box.y + box.h, roi.y + roi.h) - Math.max(box.y, roi.y);
    if (yOverlap <= 0) {
      console.log(`  ok    ${beat.id} / ${card.id} @${t.toFixed(1)}s  ${roiTag}  card ${box.anchor} y ${Math.round(box.y)}..${Math.round(box.y+box.h)} — clear of the roi vertically`);
      continue;
    }
    const measured = snap ? measureCardWidth(box) : null;
    let w = measured, how = 'measured';
    if (w == null) {
      // No dim behind the card, so colour can't find its right edge. Decide on bounds
      // instead of deferring to a human — this is the case that produced the defect.
      const b = cardWidthBounds(card);
      if (overlap(placed(box, b.min), roi) > 0) { w = b.min; how = `lower-bound ${Math.round(b.min)}px`; }
      else if (overlap(placed(box, b.max), roi) > 0) {
        if (!snap) missing.push(t);
        U(`${card.id}/${beat.id}: cannot decide — the card's width is unmeasurable here (no dim behind ` +
          `it) and its bounds straddle the subject (${Math.round(b.min)}-${Math.round(b.max)}px, subject ` +
          `starts at x=${Math.round(roi.x)}). Read the beat's snapshot by hand.`);
        console.log(`  ?     ${beat.id} / ${card.id} @${t.toFixed(1)}s  ${roiTag}  width ${Math.round(b.min)}-${Math.round(b.max)}px straddles it`);
        continue;
      } else {
        console.log(`  ok    ${beat.id} / ${card.id} @${t.toFixed(1)}s  ${roiTag}  card at most ${Math.round(b.max)}px wide — clear`);
        continue;
      }
    }
    const full = placed(box, w);
    const ov = overlap(full, roi);
    const pct = (ov / (roi.w * roi.h)) * 100;
    const line = `${beat.id} / ${card.id} @${t.toFixed(1)}s  ${roiTag}  card ${Math.round(full.x)},${Math.round(full.y)},${Math.round(w)}x${Math.round(full.h)} (${how})`;
    if (ov > 0) {
      console.log(`  COVER ${line} -> ${pct.toFixed(0)}% covered`);
      E(`${card.id} covers ${pct.toFixed(0)}% of what ${beat.id} is about (${roi.kind}). The card is opaque; ` +
        `the subject is behind it. Move it to a corner this beat leaves free (.ov.at-top / .ov.at-right), ` +
        `split the card at the cut if the approach and the result sit at opposite ends, shorten the copy, ` +
        `or reframe the subject.`);
    } else {
      console.log(`  ok    ${line}`);
    }
  }
}

// ── report ─────────────────────────────────────────────────────────────────
if (missing.length) {
  const list = [...new Set(missing.map((t) => t.toFixed(1)))].join(',');
  console.log(`\nneed snapshots for the card check:\n  node "${CLI}" snapshot ${dir} --at ${list}`);
}
console.log('');
for (const e of errors) console.log(`  ✗ ${e}\n`);
for (const u of unverified) console.log(`  ? ${u}\n`);
for (const w of warns)  console.log(`  ⚠ ${w}\n`);
for (const n of notes)  console.log(`  · ${n}`);
const tally = `${errors.length} error(s), ${unverified.length} unverified, ${warns.length} warning(s)`;
console.log(errors.length ? `${tally} — FIX BEFORE RENDERING`
  : unverified.length ? `${tally} — NOT VERIFIED. Every ? above is a check that did not run; supply the ` +
      `missing asset, snapshot or data-roi and re-run. Do not read this as a pass.`
  : `${tally}${warns.length ? ' — justify each one' : ' — material verified'}`);
process.exit(errors.length ? 1 : (missing.length || unverified.length ? 2 : 0));
