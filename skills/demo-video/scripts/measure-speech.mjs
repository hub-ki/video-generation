#!/usr/bin/env node
// Find the sentence boundaries INSIDE each narration line, by measuring the audio.
//
//   node <skill>/scripts/measure-speech.mjs <project-dir>
//   -> <project-dir>/speech-phrases.json
//
// WHY THIS EXISTS. A concept frame should highlight the thing the voice is talking about
// RIGHT NOW — the first card lights up while its word is said, then the second, and so
// on. That needs sub-line timing, and the fit table only gives you where each whole line
// starts. Estimating the phrase offsets from character counts drifts by up to a second on a
// long sentence, which is enough to highlight the wrong card.
//
// So measure them: silencedetect reads the pauses the voice actually took. Run it AFTER
// make-audio.mjs (it reads that run's plan.json + mp3s), then regenerate the composition.
//
// Output, per section id:
//   { at, duration, phrases: [absolute composition seconds, one per speech run] }
//
// phrases[0] is the line's own start; phrases[1..] are the sentences after it. A five-card
// frame wants a line with five runs — check the printed counts before wiring them up.
import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const FFMPEG = process.env.HYPERFRAMES_FFMPEG_PATH || "ffmpeg";
const projectDir = resolve(process.argv[2] || ".");
const planPath = join(projectDir, "assets/audio/plan.json");

if (!existsSync(planPath)) {
  console.error(`no ${planPath} — run make-audio.mjs first`);
  process.exit(2);
}
const plan = JSON.parse(readFileSync(planPath, "utf8"));

// Measured against real ElevenLabs output: d=0.26 found NOTHING (these voices barely pause
// between sentences), d=0.12 split every line into exactly its sentences. The noise floor is
// not the sensitive knob — everything from -45 to -25 dB gave the same gaps.
const MIN_GAP = 0.12;
const NOISE = "-30dB";

const result = {};
for (const row of plan.rows) {
  const file = join(projectDir, row.file.replace(/^\.\//, ""));
  // ffmpeg writes silencedetect to STDERR. execFileSync returns stdout, which is empty here
  // and parses as "no gaps found" without any error — that silently disabled this whole
  // feature once. Read stderr explicitly.
  const { stderr } = spawnSync(
    FFMPEG,
    ["-hide_banner", "-nostats", "-i", file,
     "-af", `silencedetect=noise=${NOISE}:d=${MIN_GAP}`, "-f", "null", "-"],
    { encoding: "utf8" }
  );
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((match) =>
    Number.parseFloat(match[1])
  );
  const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) =>
    Number.parseFloat(match[1])
  );
  const opensOnSilence = starts.length > 0 && starts[0] < 0.12;
  // A silence running to the end of the file is trailing air, not a new phrase.
  const usable = ends.filter((end) => end < row.duration - 0.2);
  const offsets = [...(opensOnSilence ? [] : [0]), ...usable];

  result[row.id] = {
    at: row.at,
    duration: row.duration,
    phrases: offsets.map((offset) => +(row.at + offset).toFixed(3)),
  };
  console.log(
    `  ${row.id.padEnd(18)} ${String(offsets.length).padStart(2)} phrase(s)  ` +
      result[row.id].phrases.map((value) => value.toFixed(1)).join(", ")
  );
}

const outPath = join(projectDir, "speech-phrases.json");
writeFileSync(outPath, JSON.stringify(result, null, 1));
console.log(`\n  ${outPath} written (absolute composition seconds)`);
