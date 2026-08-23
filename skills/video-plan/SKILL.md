---
name: video-plan
description: >
  Write the concept for a demo, guide, walkthrough or site-tour video of an app or any public
  website — the two documents that get approved BEFORE anything is recorded: PLAN.md (the shape:
  purpose, audience, beat list, spotlight targets, privacy flags, what is out of scope) and
  SCRIPT.md (every word in playing order: card copy, everything typed into the app, what the AI
  must answer, and the spoken track). Settles what is expensive to change later — what the video
  is FOR, demo vs guide, the language, the arc — and carries the copy rules that stop a video
  being re-shot over one sentence. Use this WHENEVER someone wants a video of an app or website
  planned, scripted, storyboarded or conceived — a "video concept", "script", "storyboard", "beat plan",
  "video outline", "Drehbuch", "Konzept" — and as the first step of building one. The companion
  `demo-video` skill turns the approved documents into the finished video; this skill never
  records or renders anything.
metadata:
  version: "1.0.0"
  argument-hint: "<app or website URL, or feature> [demo|guide|tour]"
  tags: "video, concept, script, storyboard, plan, beat-plan, narration, voiceover, demo, guide, walkthrough, site-tour, website, screencast, drehbuch, konzept"
---

# video-plan

You are writing **the two documents a video gets approved on**, and nothing else. No capture,
no cutting, no rendering — that is the `demo-video` skill, and it refuses to start without
these.

```
PLAN.md    the SHAPE — purpose, audience, beats, targets, spotlights, privacy, out of scope
SCRIPT.md  the WORDS — card copy, typed strings, required AI answers, the spoken track
```

**Why they are separate documents:** a plan can be right while the copy is wrong, and copy is
the thing reviewers actually react to. A stakeholder can approve words; they cannot approve a
beat table.

**Why they come first:** the arc is what changes under review, and every beat captured against
an unagreed arc gets re-captured. A sentence that changes after the shoot can cost the whole
flow, because patching one beat into an existing cut is usually not available.

*Usually*, not always — and the condition is worth knowing, because it decides how expensive a
late change is:

> A single beat can be re-shot only when the scene shares **no state** with its neighbours,
> **and** the source renders stably between runs, **and** no audio anchor crosses the scene
> boundary.

On a demo of your own app the first two are typically violated: time-of-day greetings and
relative timestamps drift between runs, so a patched beat is visibly discontinuous with the
ones around it. On a self-contained section of a third-party website they typically hold. The
third condition is the one that comes back later — the moment narration is added, a re-shot
beat of a different length moves every following audio anchor, and a pipeline that could
re-shoot freely while it was silent can no longer do it.

Reading the app in order to *write* the plan is fine and expected. Recording it is not. The
same holds for a website you do not own — read it, do not film it yet, and do not click
anything that writes.

| Need | Read |
| --- | --- |
| **the standard two-part feature-guide format** (the default ask — read FIRST if it's a guide) | `references/guide-format.md` |
| **the subject is a WEBSITE, not an app you sign into** (the tour arc, and the permission questions that belong in the plan) | `references/site-tour-format.md` |
| **is there a concept of the application?** (the reusable half — what the product is for, its flows, the words on screen) | `references/application-concept.md` |
| the exact shape of both documents, with a fill-in template | `references/plan-and-script.md` |
| **caption card copy** — what a headline may and may not do | `references/copy-rules.md` |
| **the spoken track** — grammar traps, audience fit, tone | `references/spoken-track.md` |

---

## Step 0 — Ask before you start, then look for a concept

**Two questions, in your first message, before any analysis.** Both are cheap to ask and expensive
to get wrong:

1. **"Shall I look at the application first and we agree what it does, or do you already know what
   the video should show?"** Reading a product properly takes real time, and the caller may have a
   different starting screen, a different account, or a finished idea in their head. Starting the
   analysis unasked spends their minutes on your assumption.
2. **"What is this video for?"** — Step 1 below, and it decides how strict everything else is.

Ask the second one even when the answer seems obvious from the situation. A request that arrives
with the skill package attached, or without a brief, or as somebody's first message, is still a
request for the video they described — not evidence that they wanted a throwaway. Inferring a
lighter mode from circumstances delivers less than was asked for, and the parts skipped to save
time are the ones that cannot be added afterwards.

Then look for an **application concept**: a document describing what the product does and why,
independent of any one video (`references/application-concept.md`). If one exists, the plan is a
projection of it rather than an invention — purpose and narration come from its prose, the beats
from its flow, the spotlight targets from its verbatim on-screen words.

If none exists, **carry on without it.** Do the direct thing, and offer at the end to leave a first
concept behind, because you will have worked most of it out anyway. Never make someone write a
concept before you will help them — an optional practice that blocks the first request is not
optional.

## Step 1 — Ask what the video is FOR

**Ask this in your first message, as a question. Do not infer it.** It sets the shape, the tone,
*and how strict everything below is.* One question, four options:

| purpose | what it means | how strict |
| --- | --- | --- |
| **Marketing / promo** | a cold audience, outside the product | ⛔ **stop** — a different video, differently captured. Confirm before doing anything else |
| **Tutorial / guide** | users learning the product; ships next to the feature | **strictest.** Full `PLAN.md` + verbatim `SCRIPT.md`, both approved. A wrong guide teaches wrong |
| **Internal presentation** | the team, a stakeholder demo, a feature share — the viewer already has the context | **light.** A short plan and an *abstract* script are enough; skip the verbatim gate |
| **Other** | ask what, then place it | — |

**Do not apply guide-grade ceremony to an internal feature clip.** Somebody wanting to show
their team what they built on Friday does not need approved verbatim copy — that ceremony costs
more than the video is worth and reads as obstruction. Scale down: agree the arc in a sentence
or two, hand it over, done.

> 🚨 **An ad / promo for a cold audience is out of scope**, and it is not a faster demo. It is
> captured differently — the app's own responsive layout rather than a cropped desktop one, live
> interaction rather than stills, full-bleed framing. Getting that wrong is a re-capture, not a
> re-edit. Say so rather than adapting this into one.

## Step 2 — Settle demo vs guide, in one line

They are **different videos, not tone variants**, and picking wrong means a rebuild. Confirm it
explicitly **even when the user said "just build it"** — an autonomous signal licenses you to
skip *approval*, not to guess a fork this big. One real build read "otherwise, do as you please"
as license and produced a 7-beat promo; the ask was a guide covering the full feature range, and
the whole thing was rebuilt.

| tell-tale | shape |
| --- | --- |
| "how-to", "guide", "show what you can do with it", onboarding | **guide** — capability-complete, numbered steps, slower, holds, narrated |
| "show them what it does", a single feature, a release note | **demo** — one narrative spine, fast, benefit-led, usually silent |

If it is a guide and the product ships a *series* of them, you are not designing a video from
scratch — you are filling in an established format. Read `references/guide-format.md` now.

## Step 3 — Settle the language, and everything it touches

**Ask which language the video is in, and write it into `PLAN.md`.** Then hold it across every
surface in the frame — this is the rule that catches people, because getting the card copy right
and leaving anything else in the wrong language reads as a mistake, arguably a worse one,
because it looks like nobody watched it.

| what | how it goes wrong |
| --- | --- |
| **1. Card copy** — headlines, title cards, outro | the easy one; never the whole job |
| **2. The app's own UI** | it must be switched **before** capture, and it is usually a server-side *user preference*, not `localStorage`. Flag it in the plan; the capture skill has to act on it |
| **3. Everything you TYPE** — test samples, chat prompts, search terms, file names | a localised UI with `send the contract to anna@acme.com` typed into it is not a localised video |
| **4. Everything the AI WRITES BACK** | the money shot is usually a model reply. The script must say *what language the answer must come back in* — prompting in a language does not guarantee it |
| **5. Data you CREATE for the shoot** — rule names, workspace/document titles, personas | these persist into later beats; one wrong-language rule name resurfaces three beats later |

Seeded fixtures count too: if the demo org is called "Seed Org" and it is on screen, that is
English in your non-English video. Decide it here, not in review.

**6. What the voice SAYS is a sixth surface, and it may be spelled differently.** TTS engines
mangle short brand names and acronyms, especially a foreign word inside a sentence. The script
carries the *readable* spelling plus a note that the TTS input differs; the respelling itself
lives only in the production skill's `narration.mjs`. See `references/spoken-track.md`.

## Step 4 — Agree the ARC before writing a single polished sentence

The **abstract script** is one line per beat: what that beat says, in order. Nothing verbatim,
no headlines. Get *that* agreed, then write the verbatim `SCRIPT.md`.

The order matters because the arc is what changes: reorder two beats or drop one and every
carefully-worded card downstream is wasted. Writing 500 words of finished copy against an
unagreed arc is the most common way to do this job twice. For an internal video the abstract
script is usually where it ends.

**Structure a demo as: Intro → (one section per task) → Outro**, where each task is a few beats:
*set up / ask → it works (sped up) → the result*. A guide is the same shape with more explicit
step framing.

**Order the sections causally, and end on closure.** Each step should follow from the one before
(create → browse → add a file → ask about *that file* → share the finished thing), and the last
step before the outro must read as an ending — a closing action like share/done, never a new
capability appearing from nowhere. *A remake inherited the original's Share→Ask order; the AI
answer landed after the workspace was already "finished" and the user called the ending "out of
nowhere".* On a remake, **re-derive the order from the story** — "faithful" covers the content,
not the original's dramaturgy mistakes.

## Step 5 — Decide, per beat

- **Keep / cut / speed.** Omit dead time (typing pauses, loading, mouse-hunting). Type-the-prompt
  ≈ 1.6×; reasoning/tool-call montages ≈ 6-10×; results hold on a still. **Cap any un-spotlit
  static hold at ~4s** — and count the total time the *content* is on screen across beats: a 4.6s
  result still directly after the same image in the previous clip's tail summed to ~8s and drew
  "it stays on the image for too long".
- **Spotlight, or deliberately none.** Only the key element per beat (a modal, a table, a "sent
  ✅" line), and be consistent — e.g. every *result* beat gets one. Two rules that cost rounds:
  - **Name the control being acted on, not the result it produces.** A step whose card reads
    "Click Skills…" must light up the *Skills button*, not the panel that opens afterwards — the
    button is the thing the viewer has to find.
  - **If a beat has no single control worth pointing at, write "no spotlight".** An opening beat
    that is simply "a question and its answer" got a box covering 60% of the window whose edges
    sliced through a line of text. That directs nothing.
  - Never write a spotlight as a percentage or an estimate. Name the *element*; the production
    skill measures its rect.
- **Copy.** One short headline per beat. The full rules are in `references/copy-rules.md`, and
  they are not stylistic preferences — every one of them is a revision round that happened.
- **Privacy.** Flag names, emails and tokens that will be visible. Plan from the beat list, but
  say explicitly that the decision (blur / leave / crop) gets re-made from rendered frames — a
  plan-time answer is a memory of the UI, and one was wrong: the plan said the address appeared
  only in a menu nobody opens, and the share drawer then listed the owner with their full email,
  in shot, for seven seconds. Name the surfaces that carry identity: share and permission
  dialogs, member pickers, avatars and their tooltips, sidebars, "added by" lines, anything
  showing an owner.
- **Writes.** Driving a real app mutates it. List what the shoot will create, change and delete,
  so one approval covers the whole flow instead of one round per permission prompt.

## Step 6 — Guides teach, so they have extra rules

A guide teaches; a wrong guide teaches wrong.

- **The step structure must match the product's real model.** If two paths are *alternatives*,
  never number them `1` then `2` — that teaches a required sequence. Same number, and let the
  headline carry the fork. This is a correctness bug, not a style nit.
- **Only claim what the footage will show.** Word the copy to what will be on screen; if the
  product can do more than the video demonstrates, say so to the user rather than narrating the
  unshown thing.
- **The viewer must never need to pause.** If a step has several distinct actions (open → choose
  → confirm), the plan must say so — the production skill slows it or freezes on the key moment.
  Ask: *could someone follow this at full speed, once?*

## Step 7 — Write the documents, then send ONE check

Write `PLAN.md` and `SCRIPT.md` to the project folder and send a single message: shape, who it's
for, the beat list, rough copy, privacy flags, and the writes the shoot needs.

`SCRIPT.md` is the complete on-screen text, **in playing order, as continuous prose you can read
start to finish without watching anything**. Per beat: the headline verbatim (including the
`<br/>` break), every string typed into the app, what the AI must answer and in which language,
any data created for the shoot, the title card and outro verbatim, and — for a narrated guide —
the spoken line.

Read every spoken line back **as a sentence, out loud, as you write it** — not after.
`references/spoken-track.md` has the twelve failure patterns this catches, each one a real defect
that only reading aloud found.

Then stop. **Do not capture, cut, or render.** Hand the approved documents to the `demo-video`
skill.

## When the input is a feature brief

Treat a brief (the planning doc handed over once a feature ships) as the source of *intent* —
the team's vocabulary, the benefit, the audience, the out-of-scope list — and draft `PLAN.md`
from it. **It is never the spec:** a brief records what was planned, not what shipped. Every
claim gets verified against the running app, and the cards get worded to what the footage
actually shows. A video narrating the plan teaches wrong.

Briefs also carry internal framing (roadmap, pricing, competitor notes) that must not surface in
on-screen copy. The plan approval is where that gets filtered out.

## What "done" looks like

- `PLAN.md` — no timestamps anywhere in it (target durations only; exact cut points come from
  the capture's own log, and a number written here before capture is fiction someone will later
  read as a spec).
- `SCRIPT.md` — every word, in playing order, readable end to end.
- One message to the user carrying both, and an explicit "approve this before anything is shot".
- Both files kept after the build. Six weeks later, "Out of scope" answers "why isn't X covered?"
  in one line.
