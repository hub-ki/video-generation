#!/usr/bin/env node
// Pre-render audit for a demo-video composition.
//
//   node audit-composition.mjs <projectDir>
//
// Catches the class of defect that `hyperframes check`, snapshots AND pixel-diffs all miss,
// because each of those is individually happy while the video is wrong. Every rule here comes
// from a bug that actually shipped and had to be caught by a human watching the render:
//
//   0. every timed element must be parseable, and every beat wired  -> else the rest is vacuous
//   1. asset SHORTER than its data-duration          -> the clip freezes/blanks for the rest of
//      its window (longer is only a warning: the render truncates at data-duration, but the
//      pin-exact-frames discipline slipped, so confirm the in-window content is the intended cut)
//   2. a fade-out with no fade-in partner            -> picture dips to bare canvas ("to nothing")
//   3. a spotlight spanning more than one clip       -> it outlives its target and lights up nothing
//   4. a spotlight over a VIDEO clip                 -> the target can move or close under it
//   5. a spotlight covering a large area             -> it directs nothing and its edges cut text
//   6. a spotlight/card running past the outro start -> it composites over the logo
//   7. glyphs with no font coverage (e.g. (1)(2)(3)) -> silently render as a fallback box
//   8. kicker and headline sharing a word            -> reads as a stutter ("…ODER PER CHAT" +
//      "Oder sag einfach…" cost a round)
//   9. a still held >4.5s with no spotlight          -> "stays on the image too long" (a 4.6s
//      concept-image hold, after the same image in the previous clip, cost a round)
//  10. a >4.5s frozen stretch inside a video asset   -> dead air; a 5s static tail shipped and
//      read as a frozen clip (measured via ffmpeg freezedetect)
//
// Rule 0 is this audit auditing itself (pitfalls #15: a check that can't fail isn't a check).
// An earlier version matched `win("#b1",3.5,6.1)` but not `win("#b1", 3.5, 6.1)` — so on a real
// build every timeline lookup missed and rule 2 passed while testing nothing. Parsing is now
// whitespace/attribute-order/decimal tolerant, and anything it still can't account for is
// reported instead of skipped.
//
// Exit code 1 if any ERROR. Warnings are advisory but should be justified out loud.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename, resolve } from 'path';
import { execFileSync, spawnSync } from 'child_process';

const dir = process.argv[2] || '.';
// Strip HTML comments first: a commented-out clip or a sample `win(...)` call in a comment
// must not count as markup or as a timeline call.
const html = readFileSync(join(dir, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const FFPROBE = process.env.HYPERFRAMES_FFPROBE_PATH || 'ffprobe';
const FFMPEG = process.env.HYPERFRAMES_FFMPEG_PATH || 'ffmpeg';
const errors = [], warns = [];
const E = (m) => errors.push(m), W = (m) => warns.push(m);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── 0a. parse the timed elements (any attribute order, any tag) ────────────
const timedTags = [...html.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*?\bdata-start="([\d.]+)"[^>]*>/g)];
const declared = (html.match(/\bdata-start\s*=/g) || []).length;   // quote-agnostic on purpose
if (declared !== timedTags.length) {
  E(`${declared} data-start attributes in the file but only ${timedTags.length} parsed as tags — ` +
    `some timed elements are invisible to this audit (single-quoted attributes? unusual markup).`);
}
const clips = [];
let roots = 0;
for (const m of timedTags) {
  const t = m[0];
  const attr = (name) => t.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  if (attr('data-composition-id') != null) { roots++; continue; }   // the composition root, not a clip
  const c = { tag: m[1].toLowerCase(), id: attr('id') ?? '', cls: attr('class') ?? '', src: attr('src') ?? '',
              start: +m[2], dur: +(attr('data-duration') ?? NaN), track: +(attr('data-track-index') ?? NaN) };
  c.end = c.start + c.dur;
  if (!c.id || !Number.isFinite(c.dur)) {
    E(`unauditable timed element (needs id + data-duration): ${t.slice(0, 100)}`);
    continue;
  }
  clips.push(c);
}
if (!clips.length) { console.error('no timed clips found — is this a demo-video project?'); process.exit(2); }

const beats  = clips.filter((c) => c.cls.includes('win'));
const scrims = clips.filter((c) => c.cls.includes('scrim'));
const cards  = clips.filter((c) => !c.cls.includes('win') && !c.cls.includes('scrim') && !c.cls.includes('card'));
const outro  = clips.find((c) => c.id === 'outro');

// window rect, for measuring how much of it a spotlight covers
const winBlock = html.match(/\.win\s*\{([^}]*)\}/)?.[1] ?? '';
const WIN_W = +(winBlock.match(/\bwidth:\s*([\d.]+)px/)?.[1] ?? 1700);
const WIN_H = +(winBlock.match(/\bheight:\s*([\d.]+)px/)?.[1] ?? 885);

// whitespace-tolerant timeline-call lookup: matches win("#id", 3.5, 6.1) and win("#id",3.5,6.1)
const call = (fn, id) =>
  new RegExp(`\\b${fn}\\(\\s*["']#${esc(id)}["']\\s*,\\s*[\\d.]+\\s*,\\s*[\\d.]+\\s*\\)`).test(html);

// Bound a child lookup to ONE clip's own markup. Slicing to end-of-file (or a fixed char
// budget) silently reads the NEXT clip's children — both variants were live here: a scrim
// with no .spot child was reported as "covers 80% of the window" because it measured the
// next scrim's rect, and a card whose markup ran past 900 chars stopped being checked for
// the kicker/headline stutter at all and reported clean. Same failure mode as rule 0.
const segmentFor = (id) => {
  const from = html.indexOf(`id="${id}"`);
  if (from < 0) return '';
  const tagEnd = html.indexOf('>', from);            // end of this element's own opening tag
  if (tagEnd < 0) return html.slice(from);
  const offset = html.slice(tagEnd).search(/\bdata-start\s*=/);   // the NEXT timed element
  if (offset < 0) return html.slice(from);
  const cut = html.lastIndexOf('<', tagEnd + offset);            // back up to its tag start
  return html.slice(from, cut > from ? cut : tagEnd + offset);
};

// ── 0b. every beat must be wired through a helper this audit understands ───
const KNOWN = ['win', 'fadeInHardOut', 'hold', 'hardInFadeOut'];
for (const b of beats) {
  if (KNOWN.some((fn) => call(fn, b.id))) continue;
  if (new RegExp(`["']#${esc(b.id)}["']`).test(html)) {
    W(`${b.id}: animated by something other than the four known helpers ` +
      `(win/fadeInHardOut/hold/hardInFadeOut) — the fade-partner check can't see it; verify its cuts by eye.`);
  } else {
    W(`${b.id}: no timeline call found for it at all — it will sit at its CSS default opacity ` +
      `for its whole window. Wire it with win()/hold()/fadeInHardOut()/hardInFadeOut().`);
  }
}

// ── 1. declared duration must equal the real asset duration ────────────────
for (const b of beats) {
  if (!b.src || !b.src.endsWith('.mp4')) continue;
  const p = join(dir, b.src);
  if (!existsSync(p)) { E(`${b.id}: asset missing (${b.src})`); continue; }
  let real;
  try {
    real = +execFileSync(FFPROBE, ['-v','error','-show_entries','format=duration','-of','csv=p=0',p]).toString().trim();
  } catch { W(`${b.id}: could not probe ${b.src}`); continue; }
  const drift = real - b.dur;                    // tolerance: 1 frame @30fps
  if (drift < -0.034) {
    E(`${b.id}: declared ${b.dur.toFixed(2)}s but asset is only ${real.toFixed(3)}s — the clip ` +
      `freezes/blanks for the last ${(-drift).toFixed(3)}s of its window. Pin exact frame counts when cutting.`);
  } else if (drift > 0.034) {
    W(`${b.id}: asset is ${real.toFixed(3)}s but declared ${b.dur.toFixed(2)}s — the render truncates ` +
      `at data-duration, so this plays, but the pin-exact-frames discipline slipped: confirm the ` +
      `in-window content is the cut you intended.`);
  }
}

// ── 2. a fade-out needs a fade-in partner, or the picture dips to canvas ────
// win()/hardInFadeOut() fade out over the last XF; fadeInHardOut()/hold() hard-cut out.
const XF = +(html.match(/XF\s*=\s*([\d.]+)/)?.[1] ?? 0.7);
for (const b of beats) {
  const fadesOut = call('win', b.id) || call('hardInFadeOut', b.id);
  if (!fadesOut) continue;
  const t = b.end - XF;
  // someone else must be fading IN across [t, b.end] — search ALL clips, not just beats:
  // the canonical arc includes section-divider title cards (class "clip card") wired with
  // win(), and a divider fading in over a beat's fade-out is a legitimate partner.
  const partner = clips.find((o) => o.id !== b.id && call('win', o.id) &&
    Math.abs(o.start - t) < 0.08);
  const alsoFadeIn = clips.find((o) => o.id !== b.id &&
    (call('win', o.id) || call('fadeInHardOut', o.id)) && Math.abs(o.start - t) < 0.08);
  if (!partner && !alsoFadeIn && !(outro && Math.abs(outro.start - t) < 0.15)) {
    E(`${b.id}: fades out at ${t.toFixed(2)}-${b.end.toFixed(2)}s with nothing fading in. ` +
      `The composite dips toward the background ("a transition to nothing"). ` +
      `If the next clip hard-cuts in, use fadeInHardOut() here instead of win().`);
  }
}

// ── 3-5. spotlight sanity ──────────────────────────────────────────────────
for (const s of scrims) {
  // Only the SETTLED window matters: spot() fades in over ~0.9s after a 0.1s delay and fades
  // out over the last 0.6s. Those ramps may overlap neighbouring clips (starting a spotlight
  // during the approach makes it land sooner, which is desirable). What must sit on ONE stable
  // clip is the fully-lit stretch.
  const set0 = s.start + 1.0, set1 = s.end - 0.6;
  if (set1 <= set0) {
    W(`${s.id}: window ${(s.end-s.start).toFixed(2)}s is shorter than its own fade in+out — ` +
      `it never reaches full opacity. Give it at least ~1.8s.`);
  }
  const host = beats.filter((b) => set0 >= b.start - 0.05 && set1 <= b.end + 0.05);
  if (host.length === 0) {
    const spans = beats.filter((b) => b.start < set1 && b.end > set0).map((b) => b.id);
    E(`${s.id}: settled window ${set0.toFixed(2)}-${set1.toFixed(2)}s is not contained in ONE clip ` +
      `(spans ${spans.join(', ') || 'nothing'}). A spotlight that outlives its clip keeps dimming ` +
      `the screen after the thing it points at is gone — this shipped once as a highlight over ` +
      `an already-closed menu.`);
  } else {
    const h = host[host.length - 1];
    if (h.tag === 'video') {
      W(`${s.id}: settles over a VIDEO clip (${h.id}), not a freeze. Confirm from beats.json that ` +
        `the target is on screen for the whole ${set0.toFixed(2)}-${set1.toFixed(2)}s window; ` +
        `moving the spotlight onto a freeze still removes the risk entirely.`);
    }
  }
  // the spot rect: read each property independently (any order, spaces, fractional px)
  const seg = segmentFor(s.id);
  const spotTag = seg.match(/<[a-zA-Z][\w-]*\b[^>]*\bclass="[^"]*\bspot\b[^"]*"[^>]*>/)?.[0] ?? '';
  const style = spotTag.match(/\bstyle="([^"]*)"/)?.[1] ?? '';
  const prop = (name) => +(style.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*(-?[\\d.]+)px`))?.[1] ?? NaN);
  const w = prop('width'), h2 = prop('height');
  if (Number.isFinite(w) && Number.isFinite(h2)) {
    const frac = (w * h2) / (WIN_W * WIN_H);
    if (frac > 0.25) {
      W(`${s.id}: covers ${(frac*100).toFixed(0)}% of the window. A spotlight should frame ONE control; ` +
        `at this size it directs nothing and its edges land mid-content.`);
    }
  } else {
    W(`${s.id}: couldn't read the spot rect out of its style attribute — verify its size on a snapshot.`);
  }
}

// ── 6. nothing may run past the outro's start ──────────────────────────────
if (outro) for (const c of [...scrims, ...cards]) {
  if (c.end > outro.start + 0.01) {
    E(`${c.id} ends at ${c.end.toFixed(2)}s, after the outro starts (${outro.start.toFixed(2)}s) — ` +
      `it will composite over the logo.`);
  }
}

// ── 7. glyphs the render font has no coverage for ──────────────────────────
// Enclosed alphanumerics render as a generic fallback box and survive every other check.
for (const m of html.matchAll(/<(div|span)\b[^>]*\bclass="[^"]*\b(kick|head|title|sub)\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/g)) {
  const bad = [...m[3]].filter((ch) => {
    const c = ch.codePointAt(0);
    return (c >= 0x2460 && c <= 0x24FF) || (c >= 0x2776 && c <= 0x2793) || (c >= 0x1F100 && c <= 0x1F1FF);
  });
  if (bad.length) E(`${m[2]}: contains glyphs with no font coverage (${[...new Set(bad)].join(' ')}). ` +
    `They fall back to a generic box. Use plain ASCII ("1.", "2.").`);
}

// ── 8. kicker and headline must not share a word ───────────────────────────
// "…ODER PER CHAT" over "Oder sag einfach, was du brauchst." read as a stutter and cost a
// round. Exact-word match, ≥3 letters, any language.
for (const c of cards) {
  const seg = segmentFor(c.id);
  const kick = seg.match(/class="[^"]*\bkick\b[^"]*"[^>]*>([\s\S]*?)<\//)?.[1] ?? '';
  const head = seg.match(/class="[^"]*\bhead\b[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
  const words = (t) => new Set((t.replace(/<[^>]+>/g, ' ').toLowerCase().match(/\p{L}{3,}/gu) || []));
  const kw = words(kick), hw = words(head);
  const shared = [...kw].filter((w) => hw.has(w));
  if (!kick && !head) {
    W(`${c.id}: no .kick/.head found inside it — the kicker/headline stutter check could not ` +
      `run on this card. Check its markup (is the copy in a differently-classed element?).`);
  }
  if (shared.length) {
    W(`${c.id}: kicker and headline share "${shared.join('", "')}" — reads as a stutter. ` +
      `Reword one of them (the kicker usually wins the word).`);
  }
}

// ── 9. a still held long with no spotlight is dead air ─────────────────────
// A 4.6s concept-image hold — directly after the same image appeared in the previous clip —
// read as "stays on the image too long". A long hold is only earned when a spotlight is
// directing the eye during it (a designed freeze), so: img beat >4.5s must overlap a scrim.
for (const b of beats) {
  if (b.tag !== 'img' || b.dur <= 4.5) continue;
  const lit = scrims.some((s) => s.start < b.end - 0.8 && s.end > b.start + 0.8);
  if (!lit) {
    W(`${b.id}: a still held ${b.dur.toFixed(1)}s with no spotlight during it — the eye has ` +
      `nothing to do. Tighten to ≲4s or add a spotlight that earns the dwell.`);
  }
}

// ── 10. frozen stretches inside video assets ───────────────────────────────
// A video beat with a >4.5s internally-frozen stretch reads as a hung clip (a 5s static tail
// shipped this way — the source had dead time after the action). freezedetect is single-pass
// and free. n is CALIBRATED, don't raise it: at 0.003 a typing beat reads as "frozen" (a few
// glyphs move too few pixels of a 3200px frame), at 0.001 typing and cursor glides clear
// while genuinely dead footage (measured ≈0.0004-0.0008 mean diff) still flags.
// A stretch that lies under a spotlight's settled window is EXEMPT — the dwell is designed
// and the eye is directed, same principle as rule 9.
for (const b of beats) {
  if (b.tag !== 'video' || !b.src || !b.src.endsWith('.mp4')) continue;
  const p = join(dir, b.src);
  if (!existsSync(p)) continue;   // rule 1 already reported it
  const r = spawnSync(FFMPEG, ['-v', 'info', '-i', p, '-vf', 'freezedetect=n=0.001:d=4.5', '-an', '-f', 'null', '-'],
                      { encoding: 'utf8' });
  const err = (r.stderr || '') + (r.stdout || '');
  if (r.error) { W(`${b.id}: could not run freezedetect (${r.error.message}) — check the asset for frozen stretches by eye.`); continue; }
  const starts = [...err.matchAll(/freeze_start:\s*([\d.]+)/g)].map((m) => +m[1]);
  const durs   = [...err.matchAll(/freeze_duration:\s*([\d.]+)/g)].map((m) => +m[1]);
  starts.forEach((t, i) => {
    const d = durs[i] ?? (b.dur - t);   // a freeze running to EOF emits no duration
    const f0 = b.start + t, f1 = b.start + t + d;               // composition time
    const lit = scrims.some((s) => s.start < f1 - 0.8 && s.end > f0 + 0.8);
    if (lit) return;                                            // designed dwell under a spotlight
    W(`${b.id}: frozen for ${d.toFixed(1)}s starting at ${t.toFixed(1)}s inside the asset — dead ` +
      `air unless it's a designed freeze (which belongs in a still + hold(), not a video tail). ` +
      `Re-cut the clip so the action fills its window, or put a spotlight on what the viewer ` +
      `should study during the hold.`);
  });
}

// ── timeline artifact (--timeline) ─────────────────────────────────────────
// The composition IS the timeline: data-start/data-duration are exactly what the renderer
// obeys. So TIMELINE.md is GENERATED from them and never hand-written. A hand-kept timestamp
// list rots the instant a beat moves, and then review feedback ("0:12 drags") gets applied to
// the wrong clip, confidently. (Moving a beat and leaving its old timestamp behind somewhere is
// already a known way to break a cut.) Regenerating is free, so it happens on every audit run.
// Output is deterministic (no generation date): re-running on an unchanged composition writes
// identical bytes, so a git diff shows only real timing changes.
if (process.argv.includes('--timeline')) {
  const FPS = +(html.match(/\bdata-fps="(\d+)"/)?.[1] ?? 30);   // ffmpeg-recipes pins 30fps CVR
  const rootTag = timedTags.find((m) => /data-composition-id/.test(m[0]))?.[0] ?? '';
  const TOTAL = +(rootTag.match(/\bdata-duration="([\d.]+)"/)?.[1] ?? Math.max(...clips.map((c) => c.end)));
  const fr = (t) => Math.round(t * FPS);
  const mmss = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  const txt = (s) => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  // A clip's inner content = end of its opening tag → the next timed clip. Bounded that way
  // rather than by a fixed slice: clips are flat siblings, and a fixed window truncates a long card.
  const inner = (id) => {
    const i = html.indexOf(`id="${id}"`);
    if (i < 0) return '';
    const open = html.indexOf('>', i);
    const next = html.indexOf('data-start=', open);
    return html.slice(open, next < 0 ? html.length : next);
  };
  const pick = (seg, cls, end = '<\\/') =>
    txt(seg.match(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)${end}`))?.[1] ?? '');

  const kindOf = (c) => c.cls.includes('win') ? 'beat'
    : c.cls.includes('scrim') ? 'spotlight'
    : c.cls.includes('card') ? (c.id === 'intro' ? 'intro' : c.id === 'outro' ? 'outro' : 'title-card')
    : 'card';
  const ORDER = ['intro', 'beat', 'spotlight', 'card', 'title-card', 'outro'];

  const rows = clips.map((c) => {
    const k = kindOf(c), seg = inner(c.id);
    const r = { id: c.id, type: k, start: +c.start.toFixed(3), end: +c.end.toFixed(3),
                dur: +c.dur.toFixed(3), startFrame: fr(c.start), endFrame: fr(c.end),
                track: Number.isFinite(c.track) ? c.track : null };
    if (k === 'beat') {
      r.media = c.tag === 'video' ? 'video' : 'still';
      r.src = c.src;
      r.wiredWith = KNOWN.find((fn) => call(fn, c.id)) ?? null;
      r.what = `${r.media} ${c.src}${r.wiredWith ? ` · ${r.wiredWith}()` : ' · NOT WIRED'}`;
    } else if (k === 'spotlight') {
      const set0 = c.start + 1.0, set1 = c.end - 0.6;         // the settled window, as rule 3 defines it
      const host = beats.filter((b) => set0 >= b.start - 0.05 && set1 <= b.end + 0.05);
      r.over = host.length ? host[host.length - 1].id : null;
      const tag = seg.match(/<[a-zA-Z][\w-]*\b[^>]*\bclass="[^"]*\bspot\b[^"]*"[^>]*>/)?.[0] ?? '';
      const style = tag.match(/\bstyle="([^"]*)"/)?.[1] ?? '';
      const p = (nm) => {
        const v = +(style.match(new RegExp(`(?:^|;)\\s*${nm}\\s*:\\s*(-?[\\d.]+)px`))?.[1] ?? NaN);
        return Number.isFinite(v) ? v : null;
      };
      r.rect = { left: p('left'), top: p('top'), width: p('width'), height: p('height') };
      r.what = `spotlight → ${r.over ? '#' + r.over : '(no single host clip)'}` +
        (r.rect.width ? ` · ${r.rect.width}×${r.rect.height} at ${r.rect.left},${r.rect.top}` : '');
    } else if (k === 'card') {
      r.kicker = pick(seg, 'kick');
      r.headline = pick(seg, 'head', '<\\/div>');
      r.what = [r.kicker, r.headline].filter(Boolean).join(' — ') || '(empty card)';
    } else {
      r.title = pick(seg, 'title');
      r.sub = pick(seg, 'sub');
      r.what = [r.title, r.sub].filter(Boolean).join(' — ') || `(${k}, no text)`;
    }
    return r;
  }).sort((a, b) => a.start - b.start || ORDER.indexOf(a.type) - ORDER.indexOf(b.type) ||
                    a.id.localeCompare(b.id));

  // Chapters = the overlay cards. In a guide they ARE the sections (one card routinely spans
  // several beats), which is exactly what an in-app embed needs for "jump to the sharing step".
  const chapters = rows.filter((r) => r.type === 'card' && (r.kicker || r.headline))
    .map((r) => ({ t: r.start, timecode: mmss(r.start), frame: r.startFrame,
                   label: r.kicker || r.headline, id: r.id }));

  const name = basename(resolve(dir));
  const md = [
    `# Timeline — ${name}`, '',
    '**GENERATED FILE — do not edit by hand.** `index.html` (`data-start` / `data-duration`) is',
    'the only source of truth for timing; this is a read-out of it. Regenerate after every change:',
    '', '```bash', 'node <skill>/scripts/audit-composition.mjs . --timeline', '```', '',
    `**${mmss(TOTAL)}** total · ${fr(TOTAL)} frames @ ${FPS}fps · ` +
      `${beats.length} beats, ${scrims.length} spotlights, ${chapters.length} cards`, '',
    '| in | out | dur | id | what |', '|---|---|---|---|---|',
    ...rows.map((r) => `| \`${mmss(r.start)}\` | \`${mmss(r.end)}\` | ${r.dur.toFixed(2)}s | \`${r.id}\` | ${r.what} |`),
    '',
  ];
  if (chapters.length) md.push('## Chapters', '', ...chapters.map((c) => `- \`${c.timecode}\` — ${c.label}`), '');
  md.push('## Reviewing against this file', '',
    'Feedback arrives as a timecode ("0:12 drags"). Find the row spanning it, take its `id`, and',
    'change that clip\'s `data-start`/`data-duration` **and its timeline call** in `index.html` —',
    'a beat moved in one place but not the other is the classic orphaned-timestamp bug, and every',
    'later beat shifts with it. Then re-run the audit with `--timeline` so this file and the video',
    'agree again.', '');

  writeFileSync(join(dir, 'TIMELINE.md'), md.join('\n'));
  writeFileSync(join(dir, 'timeline.json'), JSON.stringify({
    project: name, fps: FPS, duration: +TOTAL.toFixed(3), frames: fr(TOTAL),
    counts: { beats: beats.length, spotlights: scrims.length, cards: chapters.length },
    chapters, clips: rows,
  }, null, 2) + '\n');
  console.log(`timeline: wrote TIMELINE.md + timeline.json — ${rows.length} clips, ${mmss(TOTAL)}\n`);
}

// ── report ─────────────────────────────────────────────────────────────────
const n = (a) => a.length;
console.log(`audit: ${beats.length} beats, ${scrims.length} spotlights, ${cards.length} cards` +
            ` (${clips.length} timed clips + ${roots} composition root${roots === 1 ? '' : 's'})\n`);
for (const e of errors) console.log(`  ✗ ${e}\n`);
for (const w of warns)  console.log(`  ⚠ ${w}\n`);
console.log(n(errors) ? `${n(errors)} error(s), ${n(warns)} warning(s) — FIX BEFORE RENDERING`
                      : `0 errors, ${n(warns)} warning(s)${n(warns) ? ' — justify each one' : ' — clean'}`);
process.exit(n(errors) ? 1 : 0);
