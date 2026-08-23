# Voiceover (ElevenLabs)

The house style used to be silent-with-cards. Guides in the **guide track** are narrated:
the cards carry the headline, the voice carries the explanation. Everything else about the
pipeline is unchanged — the render is still produced silent and the audio is muxed on after.

```bash
# 1. the composition must exist and be timed, because the audio is placed off ITS timeline
node <skill>/scripts/audit-composition.mjs . --timeline

# 2. generate (resumable — skips lines that already exist)
ELEVENLABS_API_KEY=… node <skill>/scripts/make-audio.mjs

# 3. render SILENT into assets/, not renders/
node "$HYPERFRAMES_CLI" render . -q high --crf 14 -o ./assets/silent-master.mp4

# 4. mux (copies the video stream — seconds, and cannot degrade the picture)
node <skill>/scripts/mux-audio.mjs --out ./renders/<slug>_1080.mp4
```

## narration.mjs

One file per project, next to `index.html`:

```js
export const voice = 'JBFqnCBsd6RMkjVDRZzb';        // a premade voice — works on any plan
export const model = 'eleven_multilingual_v2';      // multilingual unless the track is English
export const language = 'en';                       // drives the transcription model in verify-narration
export const sections = [
  { id: '01-intro', anchor: 'intro', text: 'Workspaces are where your content stays.' },
  { id: '07-personal', anchor: 'b7a', text: 'One is already there: your personal workspace.' },
];
```

`anchor` is a **clip id from `timeline.json`**, not a timestamp. That is the whole point:
re-time the cut and the audio follows, because both are derived from `index.html`. A line
anchored to a hand-typed second breaks the moment a beat moves.

Wording quality (grammar, audience fit, tone) belongs to the **`video-plan` skill**, not to
a separate pass here — get it right while drafting `SCRIPT.md`, since `narration.mjs` is a
near-verbatim copy of that text. The full checklist (twelve grammar failure patterns, plus
audience-fit and tone guidance) is in `video-plan/references/spoken-track.md`.

## 🗣 Proper nouns: spell them for the voice, not for the reader

> **This rule is enforced — `scripts/verify-narration.mjs` fails the build if the voice does
> not say it.** It is enforced *because* it was ignored: a build wrote the brand name into
> `narration.mjs` as it is written on screen, the fit table said yes, every section measured
> about -2 dB, and the shipped narration mispronounced the brand in both places it was spoken.
> Nothing in the pipeline noticed, because nothing in the pipeline read the words.

TTS engines mangle short brand names, acronyms and foreign-language words in predictable ways —
especially a short English brand word inside a sentence in another language, which the model
reads with that language's phonics. The fix is always the same shape:

- **Respell the word phonetically in the TTS input only.** Every visible surface keeps the real
  spelling: caption cards, the intro title, `SCRIPT.md`, `PLAN.md`, filenames, chapter titles.
- **`narration.mjs` is the ONLY file that ever contains the respelling.** If it reaches a card,
  that is a defect a reviewer catches instantly. Put a comment at the top of `narration.mjs`
  saying so, or the next person "fixes" the typo.
- **The respelling can be context-dependent**, and usually is: a name may only break before a
  word in the other language and be fine before an English one. Write the split explicitly and
  apply it from the first draft rather than rediscovering it per project.

| surface | spelling |
| --- | --- |
| `narration.mjs` — the string that goes to the TTS API | the phonetic respelling |
| caption cards, intro title, outro — anything rendered | the real brand spelling, always |
| `SCRIPT.md` spoken lines — a human reads this for approval | the real spelling, plus a note that the TTS input differs |
| `PLAN.md`, filenames, chapter titles | the real spelling |

**Declare the respelling so the checker knows about it**, right next to `voice` and `model`:

```js
export const pronunciations = { Akkme: 'ACME' };   // TTS spelling -> what must be HEARD
```

Without this, `verify-narration.mjs` diffs the transcript against the *input* spelling and
flags the fix as the defect — the ASR hears "acme", the source says `Akkme`, and the check
fails on a line that is now correct. With it, the check verifies the **intended spoken form**,
which is the thing you actually care about: it proves the respelling did what it was for. Keep
the map in sync when you add a respelling, or the new one is unverified.

**A passing transcript is necessary, not sufficient.** Actual vowel quality is indistinguishable
from a correct reading to an ASR check, since the transcriber maps both back to the same word
regardless of how it sounded. That class of defect can only be caught by a human listening; if
a fresh take still sounds wrong by ear, it needs another take, not another transcript.

Others in this family, worth listening for before you ship: acronyms the model spells out
letter-by-letter, and product words from one language sitting inside a sentence in another.

**Re-check the fit table and re-measure the phrases after any respelling — and after any
regeneration at all, even with no wording change.** Changing a word changes the line's length
*and* how it splits: one rewrite took an intro line from four phrases to three and the build
script threw, because a Part 1 highlight pointed at phrase #3. That throw is correct behaviour —
better a hard failure than a highlight landing on the wrong card. A fresh take of *unchanged*
text can still shift the measured phrase count (different pauses, same words), which can
silently break a `PH()`-driven cue — so always re-run `measure-speech.mjs` and re-verify cue
indices after ANY audio regeneration, not just a re-worded one. Index trailing highlights from
the END of a line (`lastPhrase(id, 0)`) so a re-record that splits differently cannot silently
mistime them.

## The fit table is a gate, not a report

`make-audio.mjs` prints, per line, how long the speech is and how long its beat is:

```
  section              starts   speech   window   fits
  02-difference         8.5s    13.8s    14.6s   yes
  12-delete           129.1s    14.4s    12.3s   NO (+2.1s)
```

A `NO` means the line will still be talking when the next one starts. **Fix it before
rendering**, and prefer widening the beat over cutting the copy (`guide-track-build.md` → Narration
drives the timing). For a still, widening is free — a freeze frame can be any length, with
no re-recorded footage and no re-encode. **A real video clip is not free** — its declared
duration must equal the asset's actual decoded length, and the audit hard-fails on any
mismatch — so reach for a still in the same action group first (an `action()`-built beat is
approach-video → freeze-still → result-video; the still in the middle is almost always the
one with slack). Widening a still touches **two places**, and both must move together or the
next `build-assets.mjs` run silently reverts it:

```
asset-seconds.json:  "b8b": 4.6,   ->  "b8b": 5.6,          # what make-index.mjs reads NOW
build-assets.mjs:     freezeSeconds: 4.6                     # what regenerates it LATER
```

Editing only `asset-seconds.json` works for the render in front of you; editing only
`build-assets.mjs` does nothing until someone re-runs it. Change both in the same pass.

### Two ways the fit table lies to you

Both of these cost a confused round in the Skills build, because the table came back
*identical* after a real change — which reads as "my edit did nothing" rather than "you are
looking at stale data".

1. **It reads `timeline.json`, which the audit writes.** Change a clip duration and the
   windows only move once you re-run
   `audit-composition.mjs . --timeline`. Skip that and every window is the previous cut's.
   Order is: change durations → regenerate the composition → **audit `--timeline`** →
   `make-audio`.

2. **It is resumable, and it keys on the section id.** Reword a line and the old mp3 is reused
   silently, so `speech` does not change. Delete that section's file first:

   ```bash
   rm assets/audio/12-uebergeordnet.mp3 && node <skill>/scripts/make-audio.mjs
   ```

Sanity check: if you changed something and the numbers are byte-identical, you hit one of
these two — not a no-op edit.

## Verify by measuring, never by trusting the mux

A successful `ffmpeg` exit tells you a track was written, not that speech landed where you
think. Measure each section:

```bash
ffmpeg -hide_banner -nostats -ss <start> -t <dur> -i renders/<slug>_1080.mp4 \
  -af volumedetect -f null -
```

Narrated sections should read above **-25 dB** peak; sections you did not narrate should read
around **-91 dB** (digital silence). Both directions matter — a line delayed to the wrong
offset shows up as speech in a section that should be quiet.

> **`-v error` suppresses `volumedetect`'s output**, because it reports at info level. Use
> `-hide_banner -nostats` instead, or you get a table of `?` and conclude nothing.

A healthy full-video read: integrated **≈ -19 LUFS**, true peak **≈ -1.5 dBFS**
(`-af ebur128=peak=true`).

## Then verify the WORDS — measurement cannot

Levels and pauses describe the shape of the sound. A mispronounced word has a normal
duration, a normal level and normal pauses, so the fit table, `volumedetect` and
`silencedetect` all pass it by construction. Until this runs, "audio verified" means
"placement verified":

```bash
node <skill>/scripts/verify-narration.mjs .          # exit 1 = the voice misreads something
```

It transcribes every line and diffs it against `narration.mjs`. **Set `language` in
`narration.mjs`**: for anything other than English it uses whisper `large-v3`, because the `.en`
models return English-shaped nonsense for non-English audio. Results are cached beside each mp3
and keyed on the mp3's mtime, so a re-record re-transcribes only what changed.

**Read the printed diff even on a pass.** A wrong word in thirty is ~3%, which no sane
threshold fails — but the word a TTS breaks is nearly always a brand name or an acronym, and
that is also the word a viewer notices. So dotted names (`Acme.ai`), embedded capitals
(`HubSpot`) and bare acronyms (`MCP`, `OCR`) are checked as individual tokens and any miss is
an error whatever the rate. Typical healthy output is most lines at `0% off` with a handful of
`⚠` lines that are pure ASR noise:

```
  ✗   03-sections            8% off  (2/26 words)
  ⚠   04-model               6% off  (2/35 words)      <- a loanword heard in the other language: noise
  ✗ 03-sections: the voice never says "ACME.ai" — heard instead: "ackmy eye"
```

Fixing a flagged proper noun is the respelling above, then: delete that section's mp3,
re-run `make-audio.mjs`, re-run this. And re-run `measure-speech.mjs` afterwards — a
respelling changes how the line splits, which can move the Part 1 highlight cues.

## Voices

- **Premade voices work on any plan.** Verified working: `JBFqnCBsd6RMkjVDRZzb` (George),
  `pFZP5JQG7iQjIQuC4Bku` (Lily), `onwK4e9ZLuTAKqWW03F9` (Daniel).
- **Voice-library voices need a paid plan.** A free key returns
  `402 paid_plan_required — "Free users cannot use library voices via the API."` This is the
  error you get for a voice picked from elevenlabs.io/app/voice-library, and no amount of
  retrying fixes it.
- **You cannot hear the result.** Pronunciation, accent and emphasis are the user's call —
  say so plainly rather than implying the audio was checked. What you *can* verify is
  placement and level; do that, and report it as what it is.
- Switching voice regenerates everything, so settle the voice before generating 16 lines:
  `rm assets/audio/*.mp3 && node <skill>/scripts/make-audio.mjs --voice <id>`.

## Quota

The API key is usually scoped without `user_read`, so `/v1/user`, `/v1/user/subscription`
and the voice library all return `401 missing_permissions` — you cannot read the plan or the
remaining credits directly. **The only reliable signal is a TTS call**, whose error names the
numbers:

```
quota_exceeded — "This request exceeds your quota of 10000.
                  You have 32 credits remaining, while 117 credits are required."
```

`make-audio.mjs` therefore never aborts the whole run on a failure: it deletes the stub,
warns with the API's own message, and carries on, so a mid-run quota exhaustion still yields
a usable partial video and a re-run fills only the gaps.

If a user says they topped up and the numbers have not moved, the key is on a different
account or workspace than the upgrade — check which key `.env` actually holds before
assuming propagation delay.
