# Capture it yourself (Playwright) — the preferred source for a web app

When the subject is **a web app you can reach**, don't ask for a screencast: drive it and
record it. The recording is better *and* the edit gets radically cheaper, because the script
that causes the actions also **logs them**.

| | hand screencast | scripted capture |
| --- | --- | --- |
| where the timeline comes from | reverse-engineered from pixels (contact sheets, 1s then 0.1s scans) | `beats.json`, logged as the script causes each action |
| retries / false starts | present; you must find and cut every one | none — impossible by construction |
| spotlight coords | measured by PIL against the source, error-prone | `boundingBox()`, exact |
| browser chrome / desktop / green line | must be measured and cropped | **does not exist** — the capture IS the viewport |
| privacy (tabs, URLs, other windows) | must be reviewed and cropped/blurred | nothing but the app is ever in frame |
| text size | whatever the recorder's display gave you (often 1x — see below) | you choose it |
| re-runnable when the UI changes | no — a human must re-record | yes — re-run the script |

**Setup:** scaffold the HyperFrames project *first*
(`node "$HYPERFRAMES_CLI" init videos/<name> --non-interactive --example=blank`) and work from inside it —
the rig belongs at `<project>/capture/`, and `out/` resolves against wherever you run `node`,
so scaffolding afterwards means moving both. Then
`bash <skill>/scripts/setup-capture-env.sh ./capture`, copy `scripts/capture-template.js` to
`capture/capture.js`, and fill in the beats.

---

## 1. Getting a 2x recording (this is not obvious and cost real time)

**`recordVideo` and CDP `Page.startScreencast` both IGNORE the context's `deviceScaleFactor`.**
Measured on a 1254x653 viewport @ `deviceScaleFactor: 2`:

- `recordVideo: { size: 2508x1306 }` → the page is drawn **1254x653 at 1x in the top-left**
  and the rest of the canvas is **grey padding**. `size` sets the canvas, not the render scale.
- CDP `startScreencast` (no cap) → **1254x653** frames, and it only emits on visual change,
  so it isn't a fixed-rate source either.
- `page.screenshot()` DOES honour `deviceScaleFactor` — useful as a reference, not as video.

**The fix: a REAL device scale factor via a launch flag.**

```js
chromium.launch({ args: ['--force-device-scale-factor=2', '--high-dpi-support=1'] })
browser.newContext({ viewport: {width:1600, height:833},            // CSS layout
                     recordVideo: { dir, size: {width:3200, height:1666} } })   // 2x surface
```

`scripts/capture-lib.js` → `openRecorder()` does this for you.

> **Do NOT use the `zoom: 2` trick.** Setting `document.documentElement.style.zoom = 2` on a
> full-resolution viewport *does* produce a true 2x recording (verified), but it **breaks every
> JS-positioned overlay**: Radix (and anything using `getBoundingClientRect` for placement)
> measures in unzoomed px while CSS positions are in zoomed px, so a select panel gets parked
> outside the viewport and `click()` times out with `element is outside of the viewport`.
> The launch flag has no such cost. `zoom` is kept in lib.js only as a documented dead end.

**Verify the DPR, don't assume it.** `assets/dpr-fixture.html` paints 0.5-CSS-px stripes,
resolvable *only* at 2x. Record it and measure the stripe band's stddev:
true 2x ≈ **126**, 1x ≈ **0** (flat). A dimension check is not a DPR check — a 1x render
padded or upscaled into a 2508-wide canvas still *reads* 2508 wide.

## 2. Pick the viewport width deliberately — it is a real trade-off

Narrower CSS viewport = bigger text in the finished frame, but a taller layout that can clip.

- Measure it: load the target at several widths (keep `w/h` == your window aspect) and check
  whether the tallest thing you must show still fits `innerHeight`.
- Worked example: at **1254 CSS** the connectors page's Built-in group ran to `y=817` in a
  653-tall viewport — **clipped**. **1600 CSS** fit it (817 < 833) and still gave ~1.5x the
  text of the hand screencast. 1600/833 = 1.9208, matching the design's window aspect.

**Choose the width so the asset's aspect == the design's window aspect** (`design-system.md`),
then `object-fit:cover` neither letterboxes nor distorts, and **no crop is needed at all**.

## 3. The cursor is never in a capture — inject it

The pointer is an OS artifact; it appears in **no** Playwright video or screenshot. CSS
`:hover` still fires, so hover states render correctly — only the arrow is missing. This
reliably surprises people mid-edit.

`installCursor(page)` injects a DOM arrow that tracks `page.mouse`. **Verify it by pixel-diff,
not by `getBoundingClientRect`:** screenshot with and without the cursor and diff — the bbox of
the difference IS the arrow, and its top-left should equal your target coords. (An earlier
version placed it 2x off-screen and `getBoundingClientRect` reported a plausible-looking
number anyway.)

## 4. The pointer must GLIDE, not teleport

`page.mouse.move(x, y, { steps: 26 })` looks like it animates. **It does not.** It dispatches
all 26 events as fast as it can with no delay, so the whole move can land inside a single
recorded frame and read as a teleport. Motion has to be paced in **wall-clock time** to exist
on film at all.

`glide()` in `capture-lib.js` does it properly:
- **easeInOutQuad**, so it accelerates away and settles onto the target like a hand, rather
  than sliding linearly like a robot;
- **~1 position per recorded frame** (25fps → a step every ~40ms);
- **time-budgeted** — it sleeps only the *slack*. Blindly `waitForTimeout`-ing per step stacks
  the delay on top of the CDP round-trip: a nominal 0.9s glide took **4.4s** that way, and the
  whole capture bloated from 28s to 40s.
- Distance-aware: `dur = clamp(700 * sqrt(dist/900), 360, 1400)`, so a long hop takes a bit
  longer instead of just moving faster.

Costs to know: a bare `page.mouse.move` is ~20ms locally but **~78ms on a real app** (it
re-renders on every mousemove), so you get roughly one position per 1-2 frames from the
round-trip alone. Don't add more steps hoping for smoothness — you'll only get a sluggish
cursor.

**Verify it by looking.** Tile ~6 *consecutive* frames (1/25s apart) from mid-glide and read
them: the cursor should appear at 6 distinct, decelerating positions. Do not trust a
frame-diff bbox — the app's own animations (carets, shimmers, hover repaints) dominate it, and
three different "clever" detectors each reported a confident, wrong answer before one tiled
crop settled it in a single read.

## 4b. Route the cursor AROUND menus — and stay inside the UI

A trigger often sits **below** the menu it opens, so a straight glide from the trigger to the
item you want drags the pointer through every row in between — opening their submenus, which
then linger on screen for over a second.

*Measured:* gliding from one app's `+` up to "Add files or photos" crossed the "Skills" row and
popped its submenu open for ~1.5s, during a step whose card said "Attach a document".

Route around it with waypoints, and **pick the side that keeps the pointer over UI**:

```js
const lane = menu.x + menu.width + 40;      // a lane clear of the menu, still INSIDE the composer
await glide(page, { x: lane, y: menu.y + menu.height + 14 });   // step aside, below the menu
await glide(page, { x: lane, y: rowY });                        // rise beside it
await glide(page, { x: item.x + item.width * 0.62, y: rowY });   // enter the row from the side
```

Going around the *other* side put the cursor on blank page background for ~1.5s and read as the
pointer getting lost — a reviewer flagged it immediately. Verify by measuring the submenu's
region across the whole clip: it should never exceed its empty-state content ratio.

## 5. Auth — the one thing that is NOT automatable

If the app needs a login, **the human signs in; never the agent.** Entering credentials is off
limits regardless of convenience.

```
APP_ORIGIN=https://your.app APP_PROTECTED_PATH=/some/route bun run auth
```

Opens a headed browser, waits for a **verified** session, saves `storageState.json` (cookies
only, gitignored). Then every capture runs headless with `storageState`.

> **The wait condition must require YOUR app's origin, not merely "not /login".** An OAuth
> redirect (`login.microsoftonline.com`) satisfies "not /login" instantly and will save an
> anonymous session before the human has typed anything. `capture-auth.js` additionally
> *verifies functionally* — it loads a protected route in a throwaway tab and only saves if
> that route stays put.

**A logged-in session is not the same as a usable one.** Expect first-run gates (org pickers,
onboarding wizards) that render *instead of* every route while returning the right URL. Check
`role=dialog` count and whether the real markup exists underneath before assuming it's a
dismissible modal. If a gate needs a **write** to pass (creating an org/workspace), stop and
ask — but read it first: the one that looked like "create an Organization" was actually
"pick an organization you already belong to", and the caution was misplaced.

**After passing any gate, RE-SAVE storageState.** Gate completion lives partly in client
state, so a storageState saved at login predates it and every fresh context meets the wizard
again — a probe run walked straight back into "Sprache wählen" and reported an empty app.
Verify a protected route renders the *real* UI (composer/textarea present, no wizard
heading), then `await ctx.storageState({ path: STATE })` again from that context.

## 6. Setup/restore: driving a real app writes to it

Put the app in the story's starting state in a **separate, non-recording context**, and restore
it afterwards. Both belong in the capture script so the run is idempotent.

**Probe the app's state model before scripting it.** Controls that look idempotent often are
not. Worked example, from a connector-permissions screen: clicking a per-tool permission that
*differs* from the connector default **creates a persistent override with no reset control**;
the only way to clear it is to click the value that **matches** the default. Setting tools
before the default therefore pinned every tool and silently broke the "the default propagates"
beat — the demo still recorded, it just taught the wrong thing.

Rules that generalise:
- Establish the parent/global value **first**, then reconcile children to it.
- After setup, **prove the clean slate by exercising it** (flip the parent, confirm the
  children follow) rather than trusting that the UI looks right.
- Restore to the state you **found**, and say so in the output. Record what that state was
  *before* you touch anything.
- **Probes must be read-only in fact, not intent.** Don't click a create-affordance to see
  what it does — one "New workspace" button created a document instantly, no dialog, and two
  probe clicks left two stray "Untitled" rows in the rail for the rest of the shoot. Hover and
  read the DOM instead; if a probe does create something, log it the moment it happens:
  `node app-state.mjs record <id> [title]`.
- **Verify persistent POSTCONDITIONS after any AI/async write, not the success message.**
  An AI "save to workspace" flow ended with "Dokument gespeichert" while persisting only
  chat artifacts — the workspace tree stayed empty, and the three beats that depended on it
  (browse, upload, review) were shot against nothing and re-shot. In the dry run, check the
  state later beats need: the tree shows the folders, the doc opens, the file renders.

## 7. From capture to cut

The webm is VFR-ish (~25fps). Make a CFR master exactly as with a screencast:

```bash
ffmpeg -y -i out/<name>/<name>.webm -r 30 -c:v libx264 -crf 15 -preset medium \
  -pix_fmt yuv420p -an assets/master.mp4        # NO crop — it is already the viewport
```

Then cut each beat from `beats.json` times (`ffmpeg-recipes.md`). One cheap sanity check
first: the webm starts recording at context/page creation, while the beat clock starts when
`timeline()` is constructed a moment later — so before cutting everything, extract the frame
at one landmark mark's time and confirm the UI state matches; if there's a constant offset,
apply it to every beat. Spotlight coords come from the logged rects with one scale factor —
no PIL, no eyeballing:

```
scrim_xy = css_rect * DPR * (WIN.w / asset_w)
# e.g. css * 2 * (1701/3200) = css * 1.063125
```

Beats you must remember to log: not just the element you click, but every **group** you'll want
to spotlight (a whole section, an open menu panel, a table incl. its header) — `boundingBox()`
on the group container, not the label inside it.

## 8. What is still NOT autonomous

Be straight about these rather than pretending:

1. **Login.** Always a human. One `bun run auth` per session.
2. **Authorising writes.** Driving a real app mutates it. Say what will change and get a yes.
3. **Editorial judgement.** *What* to teach, and in what order, is the one thing a hand
   screencast gives you for free — it encodes the author's model of their own product.
   Ask for the beat list (or confirm your inventory) before capturing.
4. **Selectors.** Resolve against the live DOM. Guessing from footage strings gets the
   accessible names wrong (`View ClickUp details` exists; `View Web details` does not — the
   built-in rows are stretched links: `a[href="/path/to/thing"]`).

## 9. Re-capturing in another language (localised UI)

Re-shooting an existing demo with the app set to a different language is mostly the same run,
with four traps:

1. **Accessible-name selectors break.** `getByRole('button', { name: 'New chat' })` finds
   nothing once the UI is in another language. Switch the app first (Settings → Language, or the
   account preference — it may already be set), then **probe the localised DOM** and re-resolve
   every name in the flow: the composer's controls, the row actions, the file-add control, every
   menu item you click. Prefer language-agnostic anchors where they exist — icon classes,
   `data-slot`, `a[href^="/chats/"]` — and fall back to names only for the rest.
2. **Some strings stay English.** Product nouns and third-party names often aren't localised,
   and inconsistently so: one app kept its "Skills" pill in English while translating the label
   right next to it. Don't translate a selector on faith — read it off the DOM.
3. **Async server-side titling is slower than a fast cut.** An app that auto-titles a record a
   few seconds after the fact will leave an "Untitled" row atop every later beat when a tightened
   re-cut reaches the sidebar before the title lands. Poll the sidebar's top row until it stops
   reading "Untitled" — in whatever the UI's language is — with a timeout, **after the first
   prompt and before any beat that shows the sidebar**.
4. **Localised text is wider.** Menus and tooltips run longer in most languages than in English,
   so the logged rects shift (a "+" menu 258px vs 181px; a model tooltip ~1.4× wider). Re-derive
   every spotlight rect from the **new** `beats.json` — never reuse the old composition's spot
   coords — and remember the tooltip-vs-button rule (`design-system.md` → "Include the actual
   button").
5. **Cleanup and waiting are localised too, and the defaults are English.** `capture-lib.js`'s
   `PROGRESS_DEFAULT`, `BUSY_DEFAULT` and `APPROVAL_DEFAULT`, and `app-state.mjs`'s row-menu
   matchers, all match accessible NAMES — they are your app's words, not a standard. Pass your
   own (`waitSettled(page, { progress })`, `waitIdle(page, { busy })`) and set
   `APP_ROW_MENU` / `APP_DELETE` / `APP_CONFIRM` for the restore step. **A pattern that matches
   nothing fails silently in the worst direction:** the wait returns immediately and reads as
   "the agent finished", and `restore` reports nothing to delete while the app is still dirty.
6. **The language is a per-CONTEXT fact, not a per-app one.** It lives in a server-side user
   preference plus whatever the storage state carries, so *any* browser context you open
   outside the main capture run starts in the app's default language. Setting up a second
   account for one guide, the invite-acceptance page came up entirely in English while the rest
   of the shoot was localised — the selector found nothing, and the obvious reading was a wrong
   selector rather than a wrong locale. Applies to setup scripts, probes, a second
   account, and anything run before `storageState.json` exists. Either walk that context through
   the language step first, or match bilingually in setup code (`/Activate account|<the
   localised name>/i`) and save the state only once the locale is right.

## 9b. Shared helpers — use them, don't re-invent them

`capture-lib.js` ships four interaction helpers because each capture script that re-invented
them shipped a defect:

- **`typeInto(page, loc, text)`** — types and VERIFIES the readback. A silent mis-type is a
  wrong recording that surfaces minutes later as a confused AI answer.
- **`setTitle(page, loc, text)`** — contenteditable titles. Ctrl+A alone does not reliably
  select there: a plain type() after it *prepended*, so the field read "<new><old>" and the
  assistant couldn't find the record by name. Triple-click + verify + one retry.
- **`waitSettled(page, {…})`** — min-elapsed + min-length + no-progress-marker + N stable
  polls. A hand-rolled wait returned early once and recorded a progress line as the
  final answer; the beat was re-shot.
- **`focusOn(page, /regex/)`** — scrollIntoView + exact rect for content the assistant just
  produced. The measured alternative to guessing a rect as a percentage of `<main>` — two
  such guesses produced the sliced-text spotlights.

## 10. Re-timing an existing composition (don't rebuild the timeline)

When you re-capture a demo that already has a tuned `index.html`, keep the timeline and just
re-point the assets. Build each clip to the **exact `data-duration` it already has**
(`frames = data-duration × 30`); change only the *source start* and *speed* (`r`) to fit the new
take's action into that window, and keep each freeze still pinned to its clip's end
(`start + frames/r`) so the hard cuts stay frame-identical. The timeline (`data-start`s,
card/spot timings, GSAP calls) never moves, so the only edits are the asset-build script, the
spotlight rects (§9.4), the caption copy, and the palette — far less error-prone than
regenerating the timeline for a take whose natural beat lengths differ only slightly. (Watch for
a **stale build script**: if a prior hand-tuned pass renamed or re-cut assets, the checked-in
`build-*.sh` may not reproduce the current `index.html` — trust the `data-duration`s, not the
old script.)

## 11. Committing a field: blur it, never Tab

Text inputs in this app commit on **blur**, so a rename typed and left focused is silently
lost. The obvious fix — press `Tab` — is wrong: it moves focus to the *next* control, and if
that control has a tooltip you have just put the tooltip in the shot. Measured: every
document rename ended with the access badge focused and its explanatory tooltip hanging over
the frame. A reviewer flagged it immediately.

```js
await typeInto(page, titleField(), text, { clear: true, delay: 55 });
await titleField().evaluate((el) => el.blur());     // commits, focus goes nowhere
```

Then **park the pointer somewhere inert** before the beat settles, or the last thing you
hovered keeps its hover state for the rest of the shot.

### 11b. `fill()` does not satisfy a controlled form — type into it, then blur

`locator.fill()` sets the value in one shot. React Hook Form / TanStack Form validate on the
events a *human* produces, so the field looks filled while the form still considers itself
untouched and **the submit button stays disabled** — which reads like a broken selector and
sends you hunting in the wrong place. Setting up a second account for one guide lost three
rounds to exactly this.

```js
await field.click();
await field.pressSequentially(value, { delay: 25 });
await field.blur();
```

And when a form rejects a value, **read the schema instead of guessing**: that same setup then
failed on an invisible `MINIMUM_PASSWORD_LENGTH = 12` in a shared validators package. One grep beats
three attempts. A disabled submit is a *validation* result — find the rule, don't retry.

## 12. Hover-revealed controls are not stable — jiggle, then click by coordinate

Row actions (delete, add-child) mount from React hover state, and the tree re-renders while
the capture is creating documents. So:

- a rect measured once goes stale, and
- `waitFor({state:'visible'})` can pass and the control can be gone a moment later, because
  nothing moved the mouse in between.

Both happened. The reliable shape is: nudge the pointer over the row until the control is
BOTH visible and measurable, then click the measured point rather than re-resolving a
locator that can vanish mid-click:

```js
async function revealRowAction(row, actionName) {
  const action = row.getByRole('button', { name: actionName }).first();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rowBox = await rectOf(row);
    await page.mouse.move(rowBox.x + rowBox.width * 0.45,
                          rowBox.y + rowBox.height / 2 + (attempt % 2 ? 0.5 : -0.5));
    await hold(450);
    if (await action.isVisible().catch(() => false)) {
      const box = await action.boundingBox().catch(() => null);
      if (box) return { action, rect: box };
    }
  }
  throw new Error(`row action "${actionName}" never stayed visible`);
}
…
await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
```

**And cut the freeze BEFORE the click, not on it.** The row drops its hover state ~0.1s
*ahead* of the click event you logged, so a still cut at `del_click` shows a row with no icon
on it — under a card that says "the symbol in the row". Measured on the source: icon present
at 79.65, gone by 79.75, click logged at 79.79. Use `at('x_click') - 0.15` for any
hover-revealed control, and verify by cropping the still.

## 13. `mark()` after a dwell is not when the state changed

Restating §7 because it cost a beat again in a later build: `await hold(7000); tl.mark('file_done')`
records a time seven seconds *after* the upload finished. Deriving a clip length from that
mark pulled ~6s of dead screen into the cut, which `freezedetect` then flagged. Either mark
before the dwell, or treat such a mark as "some time after" and cut to the action plus a
short settle instead.

## 14. `networkidle` never fires against a Vite dev server

HMR and realtime sockets stay open, so `waitUntil: 'networkidle'` times out on every
navigation — including inside the skill's own `app-state.mjs`. Use
`waitUntil: 'domcontentloaded'` plus an explicit wait for a control you need.

## 15. The session expires, and the wizard is client state

Two separate gates, and both return a plausible-looking page:

- `storageState.json` goes stale between sessions — re-run the auth step.
- The onboarding wizard lives partly in client state, so every fresh context meets it again
  even though the account completed it days ago. Walk it and **re-save storageState** from
  the context that passed it. Its organisation step is a **pick** ("Wähle eine Organisation"),
  not a create — selecting the existing org is not a write.

  **The symptom is misleading.** The selected organisation is kept in `localStorage`, not in
  the session, so a fresh headless context has none and the wizard covers **every route** —
  `/marketplace`, `/chats`, everything — with *"Sprache wählen"*. It reads as a wiped database
  or a broken login, and I went digging through Postgres before noticing the org and the data
  were both fine. Automate the walk in the auth script (language → theme → **pick the org**)
  and only then save the state; check the result by loading a real route and asserting on a
  control, not on the URL.

Verify the saved session against the REAL UI (a control that only exists when the app is
actually working), not against the URL — a broken backend still serves the shell at the right
path. `capture-auth.js` checks for a control that only renders when the app is live, for
exactly this reason — pick that control for your own app.

## 16. 🚨 Freeze on the HOVER mark, never on the click mark

The single most expensive mistake in the Skills build — two full re-captures.

`markClick()` is written after `locator.click()` **returns**, so the timestamp is already
*after* the real click, and an SPA has re-rendered in between. Cutting the still "just before"
that mark is not early enough:

| beat | still cut at `click - 0.12` showed | should have shown |
| --- | --- | --- |
| open a page | the **navigated** page, spotlight framing empty space | the link being clicked |
| open a dialog | the dialog mid-crossfade — a double-exposed frame | the button that opens it |
| save | a button already reading *"Wird gespeichert…"* | *"Änderungen speichern"* |

The `_hover` mark sits a settled ~700ms earlier and is always the affordance itself. So log
both and use them for different things:

```
<name>_hover   -> cut the freeze still AND measure the spotlight from this
<name>_click   -> the click-pulse coordinate only
```

`action()` in `capture-template.js` does this for you; `timeline().markClick()` carries the
same warning. The check is cheap: crop the still and read it. If the card says "click X" and
the still no longer contains X, you have this bug.

## 17. "Has the agent finished?" — ask the UI, not the text

Diffing `main`'s innerText is the obvious idle check and it is wrong. The text holds still
between tool steps while the run is very much alive, so the check reports *finished*, the next
scripted message goes into a **busy composer, and is swallowed with no error**. In the Skills
build that beat ended on the agent's question instead of on the saved skill, and nothing in the
log said anything had gone wrong — it took reading the chat afterwards to find it.

The composer's send button is usually the app's own answer: it reads **"Stop" while working**
and "Send" when idle. `waitIdle()` / `sendPrompt()` in `capture-lib.js` use it, and `sendPrompt()`
additionally reads the field back before pressing Enter. Both matchers are English by default and
are meant to be overridden per app and locale — see §9.5.

Give idle a generous stability window (`stablePolls: 6`, ~9s). Between two tool steps the
button flips back to "Send" for a couple of seconds, and a short window reads that as done.

## 18. Tool-permission prompts are a step, and they arrive late

Any tool set to *needs confirmation* stops the run with an **allow / deny** prompt. Two things
make it easy to miss:

- **It arrives AFTER an apparent idle.** The agent writes its draft file first, the button
  flips to "Send" for a few seconds, and only then does the approval appear. So do not gate
  the wait on idle — watch for the button over a fixed window (`approveTools()`).
- **The accessible name carries the keyboard hint.** It is `"Allow\n↵"`, so
  `getByRole('button', { name: /^Allow$/ })` matches **nothing** and fails silently. Match
  loosely. (Worth a habit: when a selector finds 0 elements, print the real accessible names
  before assuming the control is absent.)

Keep the approval in the cut — a guide that shows the agent asking before it writes is telling
the truth about the product, and it is a natural freeze beat.

## 19. Verify the postcondition in the DATABASE, not in the transcript

§10's rule again, sharpened by the same build: the agent wrote *"Der Skill wurde erstellt"* in
the chat while the approval was still pending and nothing had been saved. The chat is the
agent's intent; the record is the fact. After any capture whose beats create something, check
the thing exists — one query, or one page load of the list it should appear in.
