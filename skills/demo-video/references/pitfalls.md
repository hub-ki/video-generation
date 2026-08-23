# Pitfalls (learned the hard way — read before rendering)

> Pitfalls **#1 (frozen footage)** and **#6 (env landmines)** only bite when using the
> stripped Remotion-fallback ffmpeg. With a real ffmpeg on PATH (which
> `setup-render-env.sh` prefers) they don't occur — but keep #1's *verify-motion*
> habit regardless. Everything else applies always; a few are path-specific
> (#9, #11-#12 hand-screencast only; #17 capture-path only).
>
> **Filming a website you do not own has its own set**, and they are not repeated here:
> consent walls, sticky headers, lazy-load rect drift, scroll-reveal animations, and when
> live motion should be kept rather than frozen. See `references/foreign-sites.md`.

## 1. A single frame CANNOT tell you if footage is moving

The biggest time-sink. Checking one frame per beat looks fine even when the video
is **frozen on its first frame**. Always verify motion by extracting **two frames far
apart within the same beat** and confirming the content advanced (typing grew,
reasoning streamed, table appeared). If they're identical, the footage is frozen.

Root cause we hit: the render extracts video frames with `-vf fps=30`, which the
stripped ffmpeg rejects → 0 frames extracted → every clip freezes on frame 0. The
wrapper strips `fps=` so extraction falls back to native 30fps and works. Confirm in
the render log: `extractedVideoCount` and `totalFramesExtracted` must be non-zero.

## 2. The render path and the snapshot path disagree

`hyperframes snapshot` seeks a live `<video>` in the browser; `render` extracts frames
via ffmpeg. They can show different footage for the same time. **Snapshots are for
fast layout/framing checks; always re-verify the final content from the rendered MP4.**

## 3. The render ignores `data-media-start`

You cannot point one master video at different in-points per beat. Pre-cut a separate
file per beat that already begins at the right moment (ffmpeg-recipes → "Cut a beat clip").

## 4. `backdrop-filter` forces a slower, video-freezing capture mode

Any `backdrop-filter:blur()` makes the renderer fall back to screenshot capture. Avoid
it — use solid/translucent backgrounds on cards instead.

## 5. VFR source → nonlinear time

Screen recordings are variable-frame-rate. Sample times and HyperFrames seeking won't
agree until you transcode to a **CFR master** (`-r 30`). Do it first, work off the master.

## 6. macOS environment landmines

- **No ffmpeg, broken brew** (macOS 26 "unsupported"): use the Remotion-bundled ffmpeg via wrappers — never try to `brew install`.
- **Bogus "Low disk space / 0.0 GB free"**: `statfsSync` returns `bsize=0`; disk is actually fine. Patch the CLI's `getFreeDiskMb` (the setup script does this).
- **`bunx` ignores your patches**: it re-materialises a fresh copy each run. Install hyperframes locally (`bun add --backend=copyfile hyperframes@<ver>`) and run the patched local copy: `bun <project>/node_modules/hyperframes/dist/cli.js render ...`.
- **TCC / permissions**: `~/Desktop`, `~/Downloads`, `~/Documents` are unreadable by the shell. Ask the user to move the recording into the working directory (or anywhere outside those three) — you cannot even `cp` it out of Desktop.

## 7. Overlapping clips on the same track = hard error

Crossfades require overlap; put adjacent beats on alternating `data-track-index`.

## 8. Iterate on snapshots, not renders

`snapshot --at t1,t2,...` is seconds; a full render is 1-5 min (4K longer). Nail the
framing, spotlight coords, overlay copy, and privacy on snapshots first. Only render
when the stills are right — then verify motion (pitfall #1) once.

## 9. The green recording line

macOS's screen-record indicator leaves a ~2px green line at the left of the frame.
It survives a loose crop — bump the crop's X origin ~8px past the app's left edge.

## 10. Quality knobs

`-q high` is the top preset; push further with `--crf 14` (near-lossless, still small
because flat graphics compress well) and `--resolution landscape-4k` for a crisp 4K
master (renders at 2× DPR; ~4× render time). **Render 1080p only until the user signs
off** (SKILL.md Phase 6), then produce the 4K.

Note the 4K's real ceiling: overlays/spotlights/cards are CSS and scale genuinely
sharp, but the *footage* is upscaled (a 2506px-wide capture in a 3360px-wide window ≈
1.34×). It looks clean; it isn't app-pixel-native. Say so rather than implying otherwise.

## 11. macOS click indicators are baked into the footage

If screen-recording click-visualisation is on, every click leaves an **expanding black
ring** around the cursor, burned into the pixels. It reads as a stray UI artifact and
users will ask you to remove it. It is *not* something you added — and it recurs at
every click, so **when you find one, sweep for the others** rather than fixing one and
noting the rest. (We fixed the one the user named, left the second, and they had to ask
twice.)

Removing it: don't inpaint. The cursor is stationary through the click, so simply
**excise the ring frames** — the cut then reads as the click landing (the menu/dialog
pops open). See ffmpeg-recipes → "Excise frames".

## 12. Frame-boundary off-by-one silently keeps the frame you're deleting

`trim=start:end` compares against real frame PTS, which land on multiples of `1/fps`.
At 30fps a frame exists at `265.3667`, so `trim=265.2:265.37` **includes** it
(`265.3667 < 265.37`) — the excision "succeeds", the artifact survives, and nothing
errors. We shipped exactly this and only caught it by re-scanning the output.

- Find the artifact's frames **programmatically** (probe a region only it touches, and
  watch the dark-pixel count step: e.g. baseline 2136 → 2354 across exactly 8 frames).
- Set boundaries **between** frame times, from the real frame times — not from a number
  you eyeballed off a contact sheet.
- **Re-scan every frame of the produced clip** to prove zero remain. Sampling can miss a
  single surviving frame; a 30fps scan of a 1s window is cheap.

## 13. Pixel-diff percentages lie unless you isolate the variable

Diffing two frames is the right instinct (pitfall #1) but the number needs reading:

- **0.34% can be real motion.** Sparse dark text streaming on a white app is a tiny
  pixel fraction. Check the diff **bbox**: spanning the whole window = content moving;
  confined to one corner = only your overlay animating.
- **55% can be a frozen frame.** A spotlight fading in/out, a modal scrim, or a screen
  dimming swamps everything else.

So: compare two moments where **only the footage** differs (overlays settled, no scrim
transition). If you can't isolate it, crop the region and *look* — several times this
session the numbers were ambiguous and one zoomed crop was decisive.

**Compute the settled window; don't eyeball it** — the formula and the freeze-verify
procedure live in **#16**. Diffing outside that window measures the scrim, not the
footage, and reports a frozen still as "MOVING" with a diff of 30+.

**There is no global threshold.** On a CRF-14 h264 file the noise floor scales with local
detail: a flat empty corner read **0.03** while a text-dense panel read **0.14** in the very
same frame pair — both pure noise. A fixed `< 0.02` rule therefore fails a perfectly frozen
still. Two reliable moves instead:

- **Compare against a provably static region** in the same pair (the bare canvas). If your
  region of interest is within ~4x of that floor, it's noise.
- **Amplify and look** — `ImageChops.multiply(difference(a,b), (20,20,20))`. Real motion glows;
  noise stays black. This settled in one read what three numeric thresholds had argued about.

## 14. "It's blurry when shared" — check the maths before touching the encoder

Only relevant if someone must watch a **streamed 1080p** version rather than the 4K
(Teams caps *playback* at 1080p; downloading gives them the full-res file). If that
happens, do the arithmetic before blaming the codec:

```
text_on_screen = source_text_px * (WIN_W / asset_w) * (output_h / 1080)
```

A 2506px recording with 12px text in a 1680px window = **8px at 1080p, 16px at 4K**. UI
text needs ~11px to resolve; below that it's grey mush no matter what. **No CRF, bitrate,
supersampling or 4K render can fix it** — we burned hours proving that. The tell is
"sharp in QuickTime, blurry on Teams": that's the 4K reading fine and the 1080p stream
falling under the floor, i.e. one fact, not two.

Real fixes, in order: **capture it yourself and choose the text size**
(`playwright-capture.md` — measured 1.5x bigger text than the same flow hand-recorded, which
moves 8px→12px at 1080p and removes the problem at source); **deliver the 4K** (the detail is
already there); **punch in** (crop each beat ~1:1 so nothing is downscaled, at the cost of
showing ~45% of the app); or **re-record narrower**. Nothing else moves it.

> **Do not assume a screencast is retina.** It is easy to reason "2672px wide ÷ 2 = a 1336
> CSS window, so 13px text is 26 device px and lands crisp" — and be wrong by 2x. Measure the
> **ink height of a known label** instead: one app's "Built-in" label came out at **11px in a
> 2508px-wide crop**, i.e. a **1x** recording of a ~2509 CSS-px layout, not a 2x recording of
> a 1254 one. (For comparison a 2x Playwright capture of the same label = 21px.) This matters
> because the whole "the 4K is the deliverable" rule exists *because* the source is 1x.

## 15. A check that can't fail isn't a check

Three separate false PASSes in one session, all the same shape — **the test didn't exercise
the thing it claimed to**:

- **Waiting on a file that already exists.** `until [ -f renders/out.mp4 ]` fires instantly
  when a *previous* render left that file there, so "render complete" was reported while the
  new one was still running — and the verification then measured the **old** file (the tell:
  duration 48.2s for a 43.4s composition). Wait on **mtime changing**, or delete the target
  first. Same for `ls`-based checks.
- **Trusting a dimension as a quality check.** A 1x page padded into a 2508-wide canvas
  *reports* 2508 wide. Verify the property you actually care about (`dpr-fixture.html`'s 0.5px
  stripes), not a proxy for it.
- **Trusting an element's self-reported geometry.** `getBoundingClientRect()` returned a
  plausible number for a cursor that was rendering 2x off-screen. The ground truth was a
  pixel-diff of two screenshots.

Before believing a green check, ask: *if the thing were broken right now, would this have
gone red?* If you can't say yes, it isn't evidence.


## 16. Verifying a freeze ACROSS its spotlight's fade gives a confident wrong answer

The single most repeated mistake in this skill's history. `spot()` ramps opacity in over ~0.9s
(after a 0.1s delay) and out over the last 0.6s. Sample two frames anywhere inside those ramps
and you measure **the scrim**, not the footage — a genuinely frozen still reports 30-70% of
pixels "moving" and looks like a broken freeze.

*I hit this four separate times in one session*, each time briefly believing a correct freeze
was broken. Compute the settled window instead of eyeballing it:

```
spot(t, tEnd)    settled = [t + 1.00, tEnd - 0.60]    # 0.1s delay + 0.9s in; 0.55s out from tEnd-0.6
label(t, tEnd)   settled = [t + 0.75, tEnd - 0.50]    # if a card also overlaps, intersect both
sample strictly inside that (the intersection, minus a 0.05s margin)
```

Then a real freeze reads `max diff 3-6, 0.00% moved` — the same as a provably-static crop of
the bare canvas, which is the baseline you should always measure alongside it. A genuinely
moving beat reads `max ~240, 5-70% moved`. Those three numbers are far enough apart that the
verdict is never ambiguous **once you sample in the right window**.

## 17. A half-running app stack looks exactly like an empty account

This is the single most expensive class of capture bug, because **every one of these renders a
plausible page with no data** — so it reads as "this test account is empty" rather than "a
service is down", and you shoot it. The shapes repeat across stacks:

| symptom | usual cause |
| --- | --- |
| a list or tree renders empty, and its API call is a 500 | the **authorization service** is down; every list query is a permission check first |
| an editor shows "offline / not syncing" and no edit ever persists | the **realtime/websocket** service is misconfigured or predates an env var it now needs |
| a service crashes on a missing env var that plainly IS in `.env` | the task runner runs in strict env mode and the key is not on its pass-through list |
| new code never takes effect, old behaviour persists | **stale processes from a previous session still hold the ports**, so the new ones exit |
| the stack reports success but one service is down | compose **aborts on the first port conflict** and silently skips everything after it |

So: **load the exact route you are about to record, signed in as the capture user, and confirm
real data is on it** — before the first `node capture.js`, and again after any restart. Reading
the stack's own logs beats reading its exit code; a compose run that "succeeded" can have
skipped half its services.

## 18. Composition bugs that `check` cannot see

All four shipped in one real build and were caught by reading frames, not by a linter.

- **A card bound to a clip, not to an ACTION**, runs into the next action's approach shot.
  An "Export and earlier versions" card sat over the delete dialog for 3s. Bind cards to
  the action group and end them when the next group starts.
- **One card per action is not enough.** The delete step needs two (name the control, then
  warn about the dialog). An implementation that took `members.find(a => a.kick)` silently
  dropped the second card — it simply never appeared, with no error anywhere.
- **`label()` animates the inner `.ov`.** Hiding the outer wrapper at `t=0` (which the linter
  asks for on full-frame clips) makes the card invisible for the entire video. Hide
  `#ov_x .ov`, not `#ov_x`.
- **Crossfade boundaries need the clips to OVERLAP by `XF`.** Laid end-to-end, the outgoing
  fade dips toward the bare canvas with nothing fading in. Hard-cut boundaries must NOT
  overlap. Derive this from each clip's in/out mode rather than spacing everything evenly.

## 19. Do not edit generated files positionally

Two self-inflicted wounds worth naming, because both were invisible until read:

- Slicing a source file with `index(start) … index(end)` where the end marker is absent
  truncates everything to EOF. It deleted the entire timeline+template tail of a generator.
  Anchor on a marker you have just confirmed exists.
- Rewriting timestamps in `SCRIPT.md` by position shifted every window by one as soon as a
  section was inserted. **Key doc rewrites on the section title**, never on order.

## 20. A hardcoded absolute path in `make-index.mjs` only fails on someone else's machine

`readFileSync("/Users/<name>/...")` for a shared asset (a logo mark, a shared template
fragment) works fine for whoever wrote it and silently breaks the render for anyone else who
opens the project — including the same person on a different machine. It doesn't show up in
a diff review either, because the file otherwise looks correct. **When re-opening an
existing project you didn't just build, grep it for absolute paths before touching anything
else** (`grep -n "/Users/" make-index.mjs`) — finding one mid-render is a wasted render.
Fix: copy the asset into the project's own `assets/` and reference it with a relative path
(`readFileSync("assets/logo-mark.svg")`), the same way every other project-local asset is
loaded. Never "fix" it by hardcoding the CURRENT machine's username instead — that just
moves the same failure to the next machine.

## 21. An un-classed LOGO constant can render fine next to text and vanish completely alone

A brand's own logo SVG usually ships with no `class` attribute — so when a build script injects
the mark rather than using the template's `LOGO` slots, it must add the class where the constant
is built:
`readFileSync(...).replace('<svg ', '<svg class="logo" ')`. Skip that injection and the SVG
has no explicit width/height, so it falls back to default replaced-element sizing. On the
intro card (logo + title text as siblings) this can still look plausible — oversized, but
visible, easy to mistake for "fine" on a quick glance. On a brand-only outro (logo alone in
a `.card { display:grid; place-items:center }` container, especially after removing that
card's subtitle so the logo is the ONLY child) the same missing class rendered the frame
**completely blank** — no error, no warning, a silent empty composite that only showed up by
extracting an actual frame from the rendered file and looking at it. Verify the fix the same
way: don't trust a snapshot tool that might be serving a stale render — pull a real frame
with `ffmpeg -ss <t> -i renders/<slug>_1080.mp4 -frames:v 1 out.png` and open it. If a project
defines its own `LOGO` constant instead of importing the skill's, check that the class
injection is actually there before assuming the pattern "just works" like it does elsewhere.

## 22. An emptied divider div needs `card` in its class, even though `.card` paints nothing

The "empty clip, audio-only bridge" technique (design-system.md → "Concept panels and the
Teil 1 → Teil 2 bridge" — the default now, not just a fallback) drops a divider's inner
markup but keeps `class="clip"` on the div. `verify-material.mjs` builds its list of
"cards to check for occlusion" as *everything that is not* `win`/`scrim`/`card`/a pulse layer
— so a bare `class="clip"` div with no `.ov` inside falls into that catch-all, and the script
assumes it's an unmodelled card sitting at the *default* `.ov{left,bottom}` anchor position.
If that assumed rectangle happens to overlap the next beat's `data-roi` in time, you get a
hard error — `"pX covers NN% of what cYY is about. The card is opaque"` — for a div that is
genuinely invisible (no background, no children, opacity affects nothing when there's
nothing to show). Whether this fires depends on incidental timing/geometry, which is why the
identical pattern passes clean in one project and errors in another. Fix: keep `card` in the
div's class list (`class="clip card"`) even though it's empty — `.card` itself is layout-only
(`display:grid; place-items:center`), so this changes nothing visible, it just tells the
script to skip the div entirely rather than guess where its (nonexistent) content sits.
Confirm with a real snapshot at the reported timestamp before assuming either the error or
the fix is correct — don't trust the tool's verdict over your own eyes in either direction.

## 23. A background render/mux "completed" notification is not proof it succeeded

The task-notification system reports a background Bash command as `completed` the moment the
shell process exits — it says nothing about the exit code. `mux-audio.mjs` crashed with
`ffmpeg ... exit status 254` (a stale `plan.json` still listed two audio files that had just
been deleted after removing beats from the script) while the notification still read
"completed", and the summary line gave no hint of failure either. Trusting that summary and
moving on left `renders/<slug>_1080.mp4` **silently unchanged from the previous render** —
same filename, so nothing looked wrong until a duration check (`ffprobe -show_entries
format=duration`) came back with the OLD video's length instead of the new, shorter one.
Root cause: `make-audio.mjs` is resumable and only *adds* rows to `plan.json` for sections
still in `narration.mjs` — it never *prunes* rows for sections you deleted, so a stale
`plan.json` outlives the edit that should have invalidated it. Fix and prevention: (1) after
removing any section from `narration.mjs`, delete `assets/audio/plan.json` too (not just the
orphaned `.mp3`) and rerun `make-audio.mjs` so it rebuilds the plan from scratch; (2) for
render and mux specifically, don't rely on the task-notification summary — either capture the
command with `echo "EXIT CODE: $?"` after it (as shown here) or check the output file's own
duration/timestamp against what you expect before declaring the step done.

## 24. ElevenLabs occasionally hallucinates extra words after the real sentence ends

A user reported "weird noises" in a gap between two narrated lines, right after the words
"...mit deinen Rechten." Silence detection (`silencedetect` at -30/-35/-45/-50dB) and several
zoomed spectrograms all measured that gap as clean digital silence — because the check was
looking in the wrong place. The actual defect was in a *different* take of the same line:
regenerating it and transcribing the result (not just measuring its volume) produced "...mit
deinen Rechten. **Uns Eden.**" — two words ElevenLabs invented that were never in the input
text, appended after the real sentence, inside the same mp3 file. `mux-audio.mjs` plays each
file in full at its offset, so this hallucinated tail plays wherever it lands — often right
where a silent gap was expected. A second regeneration produced a different hallucination
("...mit deinen Rechten **in Steeds**."); a third and fourth came back clean.

The tell in `verify-narration.mjs`'s word-diff output is a `+word` with **no matching
`-word`** — a pure insertion, not a substitution. Ordinary ASR noise (compound-splitting,
punctuation) always comes in matched pairs (`-dazuholen +dazu +holen`); an unpaired `+`
insertion at the *end* of a line's diff is the hallucination signature. This is easy to
mistake for harmless noise if you only skim the diff for "is the error count 0" — the check
still reports 0 errors (WER stays low on an otherwise-perfect line), so the line reads as
"ok" unless you actually read what the extra words say.

Fix: don't just re-run `make-audio.mjs` and trust the fit table — after regenerating a line,
transcribe it (`node $HYPERFRAMES_CLI transcribe <mp3> --dir <scratch> --model large-v3
--language de --json`) and read the full text back, specifically checking that it *ends*
where the input text ends. Regenerate (a few takes if needed) until one comes back clean, the
same hand-picking technique already used for pronunciation fixes. Measuring silence or volume
alone cannot catch this class of defect — it requires reading the transcript.

## 25. Cleaning up by title cannot work when the app names things for you

If the app auto-titles records, the same scripted run produces a different title each time. One
demo prompt yielded "Friendly deadline reminder email", "Friendly reminder email draft" and
"Friendly Friday deadline reminder" across three runs — so a title-matching cleanup kept
missing one, the leftovers stacked up as duplicate rows **in the next capture's footage**, and
the fix was another re-capture. Four rounds went this way.

Record identity at creation time and delete by id: `scripts/app-state.mjs snapshot` before the
first run, `restore --go` at the end. Title matching is only ever a fallback for records whose
ids you failed to record.

**With seeded demo data, `restore` is all-or-nothing — delete surgically between takes.** If you
seed throwaway conversations for a clean sidebar, `restore --go` (everything since the snapshot)
would wipe the seeds too, and re-seeding between takes is slow. Keep a **protected set = baseline
ids ∪ seed ids** and delete only what falls outside it. That clears the capture's own artifacts
(the sent prompt's chat, stray "Untitled" rows) so the next take's footage is
clean, while the seeds survive. Run the full `restore` only at sign-off.

## 26. A keyword prompt can auto-activate a connected skill — and break the hero beat

The opening "just ask a question" beat is the one that must look effortless. But if the account
has connected skills, the assistant may **auto-activate one on a keyword** and take a detour you
didn't want: an email prompt ("write a reminder email…") pulled in the connected Outlook skill,
which then errored mid-answer ("Resolve Date"), so the hero beat showed a broken tool run
instead of a clean reply. An earlier take of the *same* prompt had answered in plain text — the
activation is probabilistic, so re-running the same prompt is not a reliable fix.

For any beat that just needs "a question and its answer", use a **self-contained knowledge
prompt** no skill will grab (general advice, an explanation) rather than one whose keywords name
a connected tool (email, calendar, research, a document, an image). Confirm the answer is clean
by **reading the rendered beat**, not merely that a conversation was created.

---

## 27. Adding a way to fail without touching the way you recover

Whenever a change **increases the number of ways a run can die mid-flight**, the salvage path is
part of that change — not a follow-up.

The concrete case: the public-site capture path added five deliberate `throw` sites
(`stableRect`, `assertRectHeld` and friends fail loudly so a wrong rect never reaches the cut).
That is the right behaviour. But the capture template still closed the browser context, renamed
the webm and wrote `beats.json` *after* the beats, with no `try` — so any of those five throws
discarded every frame already filmed. The safety feature and the data loss shipped together, in
the same edit, and only the safety feature was thought about.

`recordVideo` is what makes it total: **Playwright finalises the file when the context closes**.
An unclosed context is not a truncated video, it is no video. The same applies to anything
written after the loop — a beat log, a manifest, a state file.

The rule generalises past this repo: a team running the per-scene variant of this pipeline had
one unresolvable host in scene 5 of 6 discard five finished recordings, because their job runner
had per-scene artefacts and all-or-nothing semantics on top of them. The granularity existed;
nothing used it.

**Salvage is not universal, though — its correct shape follows from what one file contains.**

| the capture file holds | on failure |
| --- | --- |
| many beats (this pipeline's run) | **keep it.** The earlier beats are complete footage, and Phase 4 composes one file per beat anyway |
| exactly one scene | **discard it.** A half-recorded scene is a half clip, and the one thing worse than losing it is letting it reach the cut |

Same mechanic, opposite right answer. Copy the reasoning, not the block.

## 28. `timeline_track_too_dense`, and a flat-colour spotlight reported as CUT

Two known rough edges that both look like defects and are not. They are here so nobody spends an
afternoon on them, and both are open.

**Track density.** The template stacks every caption card on one track and every spotlight on
another, which is what `references/design-system.md` tells you to do. Past about five cards
HyperFrames warns `timeline_track_too_dense`. The render is correct; the linter is objecting to a
shape the skill recommends. Either alternate across more track indices as the card count grows, or
read the warning as expected. The proper fix is scene sub-compositions, which the template does
not use yet.

**Flat colour read as a cut edge.** `verify-material.mjs` measures spotlight clearance on the
source pixels, and a spotlight over a large area of solid colour — a coloured module background,
a filled hero panel — can report all four edges as `CUT` while the headline inside is plainly
visible and well padded. The check cannot yet tell an even background from an edge of type or
subject matter.

When that happens: look at the cropped frame (`scripts/crop-spots.mjs`) and decide by eye. If the
subject is clear, say so in the beat's note — "clearance check overridden: spotlight sits on a flat
panel, verified from the crop" — and move on. Write the reason down every time. An override with a
reason is a judgement; an override without one is how a check gets ignored on the day it is right.
