// Lay the generated voiceover onto a silent render.
//
//   node <skill>/scripts/mux-audio.mjs [--silent assets/silent-master.mp4]
//                                      [--out renders/<folder>_1080.mp4]
//
// Each line is delayed to its own offset from assets/audio/plan.json, the lines are summed,
// and the result is muxed as the video's audio track. The VIDEO STREAM IS COPIED, so this
// costs seconds and cannot re-encode-degrade the picture — which is why the pipeline renders
// silent first and muxes after, rather than trying to render with audio.
//
// Render the silent master to assets/, not renders/: renders/ should only ever hold the
// files someone might hand over, so nobody grabs a mute copy by mistake.
import { execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

const argOf = (flag, fallback) => {
  const at = process.argv.indexOf(flag);
  return at > -1 ? process.argv[at + 1] : fallback;
};

const FFMPEG = process.env.HYPERFRAMES_FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.HYPERFRAMES_FFPROBE_PATH || 'ffprobe';
const SILENT = argOf('--silent', 'assets/silent-master.mp4');
const OUT = argOf('--out', null);

if (!existsSync(SILENT)) {
  console.error(`no silent master at ${SILENT} — render one with:\n` +
    `  node "$HYPERFRAMES_CLI" render . -q high --crf 14 -o ./${SILENT}`);
  process.exit(2);
}
if (!OUT) {
  console.error('pass --out renders/<folder>_1080.mp4 (never renders/video.mp4 — these get forwarded)');
  process.exit(2);
}
if (!existsSync('assets/audio/plan.json')) {
  console.error('no assets/audio/plan.json — run make-audio.mjs first');
  process.exit(2);
}

const rows = JSON.parse(readFileSync('assets/audio/plan.json', 'utf8')).rows;
if (!rows.length) {
  console.error('plan.json has no lines');
  process.exit(2);
}

const videoDuration = Number(execFileSync(FFPROBE,
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', SILENT],
  { encoding: 'utf8' }).trim());

const inputs = [];
for (const row of rows) inputs.push('-i', row.file);

// adelay per line (ms, one value per channel), then sum. `normalize=0` keeps each line at
// its own level — without it amix divides everything by the number of inputs and the whole
// track ends up inaudibly quiet. alimiter catches any overlap peak.
const filters = rows.map((row, index) => {
  const ms = Math.round(row.at * 1000);
  return `[${index + 1}:a]aresample=48000,adelay=${ms}|${ms}[a${index}]`;
}).join(';');
const mixIn = rows.map((_, index) => `[a${index}]`).join('');
const filterComplex =
  `${filters};${mixIn}amix=inputs=${rows.length}:normalize=0:dropout_transition=0[mixed];` +
  `[mixed]apad,atrim=0:${videoDuration.toFixed(3)},alimiter=limit=0.95[out]`;

execFileSync(FFMPEG, [
  '-y', '-v', 'error',
  '-i', SILENT, ...inputs,
  '-filter_complex', filterComplex,
  '-map', '0:v', '-map', '[out]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-movflags', '+faststart',
  OUT,
], { stdio: ['ignore', 'inherit', 'inherit'] });

console.log(`\n  ✓ ${OUT}`);
for (const row of rows) {
  console.log(`    ${row.at.toFixed(1).padStart(6)}s  ${row.id}  (${row.duration.toFixed(1)}s)`);
}
console.log('\n  Now VERIFY placement by measuring, not by trusting the mux:');
console.log(`    ffmpeg -hide_banner -nostats -ss <t> -t <d> -i ${OUT} -af volumedetect -f null -`);
console.log('  Speech should measure above -25 dB peak in every narrated section, and the');
console.log('  un-narrated ones should measure silent. (-v error SUPPRESSES volumedetect output.)');
