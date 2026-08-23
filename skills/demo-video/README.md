# demo-video

Turn an app into a finished, designed demo or guide video.

You get back a polished video — floating window, spotlights, freeze-frames, captioned steps,
your own logo on the intro and outro. No video editor, no timeline, no manual work.

This file is the **human-facing overview**. The pipeline the agent actually follows is
[SKILL.md](SKILL.md). The concept it builds from comes from the companion
[`video-plan`](../video-plan/) skill.

**Two ways in:**

- **It records the app for you** *(preferred, web apps)* — you sign in once, the agent drives the
  app with Playwright and records it. The footage has no browser chrome, no desktop, nothing but
  your app; you pick the text size; there are no fumbled takes to cut; and it can be **re-run when
  the UI changes** instead of re-recorded by a human.
- **You hand it a `.mov`** — for a desktop app, Figma, mobile, or a recording you already have.

> Ask for the first one. In **one** comparison of the same flow during development — one run, one
> application, not a benchmark — it produced ~1.5× larger on-screen text and needed roughly half the work, because
> a scripted run logs its own timeline instead of leaving the agent to reconstruct it from pixels.
> Treat that as the reason for the default, not as a measured guarantee.

---

## Setup

Nothing to install by hand. The render toolchain bootstraps itself the first time it's needed:
the agent runs `scripts/setup-render-env.sh`, which resolves the best ffmpeg it can find,
installs a pinned HyperFrames CLI into `~/.hyperframes-cli`, and patches the false "0 GB free"
disk check if this OS has that bug. It is idempotent and safe to re-run. "The best it can find" is
literal — read the paragraph below before assuming you got a complete toolchain.

| | |
| --- | --- |
| **Node 18+** | required — the render CLI runs on `node` |
| **bun** | preferred for installs; the scripts fall back to npm without it |
| **ffmpeg** | auto-resolved: system build → `brew` (macOS) → `ffmpeg-static` (no sudo) |
| **HyperFrames** | auto-installed, pinned, into `~/.hyperframes-cli`. A different version found there or in the project is not used: the pinned build is installed into that cache instead |
| **Playwright + Chromium** | only for the capture path (`scripts/setup-capture-env.sh`) |
| **`ELEVENLABS_API_KEY`** | only if you want narration |
| **Disk** | ~500 MB one-off, shared across every project |

A stripped ffmpeg is worse than none: Playwright's bundled build and Remotion's compositor bundle
are both on many machines, both answer to `ffmpeg`, and both lack filters this pipeline needs. The
setup script probes for the *filters* rather than for the binary: `fps`, `pad` and `crop` are
required and a build without them is rejected, while a missing `freezedetect` is a warning,
because the last-resort path — a wrapper around Remotion's compositor bundle that rewrites `fps=`
and `pad=` out of every filter chain — does not have it. That path works and is degraded: two of
the automated freeze checks silently pass on it, and the script says so when it lands there.

Install the skill itself as described in the [repo README](../../README.md).

---

## Whose brand a video is in

The design ships with **no company's colours, type or mark** — a neutral grey palette and a
placeholder logo. Every project picks a brand up front, four ways:

```bash
# 1. you have the tokens: write brand.json
# 2. take them off your website (palette, type, logo)
node <skill>/scripts/extract-brand.mjs https://your.site --out ./brand.json --logo-dir ./assets
# 3. you only have a colour, or only a logo — build a palette around it
node <skill>/scripts/make-brand.mjs --accent "#2f6df6" --name Acme
node <skill>/scripts/make-brand.mjs --from-logo ./assets/logo.svg --name Acme
# 4. change nothing — the neutral default. Fine internally, not for customers.

node <skill>/scripts/preview-brand.mjs .    # -> brand-preview.html: look at it first
node <skill>/scripts/apply-brand.mjs .      # then write it into the composition
```

`make-brand.mjs` derives the whole palette from one colour — the neutrals carry a trace of its
hue, so the frame reads as one system rather than grey with a coloured bar bolted on — and repairs
itself until every legibility bar passes.

`preview-brand.mjs` renders those tokens onto the real surfaces (canvas, spotlit window, caption
card, intro, outro) at true size, so you can see the palette before a single frame is rendered.

`apply-brand.mjs` writes the tokens and **both** logo slots, and refuses a palette that would be
hard to read (it checks the headline ink against the canvas, the card, and both highlighter
stops). Details: [references/brand-style.md](references/brand-style.md).

---

## Use it — A. let it record the app (web apps)

**1. Ask:**

> Make a guide video showing how tool permissions work in `https://app.example.com`.
> Cover finding the setting, the three levels, and the per-tool override.

Tell it *what to teach* — that's the one thing it can't work out for you.

**2. Sign in once, when it asks.** It opens a real browser window and waits for you. It never sees
your password; it saves a session cookie (gitignored, delete any time).

**3. Say yes to the writes.** Driving your app changes real settings. It tells you what it will
change before it does, and puts it back afterwards.

Then it records, cuts, composes and renders on its own. Want to watch? Ask — it can run headed and
slowed, with a step-by-step HUD, and leaves a scrubbable Playwright trace.

## Use it — B. hand it a recording (desktop apps, Figma, mobile)

**1. Drop your recording here:**

```
videos/<your-video-name>/raw/your-recording.mov
```

Create the folders if they don't exist. Any `.mov` / `.mp4` works — one continuous take is fine,
fumbles and all: it finds your retries and cuts them.

> ⚠️ Some agent runtimes and sandbox configurations cannot read `~/Desktop`, `~/Downloads` or
> `~/Documents` — it depends on the runtime and its permissions, not on the operating system. If
> that happens, move the recording into the project folder, because the agent cannot copy it out for
> you.

**2. Ask:**

> Here's a screen recording at `videos/my-demo/raw/recording.mov` — make a demo video out of it.

**3. Collect the result:**

```
videos/workspace/renders/workspace_1080.mp4     ← 1080p, while you iterate
videos/workspace/renders/workspace_4k.mp4       ← 4K master, once you sign off
```

Files are named **`<folder>_<resolution>`** so they stay identifiable once they've been downloaded
and forwarded around.

**Send the 4K.** It's the deliverable — it carries all the detail from your recording. (Most chat
tools cap *streaming* playback at 1080p, but anyone who downloads gets the full 4K.)

Useful things to say while it works:

- **"make it a guide"** — numbered steps, slower pacing, covers every feature shown. (vs. a
  *demo*: one narrative, faster, benefit-led. It will ask if unclear.)
- **"the sharing bit should be in the middle"** — reorder beats freely.
- **"that upload step is too fast"** — pacing is adjustable per beat.
- **"blur my email"** — it flags anything private it sees, but say so if unsure.

It renders **1080p** while you iterate, and only produces the 4K master once you say you're happy.

**Redo steps as often as you like while recording.** It spots retries, false starts and
corrections, and shows only the clean take of each moment — you don't need a flawless run.

---

## Where everything lives

```
videos/workspace/
├── raw/          ← YOU put your recording here
│     └── recording.mov
├── renders/      ← YOUR finished videos come out here
│     ├── workspace_1080.mp4
│     └── workspace_4k.mp4
├── assets/       │  working files — cut clips, stills, the silent master.
├── brand.json    │  your palette, type and logo
└── index.html    │  the composition
```

One folder per video; the folder name becomes the file name. `assets/` gets large (a few hundred
MB of intermediate clips) — safe to delete once you're happy with the render. Alongside these
you'll find `PLAN.md` and `SCRIPT.md` (approved before the shoot) and `TIMELINE.md` (generated —
hand this to whoever reviews the cut).

**Keep video projects out of your product repo.** They're ~100 MB of media each; put them in a
sibling folder (e.g. `~/code/videos/`).

---

## Sharing a project folder (so someone else can iterate)

A project folder is self-contained *except* one file that must never leave your machine:
**`capture/storageState.json` is your logged-in session for the app** — whoever has it is signed in
as you. Strip it, plus the regenerable bulk, when handing a folder over:

```bash
zip -r <name>-share.zip <name>/ -x '*/storageState.json' '*/node_modules/*' '*/renders/*' '*.DS_Store'
```

The recipient signs in themselves (the auth step creates their own `storageState.json`) and
re-renders locally. Keep `raw/` in the zip — without the untouched original they can re-time
existing cuts but not cut new beats.

---

## What's in here

| | |
| --- | --- |
| `SKILL.md` | the pipeline the agent follows — start here if you want to understand it |
| `references/brand-style.md` | **the brand step**: your tokens, or extracted from your website |
| `references/design-system.md` | the look: window, spotlights, cards, freeze-frames |
| `references/playwright-capture.md` | recording the app itself: viewport, cursor, auth, `beats.json` |
| `references/ffmpeg-recipes.md` | the exact cut / speed / excise commands |
| `references/multiple-takes.md` | picking the clean take out of a one-take recording |
| `references/pitfalls.md` | traps that cost real hours — read before changing anything |
| `references/timeline-and-review.md` | the generated timeline; landing timecoded review feedback |
| `references/voiceover.md` | ElevenLabs narration, the fit table, quota and voice traps |
| `references/guide-track-build.md` | building a two-part feature guide |
| `references/companion-docs.md` | standalone training docs next to a video (only if asked) |
| `assets/template.html` | the composition skeleton, with BRAND and LOGO slots |
| `assets/brand.example.json` | a filled-in brand file to copy |
| `assets/dpr-fixture.html` | test page for verifying capture pixel density |
| `examples/starter/` | empty `PLAN.md` / `SCRIPT.md` / `narration.mjs` to copy |
| `scripts/` | the setup, capture, brand, audit, verification and audio tooling |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| *"Low disk space / 0.0 GB free"* but the disk is fine | the setup script patches this; make sure it ran and printed `patched disk-check` |
| Setup says it fell back to a *STRIPPED* bundle | it found no full ffmpeg. Install one (`apt install ffmpeg` / `brew install ffmpeg`) and re-run — otherwise the freeze checks can't run |
| Rendered video is frozen on one frame | see `references/pitfalls.md` §1 — verify with two frames far apart, not one |
| Sharp when you download it, blurry when streamed | most chat tools cap streaming playback at 1080p. Send/download the 4K. Detail: `references/pitfalls.md` §14 |
| It "can't find" your recording | it is probably in Desktop/Downloads/Documents, which some runtimes cannot read. Move it into the project |
| `hyperframes: command not found` | expected — it is never installed globally. Use `node "$HYPERFRAMES_CLI"` after sourcing the setup script |
| `apply-brand.mjs` refuses to write | the palette fails a contrast bar. It prints which one and by how much |
| The outro still shows the placeholder mark | `brand.json` has no `logo`, or you edited only one of the two LOGO slots by hand |
| The logo looks tiny next to the title | it is a wide wordmark on the square-mark default width. Set `logo.width` / `logo.outroWidth`; `preview-brand.mjs` warns about this |
