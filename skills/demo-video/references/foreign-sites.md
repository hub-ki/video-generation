# Filming a website you do not own

Everything else in this skill assumes the friendly case: your own app, a login you control, a
DOM you can change when it fights you. A third-party website gives you none of that.

This reference is what changes. Read it whenever the capture target is not yours — a customer's
site, a competitor's, a public page you are making an explainer about. The composition, the
verify layer and the voiceover are unchanged; **only the capture changes.**

Most of what follows was learned twice, independently: once here, once by a team building a
product that films arbitrary websites. Where the two disagreed, the disagreement is written
down rather than resolved into a false rule.

---

## 0. The gate that has nothing to do with code

**Before anything: are you allowed to film this site, and does the caller know they are asking?**

You cannot answer this from the DOM, and neither can the person running the skill unless you
ask. Ask it once, in chat, in the same breath as confirming the URL:

- **Whose site is it?** Their own, a customer's with a brief, or a third party's.
- **What is the video for?** An internal walkthrough and a published ad sit very differently
  with someone else's trademarks, screenshots and copy on screen.
- **Is anything on the page personal data?** Comment threads, author names, profile photos,
  a live chat widget, user-generated content in a feed. It goes in the recording at 4K and it
  is not yours to publish.

Do not treat "the page is publicly reachable" as consent. It answers a different question.

Three hard lines this skill holds:

1. **Public pages only, by default.** `http(s)` only. No embedded credentials in the URL. Not
   `localhost`, not `*.internal`, `*.local`, and not private, link-local or CGNAT address
   ranges — those point at infrastructure, not at a website. **Nothing enforces this.** Neither
   the capture rig nor `extract-brand.mjs` validates the URL, and a string check would not have
   covered redirects, DNS rebinding or the subresources the page pulls in anyway. The line holds
   because the person running it holds it. Pointing a browser at a URL somebody else chose is an
   SSRF primitive: if this ever runs as a service rather than by hand, put network isolation
   under it, not a deny-list.
2. **Filming is read-only.** Do not submit forms, do not create accounts, do not write into
   someone else's production database to make a nicer shot. If a beat needs filled-in state,
   film a demo or sandbox instance.
3. **Logged-in third-party sites need an explicit, per-domain yes.** `storageState.json` is
   reasonable when a human signs into their own app. On a stranger's site the same file means
   a person's session is sitting on disk next to the footage, an automated script is driving
   an account through terms you have not read, and everything past the login is by definition
   non-public. If you do it anyway: confirm the specific domain, and destroy the session file
   when the job ends.

---

## 1. Consent walls

Film the page, not the cookie dialog.

```js
const consent = await dismissConsent(page);
if (consent.covered) throw new Error(`still covered by ${consent.blocker} — do not film`);
```

`dismissConsent` tries known platform ids first (OneTrust, Cookiebot, Usercentrics, Didomi,
Klaro, Borlabs, Quantcast, Sourcepoint, tarteaucitron), then accessible names, and searches
**inside iframes** — Sourcepoint, Quantcast and many OneTrust deployments render the wall in one,
where `page.click` cannot see it at all. Verified on two live sites.

**It polls until its deadline; it does not scan once.** A single pass is timing luck. Playwright
ignores the `timeout` option on `isVisible` (documented as deprecated and unused), so a scan that
looks patient is not: against a fixture, the same banner was found at 0ms and missed at 300ms,
with `clicked: false` returned in 46ms.

**Every cross-frame call has a hard deadline.** `page.frames()` includes
`<iframe loading="lazy">` elements Chromium has not loaded, whose `url()` is empty and which have
no execution context. A locator query against one **never settles** — it neither resolves nor
rejects, so `.catch()` cannot help and the capture hangs with no error. Measured on a news site:
three lazy widget frames, `frame.evaluate(() => 1+1)` still pending after 15s, the consent scan
still running after 120s. Empty-URL frames are skipped and every remaining call is raced against
a timer.

**It rejects before it accepts.** Rejecting sets fewer third-party cookies in a session about
to be filmed, and a video that opens by accepting tracking on the viewer's behalf shows a
consent decision nobody in the audience made. Sites that only offer "accept" get the fallback,
and the return value records which was clicked.

### Read `covered`, not `clicked`

The selector list is a starter, not a standard, and this is why the return value carries a second
field. **`clicked: false` is ambiguous** — a page with no wall and an out-of-date selector list
produce exactly the same value.

| result | meaning |
| --- | --- |
| `clicked: true` | dismissed — a vendor container, frame or selector identified it |
| `ambiguous: true` | a consent-shaped control was found in a floating surface and **deliberately not pressed**. Stop and look |
| `clicked: false, ambiguous: false, covered: true` | **a wall is up and nothing matched it. Stop.** |
| `clicked: false, ambiguous: false, covered: false` | nothing this rig can see. **Not the same as "no wall"** |

### What this rig will and will not press

**It clicks only what identifies itself.** A caller-supplied selector, a vendor button id, or a
consent-named control inside a container or frame that names a consent product (`#coiOverlay`,
`#sp_message_container_*`, `#onetrust-consent-sdk`, and the rest of the list). That is identity.

**Everything else it reports and refuses.** A consent-shaped control in an unidentified floating
surface is `ambiguous`, and the capture template stops with a screenshot rather than filming past
it. This is not caution for its own sake: geometry and wording cannot distinguish a cookie banner
from an invitation, a change-of-terms dialog, or an application form, and pressing the wrong one
changes something real on a site you do not own. Eight rounds of adding thresholds and vocabulary
each traded one misclassification for another; the only version that never presses the wrong
button is the one that refuses to guess.

When you hit `ambiguous`, look at the screenshot and put the real selector in
`CONSENT_OPTIONS.extraSelectors`. That is the supported path, and it takes a minute.

**The last row is the honest one.** `ambiguous: false, covered: false` means this rig found
nothing — not that the page is clean. A wall it cannot see is exactly the wall it cannot tell you
about. On a target that matters, look at the first frame.

`pageIsCovered(page)` samples five points and asks what is actually on top; `dismissConsent` calls
it for you, and `consentStillPresent(page, CONSENT_OPTIONS)` runs the same scan again immediately
before the first beat, because a CMP that injects late would otherwise walk into the footage. This exists because the alternative was measured end to end: on a major news site the
accept button read "Einwilligen und weiter" (and, the next day, "Consent and continue") — neither
was in the name list. `dismissConsent` returned `clicked: false` in 206ms, and then **every
downstream check reported success against a full-screen cookie dialog**: the page stayed
scroll-locked so the scroll did nothing, and a rect measured 1673px down in an 833px viewport was
perfectly stationary and therefore perfectly `settled`. A fully "verified" beat of a cookie
banner.

Consent walls also vary by geography and A/B bucket. A name list verified once is not verified.

### The result says which rule decided

`pageIsCovered` returns a `reason` beside its verdict — `top-layer`, `modal-descendant`,
`translucent-backdrop`, `z-index` — because five independent rules can call something a wall and
"true" alone cannot tell a certainty from a threshold that happened to land.

The reason this is worth a field: a rule sitting one point away from not firing looks exactly like
one that fired confidently. A cookie banner on this pipeline was once detected only because an
`<h1>` occupied 5.16% of the viewport against a 5% threshold — on another platform's font metrics
it fell under, the banner was classified as the page itself, and nothing said so. Had the result
carried "decided by the sibling test, marginally", it would have been caught on the first run
rather than by a reviewer on a different operating system.

The same field makes the fixtures honest: each asserts the rule it was written for, so a test that
starts passing through a different rule fails instead of staying green while the rule it exists
for quietly stops working.

`scrollLocked` is a hint, not a verdict: some sites keep `body { overflow: hidden }` with no wall
at all. Use it to explain why a scroll went nowhere, not to decide whether a wall is up.

The same problem hits text extraction, not just video — reading a page for the plan while a
consent layer is up returns the banner as the page's content, and the resulting beat list is
about cookies.

## 1b. Fonts, before anything is measured

```js
const fonts = await waitForFonts(page);
if (!fonts.ready) console.warn(`fonts not ready (${fonts.reason})`);
```

Start recording one frame before the webfont swap and the take is in the fallback face. It
reproduces rarely, reads as "the wrong font is in the video", and is miserable to chase after the
fact. `waitForFonts` returns `{ ready, reason }` rather than throwing — a page whose fonts never
settle is still filmable — but it never succeeds silently, because a caller that cannot tell is a
caller that finds out in review.

## 2. Everything else on top of the page

Newsletter modals, support-chat bubbles, "open in our app" interstitials, sticky promo bars.
`hideOverlays(page)` hides a default list with CSS rather than clicking their close buttons —
those are the least standardised controls on the web, and a missed click leaves the thing in
the shot.

It returns `{ hidden, alreadyHidden, kept }`, and only elements that were **visible** count as
hidden — an earlier version counted every match, so hiding something already at `display: none`
reported a success it had not achieved. `keepSelectors` protects matching *elements*, not matching
selector strings: filtering the list by string equality left a protected element hidden as soon as
a second entry in the list also matched it.

**It is not a substitute for `dismissConsent`.** It hides known containers by selector; a platform
not on the list stays up, and `hidden: 0` means "nothing on my list was showing", never "the page
is clear". `pageIsCovered(page)` answers that question.

This changes how the site looks. That is usually what a demo wants, and it is always a choice
you should be able to defend; the defaults only cover widgets that are unambiguously not
content.

## 3. The sticky header eats your spotlight

`scrollIntoView({ block: 'center' })` knows nothing about fixed navigation. On a site with a
96px sticky header, a "centred" target sits 96px higher than you think, and a spotlight sized
from that rect frames the menu along with it.

```js
await scrollToElement(target);        // measures the insets itself, after scrolling
```

**Measure it, never hardcode it** — `stickyInsets(page)` looks for elements computed `fixed` or
`sticky`, spanning ≥60% of the width and under half the viewport tall. A constant survives exactly
until the site's next redesign.

**And measure it at the scroll position you will shoot from.** Plenty of sites shrink their header
after the first scroll: one measured **118px at the top of the page and 80px once scrolled**, so a
single measurement taken at load over-compensates every later beat by 38px. `scrollToElement`
re-measures on every call for exactly this reason — do not cache a value and pass it in.

`stickyInsets` reports `bottom` as well. Sticky **footers** (subscription bars, app promos) are
just as common and obscure the lower part of every frame; one covered 13% of the viewport and
nothing was measuring it.

`scrollToElement` also **proves the scroll happened** and throws if the target ended up
off-screen, under the header, or behind the footer. On a scroll-locked page `scrollIntoView` is a
silent no-op — that is half of how the cookie-banner beat in §1 got as far as it did.

This one is easy to not notice: centring puts most targets well clear of the header, so the bug
only appears once a target is taller than roughly (viewport − header). Both teams that hit this
had shipped video before finding it.

## 4. The measurement that was true when you took it

**This is the expensive one.** On a page you built, images have intrinsic sizes and the layout
after a scroll is the layout you measured. On a third-party page, lazy-loaded images below the
fold resolve *after* the scroll and push everything down. Measured on a real news site: a
spotlight **~430px off** its target, from a perfectly correct `getBoundingClientRect`.

A single `boundingBox()` cannot detect this. It returns a valid answer about a layout that is
about to change.

```js
const rect = await stableRect(target);   // samples on rAF until it holds still
```

`stableRect` requires the box **and** the effective opacity **and** the computed transform to hold
still for six consecutive frames, and refuses to call a transparent or off-screen element settled:

- **geometry alone is not enough.** A scroll-reveal library (AOS, ScrollTrigger,
  `animation-timeline`) fades and slides an element that is already at its final box. A purely
  geometric check reports "settled" while the shot still shows nothing.
- **the opacity must be read through the ancestor chain, not off the element.** This is the
  version that matters, and reading only the element is a near-useless check: every reveal
  library fades the *container*. Measured on a real page — target at `opacity: 1`, the card
  around it at 0.825 mid-transition. A freeze-frame there comes out milky.
- **a transform animation is the same trap from the other side.** It moves the element on
  screen without necessarily moving the rect you read.
- **an off-screen rect is refused too** (`inViewport`). A stationary element below the fold is
  the most settled thing on the page, and it is exactly what a scroll that silently failed
  produces.

`settled: false` is not something to fix with a longer timeout — it means something is still
animating. Freeze it or pick another target.

### Following vs proving

There are two correct answers here and which one you get depends on where the spotlight lives.

- **In-page choreography** (the scrim and spotlight are injected into the site, so the recorded
  video is already composed) can *follow*: re-read the element every frame and move the
  spotlight with it.
- **This pipeline composites afterwards** from a rect recorded in `beats.json`. There is
  nothing to follow with. The equivalent guarantee is `assertRectHeld(locator, rect)` after the
  dwell: prove the rect still described the element when the hold ended, and fail the beat now
  rather than in review.

The template runs `assertRectHeld` automatically on the public-site path.

## 5. Motion: kill it or keep it?

The obvious rule — "motion is nondeterministic, remove it" — is **wrong here**, and it took an
argument to see why.

A video of a news site that keeps the live stream *running* is making a point a still cannot
make. Motion is only noise relative to a check that treats it as noise. So the rule is
conditional on what the beat is for:

| the beat is… | do |
| --- | --- |
| freeze-framed (a still cut from a source time) | `freezeMotion(page, { media: true })` — a playing video no longer holds that frame at that time |
| verified by pixel diff | freeze it — motion is the variable you failed to isolate (pitfalls §1, §13) |
| *about* the motion — a live feed, a player, an animation that is the feature | leave it running |

`media` therefore defaults to **false**. Turning it on globally costs foreign-site videos the
thing that makes them look alive.

**Carousels are the exception with no trade-off.** A slider rotating every few seconds will
rotate inside your hold, so the frame you spotlighted and the frame on screen are different
pictures. There is no generic carousel detector worth shipping — look at the site once and pass
its selector: `freezeMotion(page, { pauseSelectors: ['.hero-slider'] })`.

`smoothScroll: true` is on by default, but its justification is narrower than it first looks —
this reference claimed something false and the correction is worth stating. Per CSSOM-View,
`behavior: 'instant'` scrolls instantly **regardless** of a site-set `scroll-behavior: smooth`, so
it does not rescue `scrollIntoView({ behavior: 'instant' })`, which never needed rescuing. What it
covers is every scroll that omits the option: `window.scrollBy(x, y)` and friends default to
`auto`, and `auto` **does** defer to the CSS property, leaving the page gliding while you measure.
Keep it on if you scroll by hand; `scrollToElement` passes `behavior: 'instant'` explicitly and
does not depend on it.

## 6. Finding the target when there are no test ids

There are no `data-testid`s and no stable class names. Target by the words on the page:

```js
const section = await findByText(page, /Preise ab/i);
```

Four design choices worth keeping if you write your own:

- **Return a Locator, not an ElementHandle.** An ElementHandle has no `.page()`, so it cannot be
  passed to `scrollToElement` — the documented recipe failed with `TypeError: locator.page is not
  a function` on every site it was tried on, which is how we learned the recipe had never been
  run. `findByText` tags the element with a `data-capture-target` attribute and addresses it
  through a normal locator.
- **Take the innermost match, not the first in document order.** With `div` and `section` in the
  tag list, first-in-document-order is *always* the outermost wrapper: in a four-site trial every
  single match resolved to a `div` — one of them 1104x347 containing six unrelated headlines —
  rather than to the heading whose words matched. A spotlight sized from that frames half the
  page. With innermost-wins, the same searches return `<h3>` and `<a>` elements.
- **Search the whole document, exclude the furniture structurally.** Scoping to `main` is what an
  app lets you do; a great many marketing sites have no `<main>`. `findByText` searches from
  `body` and skips `nav, header, footer, [role=navigation], [role=banner], [role=contentinfo]`
  and `[aria-hidden=true]` via `closest()`, plus obvious promo blocks — a site tour once framed a
  "Summer-Sale" house ad because it was simply the first block whose text matched. Note what is
  *not* used: "too wide, too tall, too much text" filters are a tendency, not a rule, and they
  fail on exactly the sites whose layout you did not anticipate.
- **Enforce a minimum size.** Skip-to-content links are real elements with real text at 1x1 and
  `opacity: 0`, and they sit first in the document, so they win every loose match.

Dismiss the consent wall *before* searching, or the layer's own text competes for the match.

⚠ **The tag does not survive a re-render.** A page that hydrates or re-lays-out after load —
common immediately after a consent click — replaces the node and takes the attribute with it.
Call `findByText` right before the beat that needs it, not once at the top of the script.
`scrollToElement` fails in 5s with that diagnosis rather than waiting out a 30s Playwright
timeout.

## 6b. The cursor is not part of a tour

`beat()` takes `cursor: 'parked' | 'on-target'`, and on the public-site path it parks by default.

A demo of your own app is *about operating controls*, so the injected arrow travelling to a button
is the point. A site tour is about showing things. Drive the cursor onto a heading and it lands on
the letters and stays there for the whole dwell — the spotlight then frames a paragraph with an
arrow sitting in it, which reads as a mistake because it is one. A reviewer filming a news site hit
exactly this and had to park the cursor by hand before every mark.

Pass `cursor: 'on-target'` for the beats that genuinely are about a control, even on a foreign
site. The motion a tour needs comes from the scroll, not from a pointer with nothing to point at.

## 7. What you do not do on someone else's site

- **No setup pass.** There is no "put the app in the story's starting state" — the state is
  whatever the site shows.
- **No restore pass.** Nothing to restore, because you wrote nothing (§0).
- **No `app-state.mjs`.** It snapshots and restores *your* app's records.
- **The AI/app helpers do not apply.** `waitIdle`, `waitSettled`, `approveTools`, `sendPrompt`
  and `PROGRESS_DEFAULT` are about an assistant UI you own. A public marketing page has no
  concept of "busy".

## 8. What is unchanged

Worth saying, because it is most of the skill:

- **Brand extraction already works on any website** — `extract-brand.mjs` reads palette, type
  stack and logo off a live page. Filming someone's site in their own brand needs nothing new.
- **The composition, the design system, the spotlights, the cards** are identical.
- **The verify layer** is identical, and is the main thing a capture-only pipeline lacks.
- **Voiceover** is identical.
- **The concept gate is identical**: `PLAN.md` before footage, no exceptions.

## 9. One rule that genuinely loosens

The skill says re-shooting a single beat into an existing cut is not an option. That is true of
**our** app and not of the medium — it follows from time-of-day greetings and relative
timestamps, which are properties of a particular product.

The honest version:

> Re-shoot a single beat only when the scene shares no state with its neighbours **and** the
> source renders stably between runs **and** no audio anchor crosses the scene boundary. On a
> demo of your own app, the first two are typically violated. On a self-contained section of a
> third-party page, they typically hold — and the third is what silently reintroduces the
> problem the moment you add narration, because a re-shot beat of a different length moves
> every following audio anchor.

If you support re-shooting, carry a per-scene state (`planned → captured → rendered`, plus
`stale` when a change invalidates an earlier capture). Without the `stale` flag you get a cut
assembled from beats shot against different versions of the plan, and nothing says so.

## 10. The unit of repair — and why it is not the unit you think

This pipeline captures **one continuous recording per run**: one `START_URL`, one webm, one
`beats.json` whose entries are source *times* inside it. That is a deliberate fit for an app you
navigate through — the session state carries from beat to beat, and there are no seams.

**On a site you do not own, that advantage largely evaporates.** Every scene starts from zero
anyway: consent has to be dismissed, the page has to load, the scroll position resets. The
continuity the one-run model buys you is continuity the target does not have.

So know the two costs before you plan a long take:

**A recording cannot be resumed.** If beat 6 fails, getting beat 6 means running again, and a
re-run re-records everything. The cost of a mid-take failure is the whole run's wall-clock, not
the missing beat's.

**The footage itself, though, is not lost — as long as the rig does not throw it away.** Phase 4
composes one file per beat and does not care that they came from one recording, so beats 1–5 are
usable clips. The capture template closes the context and writes `beats.json` in a salvage block
that runs whether or not a beat threw, precisely because `recordVideo` only finalises the webm
on close: an unclosed context loses every frame, including the good ones. If you write your own
rig, copy that shape first and the beats second.

Which leaves the question worth asking early, and it is not "how do I capture":

> **Whose unit is the repair?**

Here it is the **run**: something failed, you shoot the take again. A pipeline that captures
per scene can make it the **scene**: keep what landed, re-shoot only what did not. Neither is
wrong, but the failure mode is specific — *having per-scene artefacts and implementing
all-or-nothing on top of them.* A team running the per-scene model found exactly that in their
own job runner: one unresolvable host in scene 5 of 6 discarded five finished recordings,
because the granularity existed and nothing used it.

If you ever move this pipeline to a capture per beat, that is the design question to answer
first — what carries the ordering once every take has its own zero point, and what a partially
successful set means — not the mechanics of splitting the recording, which are the easy half.

And when you do, **invert the salvage.** Keeping the file is right here because it holds the
beats that already succeeded. A file that holds exactly one scene should be *discarded* on
failure: a half-recorded scene is a half clip, and letting it reach the cut is worse than losing
it. The mechanic is identical and the correct answer is opposite — it follows from what one file
contains, not from a preference for robustness. See `references/pitfalls.md` §27.

---

## Appendix — what the first real run found

None of the above is theory. The foreign-site path was written, reviewed, and then executed
against four live sites (a small marketing site, two news portals with different consent
platforms, one control) before anything here was trusted. Every defect it found is now a
paragraph above, and the ones worth naming as a class:

| what it looked like | what it was |
| --- | --- |
| the capture simply never returned | a lazy iframe with no execution context; the locator query neither resolved nor rejected |
| `clicked: false` | a full-screen consent wall whose button label was not in the list |
| `settled: true`, `y: 1673` in an 833px viewport | a scroll that never happened, on a page locked by that wall |
| `opacity: 1` | the element, inside a container at 0.825 |
| the documented recipe | had never been run: it threw `TypeError` on the first line |

Three of those five report success. That is the point of the section, and the reason the
functions now return `covered`, `inViewport` and `{ hidden, alreadyHidden, kept }` instead of a
bare boolean: **on a page you do not control, the useful question is not "did it work" but "how would
I know if it hadn't".**

**These cases are now fixtures, not anecdotes.** `scripts/test-foreign-sites.mjs` reproduces each
one against local `file://` pages — no network, no live site — and it earns its keep: it caught a
false positive in the coverage check on its first run, where an ordinary `position: fixed;
inset: 0` app shell was reported as a consent wall and would have aborted a valid capture. Run it
after touching `capture-lib.js`. A live smoke run is worth doing and is not a substitute: it
cannot tell you that yesterday's behaviour still holds.

Two caveats on the run itself. The consent results are a snapshot — the same site served a German
button label one day and an English one the next, so the name lists age. And the ~430px lazy-load
drift in §4 could not be reproduced on demand; it comes from another team's measurement and is
kept because the mechanism is sound, not because this run saw it.
