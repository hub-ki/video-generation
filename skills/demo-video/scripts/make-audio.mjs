// Generate a voiceover with ElevenLabs, laid onto the composition's own timeline.
//
//   ELEVENLABS_API_KEY=… node <skill>/scripts/make-audio.mjs [--sections ./narration.mjs]
//                                                            [--voice <id>] [--model <id>]
//
// Reads the narration from a project-local file (default `./narration.mjs`) that exports:
//
//   export const voice = 'JBFqnCBsd6RMkjVDRZzb';        // optional, overridable by --voice
//   export const language = 'en';                       // used by verify-narration.mjs
//   export const sections = [
//     { id: '01-intro', anchor: 'intro', text: 'Workspaces are where your content stays.' },
//     …
//   ];
//
// `anchor` is a CLIP ID from timeline.json — the line is placed relative to where that clip
// actually starts, so a re-timed cut moves the audio with it. Nothing is hand-typed twice.
//
// Writes assets/audio/<id>.mp3 plus assets/audio/plan.json (the offsets mux-audio.mjs uses),
// and prints a fit table: a line that does not fit its beat is the thing you must fix
// BEFORE rendering — widen the beat or shorten the copy (see references/voiceover.md).
//
// RESUMABLE by design: lines that already exist are skipped, and a failed line (quota,
// rate limit) is dropped with a warning instead of aborting the run. Re-run to fill gaps.
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';

const argOf = (flag, fallback) => {
  const at = process.argv.indexOf(flag);
  return at > -1 ? process.argv[at + 1] : fallback;
};

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error('ELEVENLABS_API_KEY is not set.');
  process.exit(2);
}

const SECTIONS_FILE = resolve(argOf('--sections', './narration.mjs'));
if (!existsSync(SECTIONS_FILE)) {
  console.error(`no narration file at ${SECTIONS_FILE} — see references/voiceover.md for the shape`);
  process.exit(2);
}
const narration = await import(`file://${SECTIONS_FILE}`);
const SECTIONS = narration.sections;
const VOICE = argOf('--voice', narration.voice || 'JBFqnCBsd6RMkjVDRZzb');
const MODEL = argOf('--model', narration.model || 'eleven_multilingual_v2');
const SETTINGS = narration.voiceSettings || {
  stability: 0.58, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true,
};

const FFPROBE = process.env.HYPERFRAMES_FFPROBE_PATH || 'ffprobe';
const OUT = 'assets/audio';
const LEAD_IN = narration.leadIn ?? 0.7;   // a beat of air before each line starts

if (!existsSync('timeline.json')) {
  console.error('no timeline.json — run `audit-composition.mjs . --timeline` first');
  process.exit(2);
}
const timeline = JSON.parse(readFileSync('timeline.json', 'utf8'));
const clips = timeline.clips || [];
const startOf = (id) => {
  const found = clips.find((c) => c.id === id);
  if (!found) throw new Error(`no clip "${id}" in timeline.json — check the anchor`);
  return found.start;
};

mkdirSync(OUT, { recursive: true });
const durationOf = (file) => Number(execFileSync(FFPROBE,
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
  { encoding: 'utf8' }).trim());

const rows = [];
const missing = [];
for (const section of SECTIONS) {
  const file = `${OUT}/${section.id}.mp3`;
  if (!existsSync(file) || statSync(file).size < 2000) {
    const body = JSON.stringify({ text: section.text, model_id: MODEL, voice_settings: SETTINGS });
    execFileSync('curl', ['-s', '-m', '180', '-o', file, '-X', 'POST',
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`,
      '-H', `xi-api-key: ${KEY}`, '-H', 'Content-Type: application/json', '-d', body]);
    if (statSync(file).size < 2000) {
      let reason = '';
      try { reason = JSON.parse(readFileSync(file, 'utf8')).detail?.message || ''; } catch { /* not json */ }
      unlinkSync(file);
      missing.push({ id: section.id, reason });
      console.warn(`  ! ${section.id}: ${reason || 'TTS returned no audio'}`);
      continue;
    }
  }
  rows.push({ ...section, file, start: startOf(section.anchor), duration: durationOf(file) });
}

// Each line's window runs from where it starts to where the NEXT line starts — or, for the
// last one, to the end of the composition.
console.log(`\n  voice ${VOICE} · model ${MODEL}\n`);
console.log('  section              starts   speech   window   fits');
let previousEnd = 0;
let overruns = 0;
rows.forEach((row, index) => {
  const at = row.start + LEAD_IN;
  const nextStart = index + 1 < rows.length ? rows[index + 1].start : timeline.duration;
  const window = nextStart - at;
  row.at = at;
  const overrun = row.duration - window;
  const fits = overrun <= 0.15 ? 'yes' : `NO (+${overrun.toFixed(1)}s)`;
  if (overrun > 0.15) overruns += 1;
  console.log(`  ${row.id.padEnd(18)} ${at.toFixed(1).padStart(6)}s ${row.duration.toFixed(1).padStart(7)}s ${window.toFixed(1).padStart(7)}s   ${fits}`);
  if (at < previousEnd) console.log(`    ! overlaps the previous line by ${(previousEnd - at).toFixed(1)}s`);
  previousEnd = at + row.duration;
});

writeFileSync(`${OUT}/plan.json`, JSON.stringify({ voice: VOICE, model: MODEL, rows }, null, 2));
console.log(`\n  ✓ ${rows.length} line(s) -> ${OUT}/  (plan.json holds the offsets)`);
if (missing.length) console.log(`  ! ${missing.length} still missing: ${missing.map((m) => m.id).join(', ')}`);
if (overruns) console.log(`  ! ${overruns} line(s) do not fit — widen those beats or shorten the copy, then re-run`);
