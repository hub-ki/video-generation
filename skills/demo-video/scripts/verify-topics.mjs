#!/usr/bin/env node
// Does the PICTURE show what the VOICE is naming, at the moment it names it?
//
//   node verify-topics.mjs <projectDir> [--video renders/x_1080.mp4] [--pair]
//   -> <projectDir>/snapshots/topic-check/  + a legend you read the sheets against
//
// WHY THIS EXISTS. Every other check in this skill validates one half of the video against
// itself. `audit-composition.mjs` checks the timeline's structure. `verify-material.mjs`
// checks a spotlight against its DECLARED subject (`data-roi` / the spot rect).
// `verify-narration.mjs` checks that the voice said the words that were written. Not one of
// them compares the words to the picture, so a line can name a thing that is not on screen
// and every gate stays green.
//
// It shipped exactly that way. A guide's voice walked three topics — a row's context menu,
// search, the archive — while the picture sat on the FIRST one the whole time: the context menu
// was still open when the voice had already moved to the archive, and the search dialog only
// appeared seconds after the sentence about it had ended. Every gate was green. The viewer is
// told to look at something the frame is not showing.
//
// PER TOPIC, NOT PER SENTENCE. One sentence can name three controls, and each needs its own
// verdict at its own moment; one topic can span three sentences and needs one. So topics are
// declared, not derived — in narration.mjs, next to the line they belong to:
//
//   { id: '09-chats', anchor: 'c8', text: 'On the left are all your conversations. …',
//     topics: ['three-dot menu', 'search', 'archive'] }
//
// Each topic is a substring of that line's `text`. Its moment is interpolated across the
// line's measured span, so it is accurate to roughly a second. Beats are long enough that one
// frame per topic is normally right; pass `--pair` to also get one 0.8s either side when a
// topic sits near a cut. Sections with no `topics` get one frame at their midpoint, so an
// undeclared line is visibly unchecked rather than silently skipped.
//
// THE VERDICT IS YOURS — this script only puts the frame and the words side by side. The
// question for each row is simply: **is the frame showing what the voice is talking about?**
//
// A spotlight is ONE way to satisfy that, not the test. Do not read a blank `spot` column as a
// failure and do not go spotlight every topic — over-pointing is its own defect, and the skill
// already says to leave a beat unspotlit when it has no single control worth pointing at. A
// topic passes just as well by being the plain, obvious subject of the frame.
//
// The four ways it fails, in the order they actually occur:
//   LAG       the PREVIOUS topic is still on screen — an open menu, a dialog, a panel — while
//             the voice has moved on. The most common one, and the reason this check exists.
//   LEAD      the voice names something the footage only reaches seconds later.
//   OCCLUDED  the thing is on screen but behind the caption card, a scrim, or a dropdown.
//   ABSENT    it is never shown at all; the line describes a screen the video does not have.
//
// See SKILL.md Phase 5 for the fixes, cheapest first.
import { readFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';

const dir = resolve(process.argv[2] || '.');
const videoFlag = process.argv.indexOf('--video');
const FFMPEG = process.env.HYPERFRAMES_FFMPEG_PATH || 'ffmpeg';

const narrationPath = join(dir, 'narration.mjs');
const phrasesPath = join(dir, 'speech-phrases.json');
if (!existsSync(narrationPath)) {
  console.error('no narration.mjs — this check is for narrated guides only');
  process.exit(2);
}
if (!existsSync(phrasesPath)) {
  console.error('no speech-phrases.json — run make-audio.mjs then measure-speech.mjs first');
  process.exit(2);
}

const { sections } = await import(pathToFileURL(narrationPath).href);
const phrases = JSON.parse(readFileSync(phrasesPath, 'utf8'));

/** Prefer the finished cut: it is what a viewer sees, cards and spotlights composited. */
function pickVideo() {
  if (videoFlag > -1 && process.argv[videoFlag + 1]) return resolve(dir, process.argv[videoFlag + 1]);
  const rendersDir = join(dir, 'renders');
  if (existsSync(rendersDir)) {
    const cut = readdirSync(rendersDir).filter((f) => f.endsWith('.mp4')).sort();
    if (cut.length) return join(rendersDir, cut[0]);
  }
  const silent = join(dir, 'assets', 'silent-master.mp4');
  if (existsSync(silent)) {
    console.warn('  ! using assets/silent-master.mp4 — render the muxed cut for the real thing');
    return silent;
  }
  return null;
}
const video = pickVideo();
if (!video) { console.error('no rendered video found — render first'); process.exit(2); }

// A stale render shows a previous timeline; the frames would be of a video that no longer exists.
const htmlPath = join(dir, 'index.html');
if (existsSync(htmlPath) && statSync(video).mtimeMs < statSync(htmlPath).mtimeMs) {
  console.warn('  ! the video is OLDER than index.html — re-render before trusting these frames');
}

// Active spotlights, straight from the composition (same source crop-spots.mjs uses).
const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '') : '';
const scrims = [];
for (const tag of html.matchAll(/<[a-zA-Z][\w-]*\b[^>]*\bclass="[^"]*\bscrim\b[^"]*"[^>]*>/g)) {
  const attr = (n) => tag[0].match(new RegExp(`\\b${n}="([^"]*)"`))?.[1];
  const start = +(attr('data-start') ?? NaN);
  const duration = +(attr('data-duration') ?? NaN);
  if (Number.isFinite(start) && Number.isFinite(duration)) {
    scrims.push({ id: attr('id') ?? '?', start, end: start + duration });
  }
}
const spotlightAt = (t) => scrims.find((s) => t >= s.start && t <= s.end)?.id ?? null;

/** Where a topic is spoken. The measured phrase boundaries give the line's real span; the
 *  topic's character offset inside the line places it within that span. Interpolation, not
 *  measurement — hence the two frames per topic. */
function topicTime(section, topic) {
  const measured = phrases[section.id];
  if (!measured?.phrases?.length) return null;
  const lineStart = measured.phrases[0];
  const lineEnd = measured.end ?? measured.phrases[measured.phrases.length - 1] + 2.5;
  const index = section.text.indexOf(topic);
  if (index < 0) return { t: lineStart, unmatched: true };
  const ratio = index / Math.max(1, section.text.length);
  return { t: lineStart + ratio * (lineEnd - lineStart), unmatched: false };
}

/** The sentence the topic sits in — that is what the reviewer needs next to the frame. */
function sentenceAround(text, topic) {
  const index = text.indexOf(topic);
  if (index < 0) return text;
  const start = Math.max(0, text.lastIndexOf('.', index - 1) + 1);
  const dot = text.indexOf('.', index);
  return text.slice(start, dot < 0 ? text.length : dot + 1).trim();
}

const outDir = join(dir, 'snapshots', 'topic-check');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const rows = [];
let frameIndex = 0;
for (const section of sections) {
  const topics = section.topics?.length ? section.topics : [null];
  for (const topic of topics) {
    const placed = topic
      ? topicTime(section, topic)
      : (() => {
          const measured = phrases[section.id];
          if (!measured?.phrases?.length) return null;
          const first = measured.phrases[0];
          const last = measured.phrases[measured.phrases.length - 1];
          return { t: (first + last) / 2, unmatched: false };
        })();
    if (!placed) continue;
    const offsets = process.argv.includes('--pair') ? [['a', -0.8], ['b', 0.8]] : [['', 0]];
    for (const [label, offset] of offsets) {
      const t = Math.max(0, placed.t + offset);
      const name = `${String(++frameIndex).padStart(3, '0')}${label}`;
      execFileSync(FFMPEG, ['-y', '-v', 'error', '-ss', String(t), '-i', video,
        '-frames:v', '1', '-vf', 'scale=480:-1', join(outDir, `f_${name}.png`)]);
    }
    rows.push({
      n: frameIndex,
      section: section.id,
      topic: topic ?? '(ganze Zeile — keine topics deklariert)',
      t: placed.t,
      spot: spotlightAt(placed.t),
      unmatched: placed.unmatched,
      sentence: topic ? sentenceAround(section.text, topic) : section.text.slice(0, 90) + '…',
    });
  }
}

const frames = readdirSync(outDir).filter((f) => f.startsWith('f_')).sort();
const PER_SHEET = process.argv.includes('--pair') ? 6 : 9;
let sheet = 0;
for (let i = 0; i < frames.length; i += PER_SHEET) {
  const chunk = frames.slice(i, i + PER_SHEET);
  const inputs = chunk.flatMap((f) => ['-i', join(outDir, f)]);
  const cols = process.argv.includes('--pair') ? 2 : 3;
  const filter = `${chunk.map((_, k) => `[${k}:v]`).join('')}xstack=inputs=${chunk.length}:layout=${
    chunk.map((_, k) => {
      const column = k % cols, row = Math.floor(k / cols);
      return `${column ? Array(column).fill('w0').join('+') : '0'}_${row ? Array(row).fill('h0').join('+') : '0'}`;
    }).join('|')
  }[v]`;
  const out = join(outDir, `topic-sheet-${++sheet}.png`);
  try {
    execFileSync(FFMPEG, ['-y', '-v', 'error', ...inputs, '-filter_complex', filter, '-map', '[v]', out]);
  } catch {
    console.warn(`  ! could not tile sheet ${sheet} (uneven frame count) — read the f_*.png directly`);
  }
}

console.log(`\n  ${rows.length} topic(s) across ${sections.length} narration line(s)`);
console.log(`  frames -> ${outDir}${process.argv.includes('--pair') ? '  (a = 0.8s early, b = 0.8s late)' : ''}\n`);
console.log('   #  section              topic                     spoken at   spot (info only)');
for (const row of rows) {
  console.log(
    `  ${String(row.n).padStart(2)}  ${row.section.padEnd(20)} ${row.topic.slice(0, 24).padEnd(25)} ` +
    `${row.t.toFixed(1).padStart(7)}s   ${row.spot ?? '—'}${row.unmatched ? '   ! topic not found in the line text' : ''}`
  );
  console.log(`      „${row.sentence}"`);
}
console.log(`
  READ every frame against its sentence and answer one question: is the frame showing what
  the voice is talking about? A spotlight is one way to get there, NOT the test — a blank
  spot column is fine whenever the topic is plainly the subject of the frame.

  Watch for LAG above all: the previous topic's menu/dialog/panel still open while the voice
  has moved on. Then LEAD (words ahead of the footage), OCCLUDED (behind the card or a
  dropdown) and ABSENT (never shown).`);
