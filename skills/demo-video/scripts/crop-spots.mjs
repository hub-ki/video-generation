#!/usr/bin/env node
// Zoomed per-spotlight crops from snapshots — the check that catches a spot edge slicing
// through a text line. A full-frame snapshot read reliably MISSES this: both bad spotlights
// of the German Workspaces remake passed a full-frame read and were caught by the user.
//
//   node crop-spots.mjs <projectDir> [snapshotsDir]     (default: <projectDir>/snapshots)
//
// For every scrim/spot in index.html it finds the freshest snapshot near the spotlight's
// SETTLED midpoint and writes snapshots/spot-crops/<id>.png (the rect + 60px context, 2x).
// Snapshots older than index.html are ignored — they show a previous timeline. If a needed
// snapshot is missing, it prints the exact `hyperframes snapshot --at` list to produce it.
//
// READ every crop: the spot edge must not slice a text line, and the rect must frame the
// intended control — not the paragraph next to it.
import { readFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const dir = process.argv[2] || '.';
const snapDir = process.argv[3] || join(dir, 'snapshots');
const FFMPEG = process.env.HYPERFRAMES_FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.HYPERFRAMES_FFPROBE_PATH || 'ffprobe';

const htmlPath = join(dir, 'index.html');
const html = readFileSync(htmlPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const htmlM = statSync(htmlPath).mtimeMs;

const compW = +(html.match(/data-width="([\d.]+)"/)?.[1] ?? 1920);
const cssProp = (blk, p) => +(blk.match(new RegExp(`(?:^|[;{])\\s*${p}\\s*:\\s*(-?[\\d.]+)px`))?.[1] ?? NaN);
const scrimCss = html.match(/\.scrim\s*\{([^}]*)\}/)?.[1] ?? '';
const SL = cssProp(scrimCss, 'left') || 0, ST = cssProp(scrimCss, 'top') || 0;

// every scrim + its spot rect (inline style, any property order)
const spots = [];
for (const m of html.matchAll(/<[a-zA-Z][\w-]*\b[^>]*\bclass="[^"]*\bscrim\b[^"]*"[^>]*>/g)) {
  const tag = m[0];
  const attr = (n) => tag.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1];
  const id = attr('id') ?? '?';
  const start = +(attr('data-start') ?? NaN), dur = +(attr('data-duration') ?? NaN);
  // Bound the .spot lookup to THIS scrim's own markup. A fixed char budget reads the next
  // scrim's child instead: a scrim with no .spot was given its neighbour's rect, so this
  // script emitted a confident crop at the wrong coordinates — worse than emitting none.
  const tagEnd = m.index + tag.length;
  const offset = html.slice(tagEnd).search(/\bdata-start\s*=/);
  const bound = offset < 0 ? html.length : Math.max(tagEnd, html.lastIndexOf('<', tagEnd + offset));
  const seg = html.slice(m.index, bound);
  const style = seg.match(/class="[^"]*\bspot\b[^"]*"[^>]*\bstyle="([^"]*)"/)?.[1]
             ?? seg.match(/\bstyle="([^"]*)"[^>]*class="[^"]*\bspot\b/)?.[1] ?? '';
  const p = (n) => cssProp(';' + style, n);
  if (![p('left'), p('top'), p('width'), p('height')].every(Number.isFinite)) {
    console.log(`  ${id}: couldn't read its spot rect — verify by eye.`);
    continue;
  }
  // settled window is [start+1.0, end-0.6] (spot() ramps); crop at its midpoint
  const mid = dur > 1.6 ? start + (dur + 0.4) / 2 : start + 1.0;
  spots.push({ id, mid, x: SL + p('left'), y: ST + p('top'), w: p('width'), h: p('height') });
}
if (!spots.length) { console.log('no scrim/spot elements found — nothing to crop.'); process.exit(0); }

const snaps = existsSync(snapDir)
  ? readdirSync(snapDir)
      .map((f) => { const t = f.match(/-at-([\d.]+)s\.png$/); return t ? { f, t: +t[1] } : null; })
      .filter(Boolean)
      .filter((x) => statSync(join(snapDir, x.f)).mtimeMs >= htmlM)   // stale = previous timeline
  : [];

const missing = [], jobs = [];
for (const s of spots) {
  const near = snaps.map((x) => ({ ...x, d: Math.abs(x.t - s.mid) })).sort((a, b) => a.d - b.d)[0];
  if (!near || near.d > 0.9) missing.push(s); else jobs.push({ s, snap: near });
}

if (jobs.length) {
  const outDir = join(snapDir, 'spot-crops');
  mkdirSync(outDir, { recursive: true });
  for (const { s, snap } of jobs) {
    const src = join(snapDir, snap.f);
    const sw = +execFileSync(FFPROBE, ['-v','error','-select_streams','v:0','-show_entries','stream=width','-of','csv=p=0', src]).toString().trim();
    const sf = sw / compW, pad = 60;
    const x = Math.max(0, Math.round((s.x - pad) * sf));
    const y = Math.max(0, Math.round((s.y - pad) * sf));
    const w = Math.round((s.w + 2 * pad) * sf), h = Math.round((s.h + 2 * pad) * sf);
    const out = join(outDir, `${s.id}.png`);
    execFileSync(FFMPEG, ['-y','-v','error','-i', src, '-vf', `crop=${w}:${h}:${x}:${y},scale=iw*2:-2`, out]);
    console.log(`  ${s.id}  settle-mid ${s.mid.toFixed(1)}s  <- ${snap.f}  -> ${out}`);
  }
  console.log(`\nREAD every crop above — a full-frame snapshot will not show a sliced text line.`);
}
if (missing.length) {
  // `hyperframes` is never on PATH — Phase 0 installs it to ~/.hyperframes-cli. Print the
  // form that actually runs, so the hint can be pasted instead of debugged.
  const cli = process.env.HYPERFRAMES_CLI ?? '$HYPERFRAMES_CLI';
  console.log(`\n${missing.length} spotlight(s) have no fresh snapshot within 0.9s of their settle midpoint:`);
  console.log(`  node "${cli}" snapshot ${dir} --at ${missing.map((s) => s.mid.toFixed(1)).join(',')}`);
  console.log(`run that, then re-run this script.`);
}
process.exit(missing.length ? 2 : 0);
