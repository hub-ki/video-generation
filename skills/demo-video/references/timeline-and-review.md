# Plan, timeline, and the review loop


> **Three documents, three authorities — don't merge them.**
> `PLAN.md` is the *shape* (beats, targets, spotlight targets, privacy, writes), authored and
> approved before the shoot. `SCRIPT.md` is *every word* in playing order — card copy, what
> gets typed into the app, what the AI must answer, data created for the shoot — also
> approved before the shoot, and the source of truth for copy. `TIMELINE.md` is *generated*
> from `index.html` after the build and is the only place exact timestamps exist.
> Copy changes go into `SCRIPT.md` first, then `index.html`; timing changes go into
> `index.html` and regenerate. A hand-edited timeline, or a script kept only in the HTML,
> both rot the moment a beat moves.
Two artifacts per video, with **different authorities**. Confusing them is the whole trap:

| | `PLAN.md` | `TIMELINE.md` + `timeline.json` |
|---|---|---|
| what it is | **intent** — what the video should contain | **fact** — what the composition actually does |
| who writes it | you, before any cutting | generated from `index.html` |
| exact times? | **no** — target durations only | yes, frame-exact |
| when | Phase 2, approved before Phase 3 | every audit run, `--timeline` |
| edit by hand? | yes, that's the point | **never** |

## Why the timeline is generated and not written

`index.html`'s `data-start` / `data-duration` are what the renderer obeys. They are the timing.
Anything else claiming to know the timing is a **copy**, and a copy rots the moment a beat moves.

That failure is not hypothetical here. Moving one beat shifts every beat after it, and a beat that
was moved in one place but still carries its old timestamp somewhere else has already broken a cut
more than once — hence the standing rule to **grep for a beat's OLD timestamp after moving it**.
A stale timestamp list is worse than none: review feedback arrives as
"0:12 drags", the stale file says 0:12 is beat 4, beat 4 has actually moved to 0:14 — and you
confidently retime the wrong clip. Then the render disagrees with the notes and nobody knows which
is wrong.

So: regenerate, never maintain. It costs nothing.

```bash
node <skill>/scripts/audit-composition.mjs . --timeline
```

The audit is already the mandatory pre-render gate, so the timeline refreshes at exactly the moment
it must. Output is deterministic — no generation date — so re-running on an unchanged composition
rewrites identical bytes and `git diff` shows only real timing changes.

It emits one chronological table of every clip (in / out / duration / id / what), resolving each
beat to its asset and wiring helper, each spotlight to the beat it settles over plus its rect, and
each card to its headline. Plus `timeline.json` with the same data structured, including a
`chapters` array.

## PLAN.md and SCRIPT.md come from the concept skill

Both are authored and approved **before** anything is captured or cut — that is the
`video-plan` skill's job, and `video-plan/references/plan-and-script.md` carries their format. Two
things about them bind this side of the pipeline:

- **`PLAN.md` carries no timestamps.** Exact cut points come from `beats.json`, and any number
  written before capture is fiction that someone will later read as a spec. Target durations are
  fine; they are explicitly targets.
- **`SCRIPT.md` is the source of truth for copy.** When wording changes during the build — a
  headline shortened so it stops overflowing, a line reworded to fit the narration — change it
  in `SCRIPT.md` first, then in `index.html`. A script kept only in the HTML stops being
  reviewable by the person who approved it.

Keep both after the build. When someone asks six weeks later why a screen isn't covered, the
plan's "Out of scope" answers it in one line.

## The review loop

The point of timestamps is the round trip. A human watches the render and says *"0:21 sits too
long"*. That must land on a specific clip without archaeology:

1. **Find the row spanning 0:21** in `TIMELINE.md` → `b_memory` (00:21.10–00:25.50).
2. **Change `data-duration`** on that clip **and its timeline call** in `index.html`. Both. A beat
   moved in one place only is the orphaned-timestamp bug, and it silently shifts everything after.
3. **Re-run the audit with `--timeline`.** It re-checks the 11 rules against the new timing (a
   shortened beat can orphan a spotlight or strand a fade partner) and refreshes `TIMELINE.md`.
4. **Snapshot the changed moment** before re-rendering.

Quote timecodes back to the reviewer in their own terms — `mm:ss` from `TIMELINE.md`, not clip ids.
Ids are for the edit; timecodes are for the conversation.

## Chapters for an embedded video

`timeline.json`'s `chapters` come from the overlay cards, because in a guide the cards *are* the
sections — one card routinely spans several beats. For a video embedded in the product next to a
feature, that array is chapter markers and deep links ("jump to the sharing step") for free. Nothing
extra to author: write headlines worth using as chapter titles and the chapters are correct by
construction.
