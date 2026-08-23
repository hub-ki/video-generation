---
name: demo-video
description: >
  Turn an app or a public website into a finished, designed demo or guide video — product demos,
  feature walkthroughs, how-to guides, onboarding clips, site tours. Two sources: it can DRIVE AND
  RECORD a web page with Playwright (preferred — chrome-free, 2x, re-runnable), or take a screen
  recording (.mov/.mp4) you hand it. Covers the pipeline end to end: brand, capture or ingest, cut
  and crop, compose in a floating-window design system (spotlights, freeze-frames, caption cards),
  narrate with ElevenLabs, verify against the source pixels, render 1080p then 4K. Use this
  WHENEVER someone wants a polished video of an app, website or tool — a "demo", "walkthrough",
  "guide", "explainer", "onboarding clip", "how-to video", "record my app", "make a video of this
  website", "film this URL", "turn this recording into a video". Builds from an approved concept:
  with no PLAN.md yet, write one with `video-plan` first. NOT for an ad aimed at a cold
  audience.
metadata:
  version: "1.0.0"
  argument-hint: "<app or website URL, or path to a .mov/.mp4>"
  tags: "video, demo, screencast, screen-recording, walkthrough, guide, how-to, product-demo, website, site-tour, third-party, playwright, capture, record, hyperframes, ffmpeg, elevenlabs, mov, mp4"
---

# demo-video

You need a **finished, designed video of an app**. This skill is the tested,
batteries-included pipeline. It builds on HyperFrames (HTML→video) but adds the parts that are
painful to rediscover: how to record the app yourself, this machine's ffmpeg workarounds, the
exact edit recipes, the branded design system, and the traps that waste hours.

**Nothing here is branded.** The look is one design with swappable tokens; whose brand a video
is in is a step, not an assumption — see **Phase 0B**.

## 🚦 The phases are grouped by topic, not by order of work

Read this before following anything below in sequence. The capture mechanics are documented
first because they belong together, but **capture is not the first thing you do**:

```
The concept comes first:  what is this FOR?  →  the arc  →  PLAN.md (+ SCRIPT.md)  →  APPROVED
                          (that is the `video-plan` skill, not this one)             │
                                                                                        │
    ↓ only now does footage exist ──────────────────────────────────────────────────────┘
Phase 0 environment  →  0B brand  →  1A capture / 1B ingest  →  3 prep  →  4 compose
                                                            →  5 verify  →  6 render
```

Shooting first looks faster and is not: the arc is what changes under review, and every beat
captured against an unagreed arc is re-captured. Phase 0 and 0B are the two things you may run
early — they install tools and settle the palette. **Everything in Phase 1 waits for an approved
plan.**

## 🚀 Trying it out — the fast path

🚨 **The caller chooses this mode. You never do.** You may OFFER it, in one question. You may not
conclude it from circumstances, and these in particular are not consent:

- they attached or unpacked the skill package — that is how someone installs a tool, not a
  statement about what they want made with it;
- the request sounds exploratory, or came without a brief;
- it is the first thing they have asked for;
- you would find the fast path more convenient.

Somebody who says "make me a video of example.com" has asked for a video of example.com. Deciding
on their behalf that they really wanted a throwaway hands them a silent, unbranded 1080p draft
when they expected a finished piece — and the parts you skipped (the arc, the words, the brand)
are exactly the ones that cannot be retro-fitted afterwards.

**When it is unclear, ask.** "Is this a quick smoke test, or a video you will actually show
someone?" One line, and it settles which of the two modes you are in.

The approval gates below exist because a video someone will *see* is expensive to get wrong. A
throwaway run is not that, and putting a reviewer through a concept round to find out whether the
capture works is how a good tool gets abandoned in the first ten minutes. Both failures are real;
only the caller knows which one applies.

The fast path, once the caller has chosen it:

- **Repeat it back** — one sentence: "taking this as a smoke test, so I am skipping the approval
  rounds and the brand; say the word for the full process." Confirming beats announcing: it gives
  a caller who is in the other mode one last cheap moment to correct you.
- **A two-line `PLAN.md`** — the arc as a sentence, three or four beats. No `SCRIPT.md`, no
  sign-off round.
- **The neutral palette.** No brand extraction, no preview to approve.
- **Silent.** No narration, no ElevenLabs key, no transcript check.
- **1080p only.** No 4K, no publish step.
- **Internal only** — it is not shown to a customer and it does not go anywhere public. If it turns
  out somebody wants to show it, that is a different video: run it properly rather than
  retro-fitting approval onto a draft.

Everything else in this file still applies — the capture path, the verification, the ambiguous-
consent abort. Those are not ceremony; they are what stops a broken video from looking fine.

## 🛑 The concept gate

**This skill does not start from a request. It starts from an approved `PLAN.md`** (plus a
verbatim `SCRIPT.md` for anything customer-facing). The fast path above is the one exception, and
it is only available when nobody outside the room will see the result.

If there isn't one, that is the `video-plan` skill's job, and it takes one pass: what the
video is FOR, demo vs guide, the language, the arc, the beat list, the copy. Do that first and
come back. Reading the app to *write* the plan is fine — recording it is not.

Two things you owe regardless of who wrote the plan, and both are questions, not announcements:

**Ask whether to analyse first.** "Shall I look at the application and propose what to show, or do
you already know?" Reading a product properly costs real time, and the caller may have a different
starting screen or a finished idea. Do not spend their minutes on your assumption.

**Get the beat list nodded through before filming.** Not the whole `PLAN.md` re-approved — the
plan is already approved — but the concrete shot list you are about to record: these four beats,
in this order, spotlighting these things. It takes one message and it is the last cheap moment.
After the capture, changing the order means re-shooting, because a beat cut against a different arc
does not slot into an existing cut.

**Confirm the capture origin in chat.** Which environment gets recorded, and therefore which version of the product, is the
user's call and the target moves.

## 🚦 First decision: where does the footage come from?

**If the subject is a web page you can reach → RECORD IT YOURSELF. Don't ask for a screencast.**

```
Reachable URL?  ── yes ──┬── it is YOURS (or your customer's, with a brief)
        │                │      └─▶ Phase 1A · capture   (references/playwright-capture.md)
        │                │
        │                └── it is SOMEONE ELSE'S website
        │                       └─▶ Phase 1A · capture, plus references/foreign-sites.md
        │                           (permission gate, consent walls, sticky headers,
        │                            lazy-load rect drift — READ IT FIRST, the capture
        │                            primitives are not safe on a stranger's DOM as-is)
        no  (desktop app, Figma, native tool, mobile,
             or the user already handed you a .mov)
        ▼
   Phase 1B · ingest a screencast
```

**Own app and third-party site are the same pipeline with a different capture pass.** The
composition, the design system, the verify layer and the voiceover do not change; brand
extraction already reads any live website. What changes is that you are public-only by default, cannot seed state, must not write anything,
and are measuring a DOM that moves under you. (An authenticated third-party capture is possible
and discouraged: it needs explicit per-domain approval, the browser sandbox on, and the session
file destroyed at the end — `references/foreign-sites.md` §0.)

This is not a style preference — the capture path is better footage *and* roughly half the work.
A hand screencast forces you to reverse-engineer the timeline from pixels, hunt and cut the
author's retries, measure every spotlight by hand, crop the browser chrome, and audit for
privacy. A scripted capture has **none of those problems by construction**, is chrome-free, lets
you choose the text size, and can be re-run when the UI changes. Measured on the same flow: 71s
of screencast needing dense frame-scanning vs a 28s capture with every source time and element
rect handed over in `beats.json` — and 1.5x the text size in the finished frame.

**Even so, if the user has already recorded something, watch it before capturing.** It encodes
their model of their own product — which capability to show, in what order, and what the point
is. That editorial judgement is the one thing the capture path does not give you for free.

Read the references on demand — don't preload them:

| Need                                                          | Read |
| ------------------------------------------------------------- | ---- |
| **whose brand is this video in?** (tokens, logo, type — a website works) | `references/brand-style.md` |
| **drive & record the app yourself; 2x; cursor; auth; beats.json** | `references/playwright-capture.md` |
| **the target is a website you do NOT own** (permission gate, consent walls, sticky headers, lazy-load rect drift, live media) | `references/foreign-sites.md` — read BEFORE capturing |
| **running headless in a container or CI** (missing CJK/emoji fonts, Chromium dying on the first capture, "Executable doesn't exist" right after installing) | `references/container-capture.md` |
| **after changing anything in `capture-lib.js`** | `node <skill>/scripts/test-foreign-sites.mjs` — local fixtures, no network; every case is a defect that shipped |
| **the spotlight framed the wrong pixels and the coordinates were right** | `references/foreign-sites.md` §4 — measure with `stableRect`, not `boundingBox` |
| **re-capture in another language; re-time an existing cut without rebuilding the timeline** | `references/playwright-capture.md` §9-10 |
| handed a `.mov` full of retries — pick & cut the clean takes       | `references/multiple-takes.md` |
| ffmpeg/CLI won't run, "0 GB free", bunx, permissions          | `references/pitfalls.md` §6 + run `scripts/setup-render-env.sh` |
| exact cut/crop/speed/still/**excise-frames** commands          | `references/ffmpeg-recipes.md` |
| the look: window, spotlight, cards, crossfades, **freeze frames** | `references/design-system.md` (+ `assets/template.html`) |
| **building a two-part feature guide** (concept panels, action beats, choreography) | `references/guide-track-build.md` |
| **narration / ElevenLabs voiceover, quota + voice traps**      | `references/voiceover.md` |
| **does the voice actually SAY the script?** (brand names, acronyms) | `scripts/verify-narration.mjs` — exit 1 = fix |
| **the app renders empty, 500s, or "offline" BEFORE you capture** | `references/pitfalls.md` §17 |
| **the TIMELINE.md contract; acting on "0:12 drags" feedback**  | `references/timeline-and-review.md` |
| **where do I put the spotlight?** (never eyeball it)           | `references/design-system.md` → "NEVER eyeball coordinates" |
| **a spotlight edge keeps slicing something, whatever padding you use** | `scripts/measure-spots.mjs` — measure the layout's whitespace instead |
| **the control genuinely cannot be framed** (no 6px band on some edge) | `references/design-system.md` → "Sometimes there is no box" |
| **the app's chrome sits where the caption card goes** | `references/design-system.md` → per-beat card placement + splitting a card at the cut |
| **the still shows the state AFTER the click** (spotlight on empty space) | `references/playwright-capture.md` §16 — freeze on the `_hover` mark |
| **a scripted chat message vanished; the agent "finished" but hadn't** | `references/playwright-capture.md` §17-18 |
| "why is my footage frozen / misaligned / erroring"            | `references/pitfalls.md` |
| stray black rings on clicks; a fix that silently did nothing   | `references/pitfalls.md` §11-13 |
| **a check said PASS but the thing is wrong**                   | `references/pitfalls.md` §15 |
| **before every render** (mechanical audit, exit 1 = fix)      | `scripts/audit-composition.mjs` |
| **is the subject actually visible?** (spot clearance + card occlusion; exit 1 = fix, exit 2 = it couldn't check) | `scripts/verify-material.mjs` |
| **after snapshots: zoomed crop per spotlight** (a full-frame read misses sliced text) | `scripts/crop-spots.mjs` |
| **does the frame show what the voice is TALKING ABOUT?** (narrated guides, per topic) | `scripts/verify-topics.mjs` |
| **the app records what you do** — snapshot before, restore after | `scripts/app-state.mjs` |
| **standalone training docs next to the video** (only if asked) | `references/companion-docs.md` |

**Work the loop on snapshots, not renders.** `snapshot --at t1,t2,…` costs seconds; a render
costs minutes. Get framing, spotlight coords, copy, and privacy right on stills, then render once
and verify motion.

---

## Phase 0 — Environment (once per machine/session)

One command handles every case — macOS or Linux, a healthy machine, a missing or stripped
ffmpeg, a missing HyperFrames, or the false-"0 GB free" statfs bug. Don't diagnose by hand:

```bash
render_env="$(bash <skill>/scripts/setup-render-env.sh)" && eval "$render_env"
```

**Not `source <(…)`.** Bash reports the status of `source`, not of the process substitution
feeding it, so a bootstrap that dies halfway — no network, a failed install — reports success and
leaves you with half its exports set. Capturing first surfaces the failure and applies nothing
when it fails.

It installs `hyperframes` (pinned) if absent, resolves a **full** ffmpeg, patches the disk check
**only if this OS actually has the bug**, and exports `HYPERFRAMES_FFMPEG_PATH`,
`HYPERFRAMES_FFPROBE_PATH`, `PRODUCER_BROWSER_GPU_MODE` and `HYPERFRAMES_CLI`.

**It probes for filters, not for a binary named ffmpeg.** The pipeline needs `fps`/`pad`
(Phase 3 frame pinning), `crop` (Phase 1B chrome removal) and `freezedetect`
(`audit-composition.mjs` + the Phase 6 dead-air sweep). Two stripped builds are commonly already
on `PATH` and pass a naive check before failing mid-pipeline: Playwright's bundled ffmpeg and
Remotion's compositor bundle. Resolution order: a full system ffmpeg → `brew` (macOS) → the
`ffmpeg-static`/`ffprobe-static` packages in `~/.hyperframes-cli` (all platforms, no sudo — **the
normal path on Linux**) → a wrapped Remotion compositor bundle as a last resort, which warns
because it has no `freezedetect`, so those two freeze checks silently pass and you must verify by
hand (pitfalls #1, #16).

Then render via the **local** CLI it points you at (`$HYPERFRAMES_CLI`), **never**
`bunx`/`npx hyperframes` — those re-materialise a fresh copy each run and silently drop the
patch. Use it for `init`/`check`/`snapshot` too, not just `render`; one local copy serves any
project (the CLI takes the project dir as its arg). `bun` is preferred wherever a package gets
installed and `node` is the always-present runtime. Rationale for each workaround:
`references/pitfalls.md` §6 — but on a healthy machine none of it fires.

### Requirements this bootstraps

| | |
| --- | --- |
| **Node 18+** | required — the render CLI runs on `node`, which is always present |
| **bun** | preferred for installs; the scripts fall back to npm without it |
| **ffmpeg** | auto-resolved: system build → `brew` (macOS) → `ffmpeg-static` (no sudo) |
| **HyperFrames** | auto-installed, pinned, into `~/.hyperframes-cli` |
| **Playwright + Chromium** | only for the capture path — `scripts/setup-capture-env.sh` |
| **`ELEVENLABS_API_KEY`** | only for a narrated guide |
| **Disk** | ~500 MB one-off (a bundled Chromium for rendering, plus a static ffmpeg) |

A stripped ffmpeg is worse than none. The setup script probes for `fps`/`pad`/`crop`/
`freezedetect` rather than for the binary, and tells you when it had to settle for a build
without `freezedetect` (which disables two of the automated freeze checks). The install is
one-off and shared across every project — a second video costs nothing extra.

## Phase 0B — Whose brand is this? (once per project, BEFORE composing)

Full playbook: **`references/brand-style.md`**. The short form: `brand.json` is the only place a
brand is written down, and `apply-brand.mjs` is the only thing that writes it into the
composition.

```bash
# A. the user gave you tokens / a logo → write brand.json, then:
node <skill>/scripts/apply-brand.mjs .

# B. take it off their website (palette, type, logo — computed styles, never a screenshot)
node <skill>/scripts/extract-brand.mjs https://their.site --out ./brand.json --logo-dir ./assets

# C. only one colour, or only a logo → build a palette around it
node <skill>/scripts/make-brand.mjs --accent "#2f6df6" --name Acme
node <skill>/scripts/make-brand.mjs --from-logo ./assets/logo.svg --name Acme

# D. no brand given → the neutral grey default ships in the template. Say that you used it.

# then, whichever way in: look at it, then write it
node <skill>/scripts/preview-brand.mjs .        # -> brand-preview.html, open it
node <skill>/scripts/apply-brand.mjs .
```

**Show the user `brand-preview.html` before you build on it** — it draws the real surfaces
(canvas, spotlit window, caption card, intro, outro) at true size from the same values
`apply-brand.mjs` writes. Contrast maths says a palette is legible; it does not say whether it is
*their* brand, and for a generated palette that question is the whole point.

Four things about this step, all of which cost a rebuild when skipped:

- **Do it before you compose, not at the end.** A palette settled late means re-reading every
  snapshot you already approved, and a logo settled late is the classic "the outro is still the
  placeholder" bug.
- **`apply-brand.mjs` refuses a palette the viewer could not read** (ink on canvas, on card, and
  on both highlighter stops; the card distinguishable from the canvas). It writes nothing on a
  failure — deliberately, because a bad palette does not fail *visibly* in a snapshot, it fails
  as "the cards look a bit flat" and ships.
- **Get the real logo file.** Never redraw a mark, never approximate one, never trace it from a
  screenshot. A wrong logo is the one defect every viewer notices.

`extract-brand.mjs` and `make-brand.mjs` are starting points, not answers: read `extractedFrom` /
`generatedFrom` in the file they write and correct the picks before applying. And **a wide
wordmark needs `logo.width` / `logo.outroWidth` set** — the slot defaults assume a square mark,
and the preview warns when they do not fit.

## Phase 1A — Capture it yourself (web apps: the default path)

> 🛑 **Gate: don't run any of this until the plan is approved.** Purpose agreed, arc agreed,
> `PLAN.md` written (plus a verbatim `SCRIPT.md` for a guide). Skipping ahead here is the most
> expensive mistake in this skill, because footage shot against an unagreed arc gets re-shot.

Full playbook + every measured finding: **`references/playwright-capture.md`**. The shape:

```bash
node "$HYPERFRAMES_CLI" init videos/<name> --non-interactive --example=blank   # scaffold FIRST
cd videos/<name>                                          # every path below is project-relative
bash <skill>/scripts/setup-capture-env.sh ./capture       # playwright + chromium + rig
APP_ORIGIN=https://your.app APP_PROTECTED_PATH=/some/route bun run --cwd ./capture auth
cd capture && node <skill>/scripts/app-state.mjs snapshot   # ← BEFORE the first capture
# fill in the beats in ./capture.js (setup copied it from capture-template.js), then:
node ./capture.js                    # -> out/<name>/{<name>.webm, beats.json}
# ...when the video is signed off (from capture/ — the script resolves playwright
# and storageState.json from the CWD):
(cd capture && node <skill>/scripts/app-state.mjs restore --go)   # deletes what appeared since the snapshot
```

**Scaffold before you capture, not after.** The rig expects to live at `<project>/capture/`, and
`out/` resolves against the directory you run `node` from — so if the project doesn't exist yet,
the rig and the footage land outside it and have to be moved.

**`restore` deletes by diff, not by a ledger** — anything on that instance that wasn't in the
snapshot counts, including records a human created while you were shooting. It refuses to run
against a different `APP_ORIGIN` or row selector than the snapshot was taken with, and it is a
dry run until you pass `--go`. Read the printed list before you pass it.

**Two rules before the first command:**

- **Scaffold outside the product repo.** A video project accumulates ~100 MB of media
  (`assets/`, `capture/`, renders); it belongs in a sibling folder (`~/code/videos/<name>`),
  never inside the app's repo.
- **State the capture origin in chat, every time.** `APP_ORIGIN` has no default — which instance
  gets recorded, and therefore which version of the product, is the user's call, and the target
  moves as environments change. Name the exact origin in the plan-check message and in
  `PLAN.md`'s `Captured from:` line; never silently reuse a previous session's origin.

Once you're inside, the layout is: `out/<name>/<name>.webm` is the **untouched original** (this
path's equivalent of `raw/`), everything you derive goes in `assets/`, the composition is
`index.html`, renders land in `renders/`.

0. **Prove the stack actually works before you shoot.** A half-running app serves a plausible
   empty page, and you will otherwise capture it: an authorization service down makes every list
   query 500 (empty tree), a stale realtime container makes an editor permanently "offline" so no
   edit persists, and a compose run silently skips services after the first port conflict. Stale
   host processes from a previous session also keep the new ones from booting. Load the target
   route and confirm the real data is there — see `pitfalls.md` §17.
1. **Auth is the human's job, always.** `bun run auth` opens a headed browser; they sign in; it
   saves `storageState.json` (cookies only). **Never type anyone's credentials.** You cannot
   automate past this and shouldn't try.
2. **Resolve selectors against the live DOM** before writing the script — one probe printing
   `getByRole` counts + `boundingBox()`s. Do not infer accessible names from footage.
3. **Choose the viewport width deliberately.** Narrower = bigger text but a taller layout that
   can clip. Load the target at 2-3 widths and check the tallest thing you must show fits. Pick
   the width so `asset_w/asset_h` == the design's window aspect → **no crop at all**.
4. **Inject a cursor** (`installCursor`) — it is in no capture, ever — and verify it by
   pixel-diff.
5. **Say what you'll write, get a yes — and bundle the WHOLE flow's permissions into that one
   ask.** Driving a real app mutates it. Name the writes, the cleanup/restore **deletions**, and
   (in auto mode) the shell allowlist the restore scripts will need — which the user must grant;
   the agent cannot grant itself permissions. Mid-flow permission blocks cost a round each: one
   build hit two — the delete step, then the settings write — and the user ended up choosing to
   skip cleanup entirely. Set up state in a non-recording context, restore it after, and report
   what you changed.
6. **`beats.json` is the edit decision list.** Log every beat *and* every group rect you'll want
   to spotlight. Phase 4 then needs no contact sheets and no frame scanning.
7. **Mark the instant the state CHANGES, not after the dwell.** `mark()` placed after a `hold()`
   reports a time the UI reached seconds earlier. *A panel that opened at source 46.2 was logged
   at 47.8 because the mark sat behind `hold(1600)` — the spotlight landed ~3s late twice.* Mark,
   then dwell — and route it through `beat()`, which measures with `stableRect`, re-checks the
   rect after the dwell and rolls the mark back if it moved:
   `await element.click(); await beat('panel_open', panelLocator, { dwell: 1600 });`
   A hand-written `tl.mark(name, { rect })` is measured once, never re-checked and never
   rolled back, while the salvage path calls every surviving entry verified.
7b. **Log every action as a HOVER mark and a CLICK mark — and freeze on the hover one.**
    `markClick()` is written after `click()` returns, so its timestamp is already past the real
    click and an SPA has re-rendered. A still cut 0.12s "before" it showed the navigated page, a
    dialog mid-crossfade, and a button already reading "Saving…". Use `action()` from the
    template. Two re-captures went this way — §16.
7c. **Ask the UI whether the agent is busy; never diff its text.** A send button that reads
    "Stop" while a run is alive and "Send" when idle is the reliable signal — `waitIdle()`/
    `sendPrompt()` use it. A text diff reports "finished" between tool steps, and the next
    scripted message goes into a busy composer and is **swallowed with no error**. A tool set to
    *needs confirmation* then stops the run with an approval prompt that arrives **after** an
    apparent idle — watch for it over a fixed window (`approveTools()`). §17-18.
8. **Snapshot the app before capturing, restore after** (`scripts/app-state.mjs`). Driving a real
   app leaves records, and they land in later footage as duplicate rows that read as a broken test
   account. Match on **identity, never on title** — see the script's header for why title matching
   provably fails.
9. **Never re-shoot a single beat into an existing cut.** Time-of-day greetings ("Good morning" →
   "Good afternoon") and relative timestamps ("1m" → "2h") drift between runs, so a patched beat
   is visibly discontinuous with its neighbours. Re-run the whole flow; it costs ~2 minutes and
   the script is deterministic.
10. **A dry run must verify persistent POSTCONDITIONS, not chat success.** Check every state later
    beats depend on — the tree really shows the folders, the file really opens — not just that the
    beat's own step ended green. *An AI "save to workspace" flow confirmed "document saved", but
    what it saved were chat artifacts: the workspace tree stayed empty, three beats were shot
    against nothing, and the structure had to be hand-built and all three re-shot.* Probes must
    also be read-only in fact, not intent: don't click create-affordances to see what they do —
    one "New workspace" button created instantly, no dialog, and left strays in the rail for the
    rest of the shoot. If a probe does create something, log it immediately:
    `node app-state.mjs record <id>`.

Then continue at **Phase 3**. What you skip from Phase 1B is the *archaeology* (its steps 3-4 and
6-7: CFR master, content map, retry-hunting, window-bounds measuring — all moot when the script
logged the timeline and the capture has no chrome). You have already done its step 2
(scaffolding), and you still owe its **step 5: inventory the capabilities, not just the flow** —
that discipline is independent of where the footage came from.

## Phase 1B — Ingest & understand a screencast

*(Only when you can't drive the app: a desktop tool, Figma, mobile, or the user already recorded
it.)*

> 🛑 **Gate: ingest and watch freely — cut nothing until the plan is approved.** Taking the file
> in, making the CFR master and reading the contact sheet is how you learn what you were handed,
> and it feeds the plan. Choosing takes and cutting beats is work the arc invalidates, so that
> waits.

1. **Get the file somewhere readable.** On macOS, `~/Desktop`, `~/Downloads` and `~/Documents`
   are TCC-blocked — you can't even `cp` out of them, and a big video can't be pulled out of a
   chat attachment. Ask the user to drop it **inside the working directory** — straight into the
   project root or an `_incoming/` folder — and give the name/path.
2. **Scaffold + organise:** `node "$HYPERFRAMES_CLI" init videos/<name> --non-interactive
   --example=blank`, then move the raw file into `videos/<name>/raw/` (keep the untouched
   original there, separate from generated work). Everything you derive — the CFR master,
   per-beat clips, stills — goes in `videos/<name>/assets/`; the composition is `index.html`;
   outputs land in `renders/`. This raw-vs-derived split keeps re-cuts painless.
3. **Probe** it, then make a **CFR master** (`-r 30`) — recordings are VFR and that breaks time
   alignment. (`ffmpeg-recipes.md` → Probe, CFR master.)
4. **Build a content map**: sample a frame every few seconds across the master and **read them**
   to learn the actual flow — what task is shown, where dead time is, where the "hero" result
   appears. You cannot plan an edit you haven't watched. As you go, **flag every retry, false
   start, and correction** — a raw one-take recording is really several takes stitched by the
   user redoing things (see `references/multiple-takes.md`). Mark the source ranges of the *good*
   take vs the *bad* ones. Tiling the samples into a labelled contact sheet (PIL, timestamp per
   cell) makes this one cheap read instead of 70.

   **A coarse map finds the story; it does NOT validate a cut.** Anything shorter than your
   sampling interval is invisible to it. Before you commit to any beat's source range, **re-scan
   that exact range at ~1s** and confirm it's continuous. *A visible glitch shipped this way:* a
   6s map showed one document at 248 and another at 252, so a 248→262 browse looked clean — but
   the user had detoured to a different screen at 250–251, entirely between samples. The cut
   jump-cut through it.
5. **Inventory the capabilities, not just the flow** (critical for a guide). List every distinct
   thing the product is shown doing, with source ranges — creating, uploading, sharing,
   permissions, browsing, asking. A flow-only read misses features that aren't on the main
   narrative spine. *One build was a 7-beat promo that missed manual creation and file upload
   entirely* — both plainly in the footage — and had to be rebuilt.
6. **Measure the window bounds** (PIL) so you can crop the browser chrome, desktop margins, and
   the recording indicator out of every asset identically. (A clean full-bleed app capture may
   need no crop at all — check the frame edges first.)
7. **Note the source's text size — it sets the resolution the video reads at.** The app's body
   text is scaled by `WIN_W / asset_w` on its way to the screen (e.g. a 2506px-wide recording in
   a 1680px window = 0.67×, so 12px text lands at ~8px in a 1080p frame, but ~16px in the 4K). UI
   text needs ~11px to render crisp. **The 4K master is the deliverable** — it carries all the
   source detail — so this normally takes care of itself. It only bites if someone watches a
   *streamed* 1080p version. If that comes up, see `references/pitfalls.md` §14 — no codec/CRF/
   bitrate setting can fix it.

## Phase 3 — Prep the assets

**Derive every cut point from `beats.json` in code — never hand-transcribe them.** Offsets get
re-typed on each re-capture and one wrong digit silently shifts a beat. Compute
`start = beats['name'] - lead`, emit the build script, run it.

**Pin exact frame counts.** `-t <span> -r <N>` yields `N*span` frames *or one more*, so a clip
lands 0.033s off its declared `data-duration` and the timeline drifts. Extract generously, then
keep exactly N:

```bash
ffmpeg -y -ss $START -i $M -t $((WANT/R + 1)) -r $R -q:v 2 $TMP/%05d.jpg
ls $TMP/*.jpg | sort | tail -n +$((WANT+1)) | xargs -r rm -f      # duration is now WANT/30 s
```

Per `ffmpeg-recipes.md`, produce one file per beat (the render **ignores `data-media-start`**, so
each beat is its own clip), all with the **same crop**: natural clips (`-ss/-t`, cropped), sped
montages (decimated `-r` → re-encode 30fps), result stills (`-frames:v 1`), optional PIL blur for
redaction.

## Phase 4 — Compose

> **Do not run `hyperframes init`.** This skill does not use HyperFrames' own workflow
> scaffolding, and the workflows it offers (`website-to-video` among them) are not part of this
> package — a reviewer reaching for `init` got `Unknown skill` and had to guess a substitute. The
> composition here is one file you copy and fill in. HyperFrames is used as a renderer:
> `snapshot`, `check` and `render` against your `index.html`, nothing else.

Copy `assets/template.html` to `<project>/index.html`, run **Phase 0B** against it, and fill it
in (`design-system.md`): set the window rect to your asset's aspect; add a beat element per clip
on alternating tracks; add spotlights (source→window coord mapping) on the key beats; write the
overlay cards from `SCRIPT.md`; wire the timeline with `win()/spot()/label()` and crossfades.

**Intro and outro content, no exceptions:** the intro card is **logo + video title only, no
subtitle**; the outro card is **logo only, no title**. Both come from `brand.json` via
`apply-brand.mjs` — never hand-place a mark.

**Declare what each beat is ABOUT.** A beat with a spotlight already has it — the spot rect. A
beat without one (a typing clip, a full-window motion beat) must carry `data-roi="x,y,w,h"` in
**source** pixels, straight from `beats.json` or a measurement on the source frame. That is what
lets Phase 5 prove no overlay card is parked on top of the subject; without it the check cannot
run and reports the beat as unverifiable. If a card's subject sits low in the frame, give that
card `.ov.at-top` — **not covering the subject outranks the same-corner rule.**

**Keep a replaced composition as `*.bak`, never as a second `.html`** — `hyperframes check`
treats every `*.html` with a `data-composition-id` as a composition root and fails the project on
two (an `index-en.html` backup of a pre-translation cut did exactly this).

## Phase 5 — Verify on snapshots

**Run the audit first — it is mechanical and catches what your eye will not:**

```bash
node <skill>/scripts/audit-composition.mjs . --timeline   # exit 1 = fix before rendering
node <skill>/scripts/verify-material.mjs .                # exit 1 = fix, exit 2 = it couldn't check
```

**Exit 2 is not a pass.** Each `?` line is a check that never ran — a source asset it couldn't
read, a snapshot it needed, a beat with no declared subject. Supply what's missing and re-run
until it exits 0; treating "unverified" as "verified" is how a sliced spotlight ships.

The audit checks the composition's *structure*; `verify-material.mjs` checks it against the
*pixels*, which is where the two defects a reviewer notices first live. **M1 — spotlight
clearance:** measured on the source asset (no scrim, no dim, clean signal), every edge must sit
≥6px from its subject's ink; 0-2px with the ink continuing past the edge is a cut. **M2 — card
occlusion:** the opaque card must not overlap the beat's region of interest (its spot rect, or
`data-roi`). Both shipped in one first cut: a dialog spotlight sliced its own primary button (0px
clearance, 97% of the edge had ink crossing it), five more spotlights sat at 0-2px and read as
clipped, and a card covered a quarter of the composer whose highlight was the whole point of the
beat. Every one of those passed the audit, `check`, and a full-frame snapshot read.

The audit itself asserts asset durations match the declared timings, that no fade-out lacks a
fade-in partner (the "transition to nothing"), that every spotlight's *settled* window sits on one
stable clip, that spotlights frame one control rather than a region, that nothing runs past the
outro, that no glyph lacks font coverage, and that nothing sits static too long (>4.5s un-spotlit
stills; >4.5s frozen stretches inside video assets, via freezedetect). Every rule is a bug that
shipped and had to be caught by a human watching the render.

`--timeline` also writes **`TIMELINE.md` + `timeline.json`** — every clip's exact in/out with its
caption, spotlight target and asset. It is generated, never hand-edited: `index.html` is the only
source of truth for timing, and a hand-kept timestamp list rots the instant a beat moves. Hand
`TIMELINE.md` to whoever reviews the cut, and use it to land their timecoded feedback on the
right clip (`references/timeline-and-review.md`). `timeline.json`'s `chapters` are ready-made
markers for an embedded player.

Then `node "$HYPERFRAMES_CLI" check .` and `node "$HYPERFRAMES_CLI" snapshot --at <each beat's
mid-point>` (always the local CLI, never a bare `hyperframes`). **Read every snapshot** and fix:
window has no dark margins or recording indicator; spotlight tightly frames the element (incl.
table headers); overlay is clear and consistently placed; copy matches `SCRIPT.md`; nothing
private leaks that shouldn't. Re-snapshot until clean.

**Then crop every spotlight and READ the crops** — a full-frame snapshot reliably hides a spot
edge slicing through a text line (two shipped exactly that way, passed a full-frame read, and
were caught by the user):

```bash
node <skill>/scripts/crop-spots.mjs .    # -> snapshots/spot-crops/<id>.png (or the exact
                                         #    `snapshot --at` list you still need — it ignores
                                         #    snapshots older than index.html as stale)
```

### 🎯 Then check the PICTURE against the WORDS — per topic, not per sentence

Everything above validates one half of the video against itself: the timeline against its
structure, a spotlight against its *declared* subject, the voice against the *written* line.
Nothing compares the words to the picture. So a narrated guide can talk about one thing while the
frame shows another and every gate stays green.

```bash
node <skill>/scripts/verify-topics.mjs .        # needs make-audio + measure-speech + a render
```

Declare what each line is *about* in `narration.mjs`, next to the line — the script cannot derive
it, and deriving it is the wrong idea anyway:

```js
{ id: '09-chats', anchor: 'c8', text: 'On the left are all your conversations. …',
  topics: ['three-dot menu', 'search covers', 'in the archive'] },
```

**Per topic, not per sentence.** One sentence often names three controls and each needs its own
verdict at its own moment; one topic can run across three sentences and needs one. The script
places each topic in time, pulls that frame out of the render, and prints it next to the sentence
it belongs to.

**The question is: is the frame showing what the voice is talking about?**

**A spotlight is one way to satisfy that — it is not the test.** Do not answer a failure by
spotlighting everything; over-pointing is its own defect, and a beat with no single control worth
pointing at still gets no spotlight. A topic passes just as well by being the plain, obvious
subject of the frame.

The four failures, in the order they actually happen:

| | what it looks like |
| --- | --- |
| **LAG** | the **previous** topic is still on screen — its menu, dialog or panel still open — while the voice has moved on. **By far the most common**, and the reason this check exists |
| **LEAD** | the voice names something the footage only reaches seconds later |
| **OCCLUDED** | on screen, but behind the caption card, a dropdown, or the spotlight's own dim |
| **ABSENT** | never shown; the line describes a screen the video does not contain |

Fixes, cheapest first — reach for the last one only when the first three can't work:

1. **Re-time the words.** Split the line, or move its `anchor` to the clip that actually shows the
   topic. No re-shoot, no re-cut.
2. **Re-cut the beat.** Shorten the dwell on the previous state so the picture arrives on time.
   This is usually the honest fix for LAG — the beat is holding too long on step one.
3. **Change the words to what is shown.** Right when the footage is fine and the copy over-reached
   — and it goes into `SCRIPT.md` first.
4. **Re-capture** so the thing exists on screen at all. Only for ABSENT, and it costs the whole
   flow (never re-shoot a single beat into an existing cut).

If you knowingly keep a topic that is only *named* and never shown, say so to the user — that is
their call, not a detail to bury.

**A card must never assert a state the screen hasn't reached yet.** Snapshots at beat mid-points
will not catch this — the card and the state agree *there*. Check each card's **start** against
the source time its state actually lands (`beats.json` gives you this). Put a *state* card only
over the beat where that state is on screen (typically the freeze); during the action that causes
it, either run no card or use a card that describes the **action**, which can't be wrong.

**Compose-time text edits skip the concept gate by construction.** A headline shortened to stop it
overflowing, a card moved to `.at-right` to dodge a spotlight, and any TTS-fit rewording in
`narration.mjs` all happen after `SCRIPT.md` was approved — re-read exactly those changed lines
against the copy rules, and write them back into `SCRIPT.md`.

## Phase 6 — Render & deliver

### Narrated guides: silent render first, then mux

A guide-track video has a voiceover, and the render itself stays silent — the audio is muxed on
afterwards with `-c:v copy`, which takes seconds and cannot degrade the picture. Full pipeline and
the traps (fit table, quota, library voices, verifying by measurement) in `references/voiceover.md`:

```bash
ELEVENLABS_API_KEY=… node <skill>/scripts/make-audio.mjs        # fit table must be all "yes"
node <skill>/scripts/verify-narration.mjs .                     # exit 1 = the voice misreads a word
node "$HYPERFRAMES_CLI" render . -q high --crf 14 -o ./assets/silent-master.mp4
node <skill>/scripts/mux-audio.mjs --out ./renders/<folder>_1080.mp4
```

Render the silent master into `assets/`, never `renders/` — `renders/` should only hold files
someone might hand over, and a mute copy sitting next to the real one gets forwarded by mistake.
**Then verify placement by measuring levels per section**, not by trusting that ffmpeg exited 0.

**`verify-narration.mjs` is the only check that reads the WORDS.** Everything else about the audio
measures its shape — the fit table compares durations, `volumedetect` compares levels,
`silencedetect` finds pauses — and a mispronounced word has a normal duration, a normal level and
normal pauses, so it passes all three. Skip this and "audio verified" only ever meant "placement
verified". Read the printed word diff even when it exits 0: a single wrong word in thirty is ~3%
and no threshold will fail it, but the word a TTS breaks is almost always the brand name or an
acronym, which is also the word a viewer notices.

**Render 1080p only, and stop there until the user signs off.** A demo almost always takes a few
rounds of edits (copy, pacing, which beats, framing) — 4K costs minutes per pass and is wasted on
a cut that's about to change.

**Naming: `renders/<folder>_<resolution>.mp4`** — `<folder>` is a short lowercase slug of the
video's project folder (`videos/Workspaces/` → `workspace_1080.mp4`, `workspace_4k.mp4`). Never
`video.mp4`: these get downloaded, forwarded and dropped in chats, where a generic name is
unidentifiable and two videos collide.

```bash
node "$HYPERFRAMES_CLI" render . -q high --crf 14 -o ./renders/<folder>_1080.mp4   # the iteration loop
```

### 🔍 ALWAYS sample the rendered 1080p and READ it — never skip this

**Delete the old file before rendering** (`rm -f renders/<name>_1080.mp4`), so nothing downstream
can accidentally verify a stale render. Then sample the finished MP4 end to end and **look at
every frame**:

```bash
for t in $(seq 1 2 <duration>); do
  ffmpeg -y -v error -ss $t -i renders/<name>_1080.mp4 -frames:v 1 -vf "scale=640:-1" /tmp/s_$t.png
done
# tile them into one labelled contact sheet with PIL, then READ it
```

Every-2s over the whole cut is ~20 frames = one cheap read. This is the **only** check that
catches the class of bug that survives everything else, because `check`, snapshots and pixel-diffs
all pass while the video is wrong. Real examples, all caught this way and by nothing else:

- a card asserting **"BLOCKED / Nothing runs."** ~3s before the tools went red;
- **"ALWAYS EXECUTE"** ~1.7s before they went green;
- the **outro cross-fading in on top of a still-visible caption card**;
- a beat showing the wrong app state entirely.

Then **verify motion in the rendered MP4** (pitfall #1: extract two frames far apart within a
video beat and confirm the content advanced — a frozen clip passes a single-frame check; and
measure freezes only in the *settled* window, pitfall #16). Also sweep the whole composite for
dead air in one command:

```bash
ffmpeg -i renders/<name>_1080.mp4 -vf "freezedetect=n=0.001:d=4" -an -f null - 2>&1 | grep freeze_
```

Every reported freeze must be a *designed* one (a freeze-frame or a spotlit hold) — anything else
reads as "it stays on the image for too long". Serve it and open it for the user:

```bash
(cd renders && nohup python3 -m http.server 8801 --bind 127.0.0.1 >/dev/null 2>&1 &)
# a tiny viewer.html with <video src=<folder>_1080.mp4 autoplay muted loop controls>
```

Report the file(s), resolution, duration, the brand source (given / extracted from <url> /
default), and any privacy items you left in. **Do not render 4K yet** — offer it, and only run the
4K master once the user says they're happy with the 1080p cut:

```bash
node "$HYPERFRAMES_CLI" render . -q high --resolution landscape-4k --crf 15 -o ./renders/<folder>_4k.mp4
```

**The 4K is the deliverable** — it carries all of the source's detail (a 1080p render downscales
the recording into the window and throws some away). Hand that over.

Finally, **tidy `renders/`**: delete interim/experimental cuts and any leftover `work-*` temp dir
(HyperFrames abandons one — often *hundreds of MB* — whenever a render is interrupted). Leave only
the named 1080p and 4K, so nobody grabs the wrong file.

## Phase 7 — Publish (optional)

When the video documents a ticket's feature, attach it there. The mechanics differ per tracker;
two rules hold everywhere:

- **Upload the 1080p, not the 4K.** This is the one place the 4K is the wrong file: a ticket embed
  is for reading the change in-browser, and a 4K master is large enough to be slow or rejected.
  Hand the 4K over directly and say in the comment that it exists.
- **Replace, don't add.** A second attachment with the same name is usually accepted silently, and
  then nobody can tell which is current. Delete the old one first.

Signed upload URLs are typically short-lived (often 60s) — run the upload immediately after
requesting one, not after a detour, and send back **every** header the signing response gave you.

---

## Notes on scope & variants

- **Feature guides use the guide format** (`video-plan/references/guide-format.md`, built per
  `references/guide-track-build.md`) — a fixed two-part house shape so a series is consistent.
  Demos and walkthroughs share the pipeline but differ in copy and pacing (guides dwell longer,
  label steps, and are narrated; demos move faster and are usually silent).
- **No footage, but a real app you can log into** → still this skill: Phase 1A records it. This is
  the case people under-reach on; you do not need a screencast to start.
- **No app, just a topic or a marketing URL** → not this skill. This one demos a *product you can
  operate*, from a recording you make or one you're handed.
- **An ad / promo for a cold audience** → out of scope. The differences are capture decisions
  (frame width, live interaction vs stills, showing the ask and not just the result), so they
  cannot be fixed in the edit. Don't approximate one from here.
- Keep the honest-but-directed principle: show the real product in the window, and use the
  spotlight + card to point the eye. That's what makes it read as a real demo, not a slideshow.
- **Where the video will be seen changes the copy, not the pipeline.** Embedded next to a feature:
  the viewer is already there, so name the control and skip the pitch — and write headlines worth
  using as chapter titles (`timeline.json`). Shown to one customer: their language, their
  vocabulary for the feature, their brand, and a privacy pass against *their* data on screen.

## How autonomous is this, honestly?

From `storageState.json` to a rendered 1080p cut, the capture path runs end to end without a
human. Three things still need one — **login** (never enter credentials), **authorising writes**
(name what will change, restore after), and **editorial intent** (which is the concept skill's
job, approved before any of this starts). Everything else — the timeline, the retries, the crop,
the spotlight coords, the privacy review — the capture path deletes rather than automates.

**These scripts exist because judgement alone did not hold.** Across one guide build, nine
revision rounds came from the agent's own defects rather than the user's taste — highlights that
outlived their target, a fade that dipped to the background, cleanup that missed auto-renamed
records. A localised remake then added four more user-caught rounds — two spotlights slicing text
(both percentage-guessed rects), an inherited mis-ordering that made the ending land "out of
nowhere", an ~8s image dwell, a headline stutter — and each became a mechanical check or a rule.
The prose rules existed both times and did not bind the way an assertion does. So:

- `scripts/apply-brand.mjs` — the brand step, and the contrast bars it refuses to cross. Run
  before composing; `--check` validates without writing.
- `scripts/extract-brand.mjs` — pulls a palette, type stack and logo off a live site via computed
  styles. A starting point to correct, not an answer.
- `scripts/make-brand.mjs` — builds a whole palette from one accent colour (or an SVG logo) and
  repairs it until every bar passes, for the common case of a customer with no brand guide.
- `scripts/preview-brand.mjs` — draws the palette on the real surfaces so a human can answer the
  one question no check can: is this their brand?
- `scripts/audit-composition.mjs --timeline` — run before **every** render; exit 1 means fix it
  first (durations, fades, spotlights, outro, glyphs, copy stutters, static dwell, frozen
  stretches), and it refreshes `TIMELINE.md` so the review notes and the video cannot disagree.
- `scripts/verify-material.mjs` — run with the audit. Models cards anchored bottom-left,
  `.ov.at-top` and `.ov.at-right`, and errors on any other `.ov` variant rather than measuring it
  in the wrong place. Proves each spotlight frames its subject with room to breathe and that no
  card covers it. Needs `data-roi` on spotlight-free beats; exit 2 means it could not check, which
  is not the same as a pass.
- `scripts/crop-spots.mjs` — after snapshots; READ every crop. Full-frame reads miss sliced text.
- `scripts/verify-topics.mjs` — narrated guides. Puts each declared topic's frame next to the
  sentence that names it. Catches LAG, LEAD, OCCLUDED and ABSENT. A blank spotlight column is NOT
  a failure — do not answer it by spotlighting everything.
- `scripts/app-state.mjs` — `snapshot` before the first capture, `record` for anything a probe
  creates out-of-list, `restore --go` at sign-off. (Its `networkidle` waits hang against some dev
  servers — see pitfalls #17.)
- `scripts/measure-spots.mjs` — spotlight rects measured on the freeze stills. Use instead of
  padding a `boundingBox`; `verify-material.mjs` stays the gate.
- `scripts/make-audio.mjs` — generates the voiceover from a project `narration.mjs`, anchored to
  clip ids so a re-timed cut moves the audio too. Resumable; its fit table is a GATE. Run
  `audit-composition.mjs --timeline` FIRST or the table shows the previous cut's windows.
- `scripts/measure-speech.mjs` — sentence boundaries inside each narration line, so a concept
  frame can highlight the item being spoken about. Run it after `make-audio.mjs`.
- `scripts/verify-narration.mjs` — transcribes the generated narration and diffs it against
  `narration.mjs`. The ONLY audio check that reads words rather than duration, level or pauses;
  exit 1 means the voice misreads something.
- `scripts/mux-audio.mjs` — lays the lines onto the silent master, video stream copied.

If you skip them, budget for the rounds.
