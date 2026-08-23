# Building a guide-track video

The *format* — two parts, what each frame says, how the steps are ordered — belongs to the
`video-plan` skill (`video-plan/references/guide-format.md`). This file is the
production half: how the concept panels are built and kept alive, how one action beat is cut, and the loop that fits the
picture to the narration.

Read it when the approved concept says "guide". A plain demo needs none of it.

## The shape of one action beat

Every action in Part 2 uses the same three-part figure, and the consistency is what makes the
video followable:

```
approach   cursor glides to the control                  ~1.2s  1x
freeze     the frame STOPS on the click                  ~3.4s  spotlight + click pulse
result     what happened, then it SETTLES before cutting ~5-8s  1.15-1.3x
```

- **Freeze longer than feels necessary.** 2.6s read as rushed; 3.4s reads as the video pausing
  to explain itself.
- **Never cut the instant the click lands.** Every result clip runs on past the action so the
  finished state sits there. A reviewer's exact words: *"If you click on something, visualise it
  and don't cut away instantly after a click."*
- **Keep the result near real time.** 1.7x was too fast to follow; 1.15-1.3x is right. Only an
  agent's thinking time earns heavy compression (3-4x), and even then split the clip so the
  *human* actions stay slow and only the wait is sped up.
- The freeze is cut from the **`_hover` mark**, not the click mark — see
  `playwright-capture.md` §16, and `design-system.md` → Freeze frames for the hard-cut trio.

### Click pulses

Every click is logged during capture (`markClick()` writes the exact point into `beats.json`)
and the composition rings an expanding circle there at the moment of the click, before the
spotlight fades in. So the viewer sees *the click land*, then *where to look*. Coordinates are
derived, never hand-placed — `design-system.md` → "Click pulse" has the markup, including why
the pulse must be wrapped in a `.scrim`.

## Concept panels need choreography, or they read as frozen

Part 1 frames are built markup, so nothing in them moves unless you move it. Without
choreography they sit still for their whole beat and `freezedetect` reports them — correctly.

**Highlight what the voice is talking about, right now.** That is the rule; "something must move
every ~5s" is only its side effect. Stagger the content in, then walk the frame in step with the
narration: one card lights up while its word is said, then the next. It turns a static frame
into a guided read.

Get the timings by **measuring the rendered narration**, never by estimating:

```bash
node <skill>/scripts/make-audio.mjs         # first, so the mp3s exist
node <skill>/scripts/measure-speech.mjs .   # -> speech-phrases.json
```

It reads the pauses the voice actually took (`silencedetect`). A five-card frame wants a line
that splits into five runs — the printed counts tell you before you wire anything up. Estimating
the offsets from character counts drifts up to a second on a long sentence, which is enough to
light the wrong card.

**How far the others drop back is a per-panel decision, not a constant.** Dimming the
non-active members to ~40% organises a row of cards (it reads as a list being worked through).
The same 40% on a *diagram* greys out the arrows and labels that are the content, and on a
column that is already deliberately faded it erases it. Both were flagged in review as "too
much fading". Use ~40% for card rows, ~80% for diagrams, and none where the layout already
carries the contrast — the scale change alone still keeps `freezedetect` quiet.

**Animate transforms, not shadows, and animate something big enough.** A `boxShadow` tween
rendered as no visible change at all and left one frame frozen 9.9s. A `scale` on 64px icons was
likewise too subtle — and so was popping a small chip: at ~90px it moves too little of the frame
to count as change, and `freezedetect` still reported 7.1s frozen. Scale a whole card or a whole
flow section.

Two more cues measured below the threshold, both of which *look* like motion while authoring: a
**6% scale on a thin outline box** (a 70px-wide stroked rect — 7.8s reported frozen straight
through it), and **one short text line fading in** (a single ~28px label; the run was still
reported frozen across it). Reliable change means several distinct elements arriving, or a whole
card / panel / flow moving. When a cue does not clear a freeze, it did not fire visually — do
not add a second small one on top, replace it.

**A metronome is not choreography.** One fix here pulsed the panel body every 4s. It silenced
`freezedetect` and read as exactly what it was: a uniform tic unrelated to the content. If a
frame has nothing worth highlighting at that moment, it is usually too long.

The content-driven fill is almost always *more* granular, not more decorative: where one label
was fading in, land **one item per name** instead. Four destinations arriving one per spoken
name filled a 5s hole that a single reveal had not, and reads better besides.

## Widening and dead-air filling are ONE loop

Narration drives the timing, so beats get widened to fit lines. **Every second you add to a
concept panel is a second with no choreography in it.** One build widened four panels to fix the
fit table and immediately had six new `freezedetect` stretches over 4s that had not existed
before. So the order is:

```
make-audio  → fit table all "yes"?      ─┐  widen panels / freezes, or cut copy
measure-speech → rebuild the composition │
freezedetect on the render → all designed?┘  add narration-driven cues where the gaps are
```

Re-run `freezedetect` after *any* panel widening, and expect a second choreography pass. The
per-asset checks in `audit-composition.mjs` will not catch this: built concept panels are not
assets, so the whole-composite sweep on the finished MP4 is the only thing that sees them.

**Widening a still is free; widening a real video clip is not** — a clip's declared duration must
equal its asset's decoded length, and the audit hard-fails on a mismatch. So reach for the freeze
still in the same action group first; it is the beat with slack. Widening a still touches **two
places**, and both must move together or the next asset build silently reverts it:

```
asset-seconds.json:  "b8b": 4.6,   ->  "b8b": 5.6,          # what the composition reads NOW
build-assets.mjs:     freezeSeconds: 4.6                     # what regenerates it LATER
```

`make-audio.mjs` prints a fit table for exactly this; treat any `NO (+Xs)` as a blocker.

## Numbering on cards

ASCII only for any numbering on a caption card: `1.`, `2.`, `3.` — **never** circled numerals
(①②③), which have no glyph in the render font and silently fall back to a generic box. The
audit's glyph check catches this, but it is cheaper not to write it.

This applies to **numbering only**. Body copy, headlines, card sublines, panel text and
narration are normal text in the video's language, accents and all. Writing an accented word in
ASCII transliteration in a caption is a defect, and a reviewer will flag it.
