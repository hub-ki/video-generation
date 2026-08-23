# Design system — "floating window + spotlight" (the default demo look)

> **This design was adopted from a second implementation of the same idea, and the numbers below
> are its numbers.** Two things about it are worth stating before the details, because they are
> decisions rather than defaults:
>
> **Sizes are ratios of frame height, never pixels.** Every value here is written as a fraction of
> `--h`. The same layout in fixed pixels breaks between 1080p and 4K, and it breaks quietly —
> comfortable text simply becomes small.
>
> **The neutral palette is black and white, not a warm neutral.** A tinted default reads as a
> brand the video does not have: a beige canvas is still somebody's beige. `#ffffff` surface,
> `#000000` ink, `#666666` secondary, `#ededed` highlight, Inter 700 with a real fallback stack.
>
> Full-bleed is the default too — no window frame. A frame makes the content smaller and the
> content is the point. The windowed variant is still supported; set `.win`'s box and give it a
> radius and shadow.

This is the reference aesthetic: a light **plain canvas**, the recording in a
**floating rounded window**, a **spotlight** that dims the app and lights up the
element being discussed, **light overlay cards** (one short, natural-sounding headline —
a topic phrase or a short sentence, no kicker, never an enumeration), and **slow opacity
cross-dissolves**.
Full working skeleton: `assets/template.html` — copy it and fill in the beats.

The whole point of the design is: **show the real product, but direct the eye.**
The window keeps it honest; the spotlight + card tell the viewer what to look at.

**Reference frames.** If `assets/reference-frames/` exists locally it shows the target style on
a real build: `01-intro`, `02-spotlight-and-card` (the signature move), `03-result-spotlight`,
`04-crossfade` (mid-dissolve), `05-outro`. Media binaries are not committed, so a fresh clone
has none — the token contract below plus `assets/template.html` fully specify the look, and you
can regenerate frames with `hyperframes snapshot` of any real build. If the user supplies their
own reference images, prefer theirs and drop them in that folder.

> **Never sample a color out of an encoded video.** The render → encode round-trip shifts every
> color darker by a small constant (measured `(-4,-3,-4)` — sampling `#ecebe8` out of a render
> gave `#e8e8e4`). To verify a color, compare a **snapshot** (authored RGB, 1:1) against the
> token, never an extracted video frame. The same goes for reference images: read colors from
> `brand.json`, not off a picture of the design.

## Tokens

The design is **one look with swappable tokens**. Nothing in this file assumes a particular
brand; every color comes from `brand.json` and is written into the composition by
`scripts/apply-brand.mjs`. **Read `references/brand-style.md` before touching any color** — it
covers the four ways a brand gets in (given by the user, extracted from their website, generated
from a single colour, or the neutral default), and the constraints a palette has to satisfy to
survive this design.

```
--bg     the canvas behind everything      MUST be slightly darker than --card
--card   overlay cards + concept panels    the app's own paper color
--ink    headlines, titles, logo mark      ≥ 4.5:1 on --bg, on --card, and on BOTH --hl stops
--ink2   secondary text                    ≥ 3:1 on --bg
--hl/--hl2  headline highlighter gradient  light enough for --ink to sit on it
--dot    the canvas dot color              --ink at ~10% alpha
--sans   the type stack                    the brand's own, with a real fallback chain
```

Canvas = `--bg`, flat. It used to carry a dot grid; that was one company's house style riding
along in a template that called itself neutral, and it is gone. If you want it back it is one
rule: `radial-gradient(circle, var(--dot) 1.5px, transparent 1.6px)` at
`background-size:27px 27px`.

Three constraints are load-bearing, and `apply-brand.mjs` enforces them:

- **The canvas must be a shade darker than the card.** If the two match, the floating window
  and the overlay cards lose their edge and the whole design stops reading. This is why the
  canvas is *derived* from the card rather than taken from a website — a site's page background
  is the card color, not the canvas.
### Motion constants

```
full-screen card         3.2s hold
crossfade                0.5s between all segments
scene card fades in      0.7s  — or spotlight.atSeconds + 0.4 when the beat has one
camera move              1500ms, eased
```

The plate appears **after** the camera has arrived, not before: a label that lands on something
still in motion is captioning the wrong thing.

Two traps that come with the crossfade, both of which cost real footage:

1. **Convert VFR to CFR before `xfade`.** A webm recorded from a browser is variable-frame-rate;
   `xfade` then computes its offsets against the wrong timebase and every later cut drifts.
2. **Build offsets from the segment lengths you actually produced**, never from the planned ones.
   A segment one frame off shifts everything after it, and the accumulated error eventually goes
   negative.

### The highlighter is opt-in, and it is for a few words

`.head` renders plain. Wrapping the whole headline in a highlighter marks nothing — if every word
is emphasised, none is — and it made every card look like the same house style whatever palette
was loaded. Put `<mark>` around the two or three words that carry the point, or leave it off:

```html
<div class="head">The payoff, <mark>in a phrase</mark>.</div>
<div class="sub">One supporting sentence, in plain words.</div>
```

**A headline alone is not a card.** It states a claim and leaves the viewer to work out what they
are looking at while the shot is already moving on. `.sub` carries the sentence that says what is
on screen; skip it only when the headline is genuinely self-explanatory in the context of that
beat.

- **The highlighter must stay light.** The headline sits **on** it. A saturated brand accent
  used raw fails contrast; use its hue and push the lightness up (that is what
  `highlighterFromAccent()` does).
- **One palette per video.** Brands routinely have several that share nothing — a pastel
  marketing site, a denser in-app palette, an admin console. A product demo takes the *in-app*
  one. Never blend two: it reads as a mistake, because they are different systems.

Two copy rules that come from the design rather than from the brand: **no gradient text** other
than the headline highlighter, and **no em dashes in caption copy**.

## The window

The recording asset is already chrome-cropped (see ffmpeg-recipes). Size the video/img element **directly** to the window rect (no CSS `transform` — that scales the border-radius/shadow and is a pain), with `object-fit:cover`, `border-radius:20px`, and a soft shadow. Pick the window so its aspect **matches the cropped asset's aspect** — then `cover` fills with no letterbox and no distortion:

```
WIN = { left, top, w, h }   with  w/h == asset_w/asset_h
Aim for a THIN border (~60px) so the app fills the frame, leaving a strip of canvas on
all sides — the window is the subject, the grid is a frame around it.
e.g. asset 3200x1666 (1.9207) -> w:1800 h:937, centered -> left:60 top:72
     (a wider border, e.g. left:110 top:97, reads as "the app floating in a lot of background" —
     the earlier default; reviewers consistently asked for the app larger, so 60px is now it.)
```

Every beat's video/img gets the **same** `.win` rect; you crossfade opacity between them.

## Spotlight (the signature move)

Put a **scrim** div over the window and a **spot** box inside it. The spot's giant
spread box-shadow dims everything else; `overflow:hidden` on the scrim clips the dim
to the window so the canvas stays bright.

```css
.scrim{ position:absolute; top:<WIN.top>px; left:<WIN.left>px; right:auto; bottom:auto;
        width:<WIN.w>px; height:<WIN.h>px; border-radius:20px; overflow:hidden; pointer-events:none; }
.spot { position:absolute; border-radius:14px;
        box-shadow:0 0 0 9999px rgba(24,22,16,.52), 0 0 0 2px rgba(255,255,255,.92), 0 16px 40px rgba(0,0,0,.28); }
```

**CRITICAL:** write `right:auto; bottom:auto` — do NOT use `inset:auto` to clear the
base `.clip{inset:0}`, because `inset` is shorthand and its `auto` overwrites your
`top`/`left`, silently parking the scrim at (0,0) and misaligning every spotlight.

### Positioning the spot on an element

The window shows cropped source `[0,0 .. asset_w,asset_h]` scaled into `WIN`. So a
source element at cropped `(sx,sy,sw,sh)` maps to **scrim-local** coords:

```
scale = WIN.w / asset_w
spot.left = sx*scale   spot.top = sy*scale   spot.width = sw*scale   spot.height = sh*scale
```

If your source coords are in the *original* (pre-crop) frame, subtract the crop origin first: `sx = orig_x - cropX`, `sy = orig_y - cropY`. When the target is a wide table, remember to include its header row.

#### 🚨 NEVER eyeball coordinates off an image you viewed

**This is the single biggest time-sink in this skill — it burned four rounds in one
session** (result table, review text, file picker, upload button). When you read an
image, it is **downscaled to fit** ("original 2506x1232, displayed at 2000x983"). Pixel
positions you read off it are in *displayed* space, not source space. Drawing a labelled
grid does **not** save you — you'll read the displayed position of a gridline instead of
its label and be off by the scale factor. Estimating "looks like x≈630" is guessing.

Use one of the two reliable methods instead:

**(a) Measure programmatically on the source (best).** Find the element's real bbox with
PIL — no human eye involved:

```python
from PIL import Image
im=Image.open("assets/beat_hover.png").convert("RGB"); px=im.load()
bg=(249,246,242)                                   # the APP's own page background, sampled
                                                   # from the capture — not a design token
d=lambda x,y: sum(abs(px[x,y][i]-bg[i]) for i in range(3))>12
# contiguous runs of non-background across the row → each UI element's x-extent
runs=[]; cur=None
for x in range(X0,X1):
    hit=any(d(x,y) for y in range(Y0,Y1))
    if hit and cur is None: cur=x
    if not hit and cur is not None: runs.append((cur,x)); cur=None
# then profile rows within the chosen run to get its y-extent
```

A hovered/selected element usually has its own background, so it falls out as **one
contiguous run** — that's your bbox. Then apply `scale` above. (Worked example: the
"Upload file" pill measured as source x 1189-1293, y 154-177 → exact, first try.)

**(b) Measure off a rendered snapshot.** The composition is 1920×1080 and
`hyperframes snapshot` emits exactly 1920×1080, so **snapshot pixels ARE CSS pixels,
1:1** — no scale factor. Crop a tight region around the target with PIL and read the
bbox, then subtract the window origin for scrim-local coords:
`spot.left = screen_x - WIN.left`, `spot.top = screen_y - WIN.top`.

Whichever you use, **verify with a snapshot afterwards** — and verify by *cropping and
zooming* the snapshot, not by squinting at the full frame.

**Sanity check before you render:** does the spot's centre match the element's centre?
Compute it; don't look at it.

### A `boundingBox()` rect is a STARTING point — then MEASURE, don't pad

An element's own box hugs its glyphs, so using it raw puts the spot's 2px white border on the
antialiased edges of the text and the whole thing reads as clipped.

The obvious fix — add a constant ~12-18 source px on every side — only works for a control
with room around it. On a real form it fails in both directions at once: a field has its label
~20px above and its help text ~18px below, row actions sit ~4px apart. Padding then either
still slices the control's own ink or grows into the neighbour, and `verify-material.mjs`
reports a **different edge each round**, so you chase the error from edge to edge. Five
spotlights in one build went three rounds that way.

**So measure the layout's own whitespace instead:**

```bash
node <skill>/scripts/measure-spots.mjs .    # -> spot-rects.json (source px)
```

It walks each edge outward from the control until a run of genuinely blank pixel rows/columns
and sits inside that run — where a human would draw the box. Seed it from the **`_hover`**
mark (the frame the still was cut from, see playwright-capture.md §16), feed the result to the
composition, and still run the check:

`scripts/verify-material.mjs` (M1) measures, on the *source* asset, the distance from each edge
to the nearest ink and whether that ink continues past the edge. ≥10px on all four edges is
comfortable, <6px fails, and 0-2px with ink crossing means the box is genuinely cutting its
subject. `measure-spots.mjs` is a better starting point; `verify-material.mjs` is the gate.

*Six of the seven spotlights in one first cut sat at 0-2px clearance* — all seven
crops had been read by eye and passed. One was worse than tight: its top edge ran through the
"Redact & send" button it was supposed to be pointing at, with ink crossing 97% of that edge.
Padding is cheaper than a revision round.

Spotlight only the **key / result** beats (the modal, the calendar, the table, the "sent ✅" line). Streaming/typing beats are usually clearer as the full bright window. Keep it consistent: e.g. "all result beats get a spotlight." Fade the spot in slowly (~0.9s).

### Sometimes there is no box, and that is a finding — not a failure to try harder

The skill already says to drop the spotlight when a beat has no single control worth pointing
at. There is a second case: a control that genuinely **cannot** be framed, because the layout
gives it no clearance on some edge. Then no padding, no measurement and no override helps, and
chasing the error edge to edge wastes rounds.

Prove it before you conclude it, on the freeze still, in source px — find the subject's ink
extent, the cursor's (it is drawn over the control and hangs below-right of its tip), and the
nearest neighbour's:

```bash
python3 -c "
from PIL import Image
px = Image.open('assets/<freeze>.png').convert('L').load()
for y in range(TOP, BOTTOM):
    xs=[x for x in range(LEFT, RIGHT) if px[x,y] < 238]   # 238 catches antialiased edges
    print(y, (min(xs), max(xs)) if xs else 'blank')"
```

A worked example, from a settings guide whose feedback button sits in the chat composer: button ink ends at
y1261, the cursor over it runs to y1280, and the message input's top border spans the full
width at y1284. Three blank rows. `MIN_CLEAR` is 6 on each side, so every candidate box slices
either the cursor or the composer — which is precisely the defect M1 exists to catch.

**Then ship the beat with no spotlight**, keep the click pulse (it marks the point) and let the
card name the control. Record the measured numbers in a comment next to the clip so the next
person doesn't re-litigate it. A beat that reads fine without a box beats a box that cuts.

## Overlay card (bottom-left, one consistent position)

Light card with a faint dot texture + shadow; one short, bold headline, no kicker badge
above it. **No kicker.** A short standalone label above the headline (ALWAYS THE SAME, ONCE
MORE, DETACHED) reads fine to the person who wrote it and meaningless to everyone else — it
depends on context (the headline below it, an earlier beat) that a bare label can't carry on
its own. One real build shipped a German "IMMER GLEICH"; taken alone it's an incomplete
comparison (same as *what*?), and it doubles as the idiom for "tediously repetitive" — the
opposite of the reassurance it was going for. Expect that second failure in any language: a
bare label is exactly the string an idiom can hijack. The fix is not necessarily a longer
sentence, though — **both a bare topic phrase and a short sentence are fine, as long as the
single headline carries enough on its own to mean something**: "The logo goes home, the bell
shows notifications." works as a full sentence; "Agents vs. skills." or "Feedback in chat."
work just as well as topic phrases, because
each names its own subject rather than leaning on a kicker above it. **Never an
enumeration** — a card listing several items ("Documents, agents, skills and connectors.")
reads like a list pasted onto a card, not something a person would say; name
the topic instead or split it across beats. **The one hard bar, whichever form you pick: it
has to sound like something a person would actually say in the video's language — not
stilted, not translated-sounding.**
**Keep all overlays in the same corner** — swapping top/bottom between beats is
distracting. Bottom-left overlapping the window's corner (like the references) is safe.

**The one exception, and it outranks the same-corner rule: a card must never cover the thing
its beat is about.** The card is fully opaque, so a subject in the lower half of the frame
(a composer, a chat bubble, a table near the page bottom) ends up behind it. When that
happens, move *that* card to `.ov.at-top` — a consistent corner is a nicety, showing the
subject is the point. `scripts/verify-material.mjs` (M2) measures this and fails the render;
it needs a spotlight rect or `data-roi` on the beat to know what the subject is. Two cards in
one cut had to move: the typing beat's (over the composer) and the tester beat's (the
spotlight reached down into the card's zone once padded).

**When the app's persistent chrome owns the card's corner, per-beat placement is mandatory.**
One settings guide hit this: the app's icon rail runs down the LEFT edge for the window's
full height, and five of its ten beats are about a rail icon or a menu hanging off one — so
the default bottom-left card sat on the subject every time. Give each card a position chosen
for its own beat. Three anchors are modelled by the checker, and only these three:

```
(default)      .ov{left,bottom}   bottom-left
.ov.at-top                        top-left
.ov.at-right                      bottom-right   (add .at-top too for top-right)
```

Any other `.ov` modifier makes `verify-material.mjs` fail loudly rather than measure the card
in the wrong place — which is what it used to do silently, reporting phantom occlusions that
no edit could clear.

**If a beat's approach and its result sit at opposite ends of the frame, SPLIT the card at the
cut instead of compromising.** One card cannot clear both a control at the bottom-left and the
panel it opens at the top-left. Four cards in that guide split — gear → settings sidebar,
profile → save button, menu item → the tour panel, lifebuoy → the ticket filters — and the
split is an improvement, not a workaround: write the second half to carry the part of the
explanation that belongs to what is *then* on screen ("The gear opens your settings." → "The
user section applies to everyone; what sits under it depends on your permissions."). Because the
halves meet on a hard cut, the card reads as making way.

**Start a card after its beat's crossfade, not 0.35s in.** At `+0.35` the previous clip is
still half-visible, so a card placed correctly for its own beat lands on the *outgoing* beat's
subject — and M2 reports it against the wrong clip, which is genuinely confusing to debug. Use
`start = beatStart + XF + 0.15`.

```
head: 800 / ~38px / bold ink, 2 lines OK, sitting on the --hl → --hl2 highlighter bar
```

The headline keeps the highlighter treatment the kicker used to own: `display:inline` +
`box-decoration-break:clone` on `.head` re-paints the gradient bar per wrapped line, so a
two-line headline gets two tight highlighter strokes hugging the actual text instead of one
rectangle behind whatever empty space a short line leaves. See `assets/template.html`.

**52px was the kicker-era size and no longer fits.** It was tuned for a 1-3 word kicker;
a full sentence at 52px wraps to 3-4 lines instead of the intended 2 — measured on rendered
cards, not assumed from the CSS. 38px, with `.ov`'s `max-width` opened up to ~940px, is what
actually holds a longer headline to 2 lines. **Render and look at the actual frame after
writing headline copy** — line count depends on the specific words, not just character
count, so a card that reads fine in the HTML source can still overflow.

Copy pattern per beat: one short **headline**, no kicker, never an enumeration — either a
bare topic phrase ("Agents vs. skills.", "Feedback in chat.") or a short natural sentence
("Opens the Skills menu."), not a punchy marketing fragment ("One click from the
marketplace.", "Organized in seconds."). Pick whichever form reads more naturally for that
particular beat — the bar is that it sounds like something a person would say, not which
structure you used. A standalone label above the headline needs the headline to mean
anything, which is exactly the failure mode it's supposed to prevent — see the Overlay card
section above.

### A card must not out-run the screen

Cards come in two kinds, and they schedule differently:

- **Action cards** ("② Pick one", "Three levels") describe what is being *done*. They can run
  over the action beat — they can't be wrong.
- **State cards** ("Blocked / Nothing runs.", "Always execute / No prompts.") assert what the
  screen *shows*. Start one **only when that state is actually on screen** — in practice, over
  the freeze, not over the action that causes it.

Getting this wrong is invisible to `check` and to mid-point snapshots (card and state agree
there) and only shows up when you sample the render. It shipped twice in one session: a
"Nothing runs." card sat over an open dropdown for 3s before anything was blocked.

**And end every card and spotlight before the outro starts.** `label()`/`spot()` fades that
run past the outro's `data-start` composite *over* the logo — sampling caught the brand mark
fading in on top of a live caption card.

## Crossfades

Adjacent beats **must be on different tracks** (`data-track-index`) or the layout
linter errors on overlapping same-track clips. Alternate track 1/2. Fade with GSAP:

```js
function win(sel,t,tEnd){ // t..tEnd is the visible window; XF=0.7
  tl.fromTo(sel,{opacity:0},{opacity:1,duration:XF,ease:"power1.inOut"},t);
  tl.to(sel,{opacity:0,duration:XF,ease:"power1.inOut"},tEnd-XF);
  tl.set(sel,{opacity:0},tEnd);            // hard-kill for seek-safety
}
```

Overlap consecutive beats by `XF` so one dissolves into the next (ref: the mid-fade frame). Fade overlay cards / spotlights slightly inside their beat so labels don't collide across the cut.

### 🚨 A fade-out MUST have a fade-in partner

`win()` fades a clip out over its last `XF`. If the next clip **hard-cuts in** at that same
instant (`hold()` / `hardInFadeOut()`, as every freeze does), nothing is fading in during that
window — so the composite dissolves toward the bare canvas and snaps back. It reads as
a **"transition to nothing"**.

*This shipped.* The streaming beat used `win()` while the answer still was hard-cut in behind
it: window brightness dipped from 241 to 233 (the empty canvas is ~236) for 0.7s at ~12s.
`check` passed, snapshots passed, every pixel-diff passed.

```
next clip fades in  (win)            -> this clip may fade out   win()
next clip hard-cuts in (hold/hardIn) -> this clip MUST hard-cut out  fadeInHardOut()
```

The fix requires the two frames to be identical, so cut the still at **exactly** the frame the
outgoing clip ends on. `scripts/audit-composition.mjs` asserts this rule.

### Point at the control, not at the result

A spotlight exists to answer "what do I click?". If the card says *"Click Skills…"*, light up
the **Skills button** at the moment of the click — not the panel that opens afterwards. Freeze
on the affordance, then let the result play **bright and undimmed** so it can actually be read.
Highlighting the outcome both misses the teaching moment and dims the thing you want read.

**Include the actual button, even when a tooltip names it.** For a control whose only visible
label is a hover tooltip (a model toggle, a mic), it is tempting to spotlight just the tooltip —
but that lights up the *description*, not the thing the viewer clicks. Frame the **button and
its tooltip together**: measure both boxes and take the combined bbox. Long or localised
tooltips are wide (the German for "Use a more powerful model" runs ~1.4× the English), which
makes a tooltip-only box look deceptively complete while the button sits just
below it in shadow. A reviewer will catch it — "you only highlighted the description of it."

And if a beat has no single control worth pointing at, give it **no spotlight**. A box covering
most of the window directs nothing and its edges land mid-sentence.

## Freeze frames (the "don't make me pause" move)

When a step has a moment the viewer *must* read — a button to find, a dialog to
understand — **stop the video on it**. Cut the beat into three: play in → freeze → play
on, holding the still ~2.5-3s with a spotlight on the target. Reads as the video pausing
to explain itself.

```
vUpA   (video, source A→F)   fade in normally, HARD CUT out at F
vHover (still  at source F)  HARD CUT in and out   ← the freeze + spotlight
vUpB   (video, source F→…)   HARD CUT in, fade out normally
```

Cut all three from the **same source frame F**, so the boundaries are frame-identical.

**CRITICAL — the boundaries must be HARD CUTS, never crossfades.** It's tempting to
reuse `win()`, but a crossfade between two *identical* frames **dips through the
background**: the template stacks `B` (opacity `t`) over `A` (opacity `1-t`), so the
composite is `I·(t + (1-t)²) + BG·t(1-t)` — at `t=0.5` that's **25% background bleed**, a
visible flash of the dot grid. A hard cut has no such dip and is invisible *precisely
because* the frames match.

```js
function fadeInHardOut(sel,t,tEnd){ tl.fromTo(sel,{opacity:0},{opacity:1,duration:XF,ease:"power1.inOut"},t);
  tl.set(sel,{opacity:0},tEnd); }
function hold(sel,t,tEnd){ tl.set(sel,{opacity:1},t); tl.set(sel,{opacity:0},tEnd); }
function hardInFadeOut(sel,t,tEnd){ tl.set(sel,{opacity:1},t);
  tl.fromTo(sel,{opacity:1},{opacity:0,duration:XF,ease:"power1.inOut"},tEnd-XF); tl.set(sel,{opacity:0},tEnd); }
```

Adjacent hard-cut clips still need **alternating tracks** (`vUpA`=2, `vHover`=1, `vUpB`=2).

**Verify the freeze is real:** diff two frames ~0.8s apart *mid-freeze, with the
spotlight settled* — must be exactly `0.00000`. Don't diff across the spotlight's
fade or you'll measure the scrim, not the footage (see pitfalls #16).

## Intro / outro

Same canvas, centered: the **brand's own logo mark**, inline in the template's
`<!-- LOGO:START -->` slots — written there by `apply-brand.mjs` from `brand.json`, never
hand-built as an approximation and never redrawn from memory (`brand-style.md` → The logo).
Under it, a big bold ink title; one word is punchy. Cross-dissolve into/out of the beats.

**No subtitle on either end — not the intro, not the outro.** A one-line subtitle under the
title was standard on both until a review pass found every one it produced was either
restating what the narration says a few seconds later, or generic enough to fit any video in
the series ("What the product is, and where things live." / "Now you know the basics."). Neither
earns a frame with nothing else competing for attention, so the slot is gone from the format
on both ends, not just emptied out — don't add a `.sub` back under either title even if a
specific line seems to fit; the recurring failure was that it always seems to fit, right up
until the narration says the same thing anyway.

**The intro is logo + video title, always. The outro is logo only, no title — no
exceptions, going forward.** A handful of videos shipped before this rule was made explicit
still carry an outro title (kept as-is, not retroactively stripped); every new build gets
logo-only. Nothing else on either card: no subtitle, no chip, no reflective closing line.

If the brand mark is a **wordmark** (it spells the name), a title naming the brand duplicates
it. So a title, wherever one appears, names the **feature** ("Workspaces"), never the brand.
Whatever written form of the name the brand uses on screen, use that one everywhere and only
that one — `brand.json`'s `name` is the single source for it.

## Seek-safety (avoids the one recurring lint error)

Any `to({opacity:0})` fade-out that lands on a clip boundary needs a following
`tl.set(sel,{opacity:0}, <that time>)`. And don't let a fade cross the **next** clip's
start — end spotlight/overlay fades a hair before the outro begins.

## Click pulse (guide track)

A guide should show *the click landing*, not just its result. The capture rig logs each
click's exact point (`markClick()` → `beats.json`), and the composition rings an expanding
circle there at the start of the freeze, before the spotlight fades in.

```css
.pulse { position:absolute; border-radius:50%; border:4px solid rgba(21,17,12,.60);
         background:rgba(242,237,168,.30); will-change:transform,opacity; }
```

```js
function clickPulse(sel,t){
  tl.set(sel,{opacity:1},t);
  tl.fromTo(sel+" .pulse",{scale:.18,opacity:0},{scale:1,opacity:.95,duration:.20,ease:"power2.out"},t);
  tl.to(sel+" .pulse",{scale:1.5,opacity:0,duration:.62,ease:"power2.out"},t+.20);
  tl.fromTo(sel+" .pulse",{scale:.18,opacity:.8},{scale:1.5,opacity:0,duration:.66,ease:"power2.out"},t+.60);
  tl.set(sel,{opacity:0},t+1.40); }
```

Put it on its own track ABOVE the scrim so the dim never covers it. Never hand-place it.

**Wrap the pulse in a `.scrim` and use WINDOW-LOCAL coordinates** (`css.x * DPR * SCALE`, no
`WIN.left`), rather than a bare `<div class="clip">` at root-absolute coordinates:

```html
<div id="pu_b7b" class="clip scrim" data-start="…" data-duration="1.4" data-track-index="4">
  <div class="pulse" style="left:…px; top:…px; width:120px; height:120px;"></div>
</div>
```

Two reasons, both real. The `.scrim` rect clips the ring to the window's rounded corner —
clicks on a left-edge icon rail otherwise spill their pulse onto the canvas. And a bare
`.clip` is counted as a **caption card** by `verify-material.mjs`, which then reports
`pu_bXX covers 50% of what bXX is about` for every bottom-left spotlight: a false positive
indistinguishable from the real defect, and 8 of the first 19 errors in one build. The script
now guards against both classifications, but the wrapper is still the right markup.

## Per-edge spot padding

The default ~18 source px of padding assumes a control with room around it. Adjacent icons
(row actions sit ~4px apart) make that padding slice the neighbour, which
`verify-material.mjs` reports as *"the left edge cuts through the subject"*. Allow the rect
to narrow one edge rather than dropping the padding everywhere:

```js
loeschButton: { x: 317, y: 245, width: 20, height: 20, pad: { left: 5 } },
```

## Concept panels and the Part 1 → Part 2 bridge (guide track)

Part 1 frames are built markup shown in the **same rect as the app window** (`.pnl`, card
background, same radius and shadow), so the concept half and the app half read as one video.
Reserve the bottom ~330px of the panel for the caption card.

**There is no visual divider slide between the halves — never build one.** The bridge is a
single spoken line ("Let's look at that in the app now.") anchored on the cut
itself: an empty `<div class="clip card" ...></div>` with no inner markup, no eyebrow, no
title, just a plain opacity fade so the cut doesn't hard-jump. If a project still has an
`.eyebrow`/`.title`/`.sub`-carrying divider from before this rule, strip its inner markup
down to that same empty div (and delete the now-orphaned `.eyebrow`/`.sub` CSS) while keeping
the spoken bridge line unchanged — this is a visual-only change.

**Static markup needs choreography.** Without it these frames sit frozen for their whole beat.
Stagger the content in, then add a late emphasis — and animate a **transform**: a `boxShadow`
tween produced no measurable change at all (frame frozen 9.9s), and a `scale` on 64px icons
was too subtle for `freezedetect`. `x`/`y`/`scale` on the whole card registers.
