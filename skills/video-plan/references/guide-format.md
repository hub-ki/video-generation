# The guide format — one house shape for every feature video

When a product ships a **series** of feature guides, they have to look like a series. This is
the format that shape settles into, and the reason it exists: the reader of a plan should not
have to invent a structure per feature.

Use it when the purpose is **tutorial / guide**. A one-off internal clip does not need it.

A guide in this format is **narrated**, **two-part**, and **~3 minutes**:

```
Part 1 · What is X?          ~70s   designed frames, NO app footage
  ↓ spoken bridge only              "Let's look at that in the app now." —
                                     no visual divider slide, ever
Part 2 · X in <product>       ~95s  app capture, one action per beat
  ↓ outro                     ~6s   logo only, no title
```

Part 1 answers *what is this and when would I use it*. Part 2 answers *how do I do it*.
Splitting them is the single biggest reason the format works for beginners: the concept half
can be paced for thinking, the hands-on half for following along.

The production side of this format — how the panels are built, how an action beat is cut, the
choreography a static frame needs — is `demo-video/references/guide-track-build.md`. This file
is about what goes in the plan and the script.

---

## Part 1 — the concept half

Six frames, no footage. They are built markup shown in the **same window rect as the app**, so
the two halves feel like one video rather than a slide deck bolted onto a screencast.

| # | frame | what it does |
| --- | --- | --- |
| 1 | intro | brand mark, feature name |
| 2 | the contrast | what X is *not*, next to what it *is* |
| 3 | the properties | 3-4 keyword cards, each with an icon and one line |
| 4 | the model | the one structural idea the user must hold |
| 5 | the consequence | what follows from that model |
| 6 | when to use it | 3 cases, icons, one line each |

**Rules learned the hard way:**

- **A frame about WHERE things are must show the interface; abstract only relationships.**
  Diagrams are right for *relationships* — a profile feeding three conversations, a group
  sitting between you and what it unlocks. They are wrong for *location*. One guide first
  explained an icon rail as two columns of labelled chips, and the reviewer's note was
  immediate: use a screenshot, it makes the placement clearer. Two abstractions of a thing that
  is right there on screen make the viewer do the mapping themselves.

  The pattern that replaced it, reusable for any navigation frame: a real screenshot, full-bleed
  in the same window rect the app footage uses, washed back except for one rectangular hole over
  the region, with the groups outlined in place and each label level with its own item. Take the
  screenshot with the capture rig rather than cutting it from the master — no cursor, and you
  control the state.

  Two follow-on effects to expect. The caption card usually has to move off its default corner,
  because the thing you are annotating is often exactly where it sits. And **the narration will
  need correcting**: the moment real labels are on screen, any drift between the voice and the
  product's own words is glaring — one build had the voice saying "chats" beside a rail labelled
  *Conversations*. Read the frame's copy against the product's translation catalog, not from
  memory.

- **Keyword first, prose second.** Cards titled `Search` / `Shareable` / `Versioned` with an
  explaining line under them beat verb phrases like *"shows up in search"* — users ask for the
  product's own vocabulary to be the headline.
- **Icons, never numbers.** `1 2 3 4` badges read as a checklist nobody asked for. Use
  stroke icons matching the app's own set (archive, search, share, history, pin, users,
  message-square). They also make each card scannable at a glance.
- **A lead-in line only if the cards complete it grammatically.** `A workspace …` works with
  verb phrases; it does NOT work with keyword nouns. With keywords, use a heading instead.
- **Write each frame so one thing at a time can be highlighted.** The voice walks the frame:
  one card lights up while its word is spoken, then the next. That is a scripting decision, not
  a post-production one — a frame whose content cannot be walked in step with a sentence will
  sit visually dead for its whole beat.

## The Part 1 → Part 2 bridge

**No visual divider slide, ever — the bridge is a single spoken line.** Earlier builds used a
full divider card (an eyebrow, a title, a subtitle listing the hands-on steps); that is gone
from the format. What crosses the cut from the last concept frame to the first app shot is just
the narration line — *"Let's look at that in the app now."* Say it, don't show it.

## Part 2 — the hands-on half

**Order every UI action first, and put the AI/chat step LAST.** One cut went
`… → delete → chat → share`, and the reviewer's note was immediate: it shows the UI, jumps to
the chat, then comes back to the UI. Group all the interface work together and let the agent
step close the video — it is also the strongest ending, because it is the part only this
product can do.

Number only the steps that are a sequence. Asides (export, history, delete) stay unnumbered so
the numbering reads as a path:

```
already there → 1. CREATE → 2. STRUCTURE → 3. CONTENT → [any time] → [remove/careful]
              → 4. SHARE → 5. ASK
```

**If two paths are alternatives, never number them `1` then `2`** — that teaches a required
sequence. Give both the **same** number and let the headline carry the fork ("1. Create it
manually" / "1. …or create it from chat"). One build numbered manual-create `1` and
ask-the-assistant `2`, which taught that you must hand-create before the assistant can help.
You don't — it's an either/or. This is a correctness bug, not a style nit.

**Show how to REACH a control that is not always visible.** A delete beat that opens 0.3s before
the click makes the confirm dialog arrive from nowhere. Plan the beat to show the pointer moving
to the row, the row actions appearing on hover, then the click.

---

## Narration drives the timing

These are narrated, so **beat lengths are a function of the copy, not the other way round.**
Write the line, measure it, then widen the beat until it fits with ~1s of air at both ends.

When a line does not fit, **widen the beat before you cut the copy** — reviewers ask for slower
pacing, and a beat that is too short is a worse problem than a video that is 10s longer. Only
shorten copy when the beat is footage-limited (a 5s header shot cannot hold a 14s sentence).

In practice both happen in one pass. One guide's first fit table failed on 12 of 18 lines: the
Part 1 panels (built markup, free to widen) went 14.5→19.5s, 16.5→24.5s, 13.5→18.5s and
12.5→15s, while five Part 2 beats had no footage left and lost words instead.

## Deliverables per guide

```
renders/<slug>_1080.mp4     the cut (the silent master lives in assets/, not here)
CHAPTERS.md                 chapter list + a paste-ready player block
SCRIPT.md                   every word: cards, typed strings, and the spoken track
PLAN.md                     the beat plan and what was deliberately left out
TIMELINE.md / timeline.json generated — never hand-edited
```

**Regenerate `CHAPTERS.md` and `SCRIPT.md` timings from `TIMELINE.md` after every re-cut**, and
key the replacement on the section TITLE, never on position. A positional rewrite silently
shifted every window by one when a section was inserted, and it is invisible until someone reads
the doc against the video.
