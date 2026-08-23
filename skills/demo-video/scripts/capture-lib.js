// Shared capture primitives for the capture rig.
import { chromium } from 'playwright';

// The capture surface, and the CSS layout that fills it at 2x.
//
// Width is a genuine trade-off: narrower = bigger text, but a taller layout that clips.
//   1254 CSS -> 1.9x the density of a 1x hand screencast, but the connectors page's
//               Built-in group runs to y=817 and the viewport is only 653 tall. Clipped.
//   1600 CSS -> Built-in group fits (817 < 833), still ~1.6x that density. Chosen.
// 1600/833 == 1.9208, matching the composition's window aspect, so `cover` neither
// letterboxes nor distorts.
export const CSS = { width: 1600, height: 833 };
export const DEVICE = { width: 3200, height: 1666 };
export const ZOOM = 2;   // legacy dead end, kept only as documentation. Do NOT use — zooming
                         // breaks JS-positioned overlays (Radix computes rects in unzoomed px
                         // and parks the select panel outside the viewport). Use the REAL
                         // device-scale-factor route in openRecorder() below.

/** A cursor is an OS artifact and never appears in a capture — inject a DOM one.
 *  Drawn in ZOOMED css px so it tracks page.mouse coords 1:1 on the device surface. */
const CURSOR_CSS = `
  #__cur { position:fixed; top:0; left:0; width:11px; height:17px; z-index:2147483647;
    pointer-events:none; will-change:transform; transform:translate(-9999px,-9999px);
    background:no-repeat center/contain url('data:image/svg+xml;utf8,\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 11 17">\
<path d="M0 0v14.2l3.6-3.5 2.1 5.1 2.4-1-2.2-5h4.4z" fill="%23fff" stroke="%23000" stroke-width="1.1" stroke-linejoin="round"/>\
</svg>'); }`;

/** Block until webfonts have swapped in.
 *
 *  Without this you occasionally start recording (or take a screenshot) on the frame BEFORE the
 *  font swap, and the finished video is in the fallback face. It reproduces rarely and reads as
 *  "the wrong font is in the video", which is a miserable thing to chase after the fact.
 *
 *  It matters most where the fonts are least predictable: a container that lacks the brand face
 *  entirely, and any third-party site whose faces load late. See references/container-capture.md. */
export async function waitForFonts(page, { timeoutMs = 5000 } = {}) {
  const outcome = await settleWithin(page.evaluate(() => document.fonts.ready.then(() => true)), timeoutMs);
  // Reported, not thrown: a page whose fonts never settle is still filmable, and a hard failure
  // here would cost more captures than it saves. But the caller has to be able to find out —
  // silently succeeding on timeout is how you record fallback faces and learn about it in review.
  return { ready: outcome.status === 'ok', reason: outcome.status };
}

export async function installCursor(page) {
  await page.addStyleTag({ content: CURSOR_CSS });
  await page.evaluate(() => {
    const c = document.createElement('div');
    c.id = '__cur';
    document.documentElement.appendChild(c);
    // Under html{zoom:z}, Chromium reports clientX/Y in UNZOOMED (device) px, while the
    // cursor's own transform is interpreted in zoomed CSS px. So divide by z exactly once.
    // (Verified by pixel-locating the drawn arrow — an earlier `* z` here put it 2x off-screen.)
    const z = parseFloat(document.documentElement.style.zoom || '1');
    window.__moveCur = (x, y) => { c.style.transform = `translate(${x / z}px, ${y / z}px)`; };
    document.addEventListener('mousemove', (e) => window.__moveCur(e.clientX, e.clientY), true);
  });
}

/** Launch a recording context at a REAL 2x device scale factor via launch flags.
 *  (recordVideo ignores the context's `deviceScaleFactor` option, and the `zoom` trick
 *  breaks JS-positioned overlays — see ZOOM above and playwright-capture.md §1.)
 *
 *  WATCH=1 -> headed + slowed + on-page HUD + trace, so a human can supervise every action.
 *  Watch mode uses a screen-sized viewport (the 2508x1306 capture surface does not fit on a
 *  laptop) — so use it to SUPERVISE, and capture for real with WATCH unset.
 */
export async function openRecorder({ dir, storageState, watch = false, slowMo = 0, trace = false,
  untrusted = false } = {}) {
  const browser = await chromium.launch({
    headless: !watch,
    slowMo: watch ? (slowMo || 550) : 0,
    // 🚨 Playwright documents `chromiumSandbox` as **defaulting to false** — it disables the
    // browser's own sandbox unless you ask for it. Running the container as `pwuser` with a
    // seccomp profile is necessary and does nothing on its own while this stays off: the
    // renderer that parses a stranger's page would still have no process isolation. Pass
    // `untrusted: true` for any page you do not control. It requires a container that allows
    // user namespaces (see references/container-capture.md); on a host that forbids them the
    // launch fails loudly, which is the correct outcome — filming hostile pages unsandboxed
    // should be a decision, not a default.
    chromiumSandbox: untrusted,
    // REAL device scale factor. recordVideo ignores the per-context `deviceScaleFactor`
    // option, but it does honour the browser's actual DPR — so a 1254x653 CSS viewport
    // renders into a genuine 2508x1306 surface. Verified: 0.5-CSS-px stripes resolve
    // (sd=123.55) in the recorded webm. No zoom, so Radix/popover geometry stays correct.
    args: watch ? ['--window-size=1400,940'] : ['--force-device-scale-factor=2', '--high-dpi-support=1'],
  });
  const size = watch ? { width: 1330, height: 860 } : DEVICE;
  const ctx = await browser.newContext({
    viewport: watch ? { width: 1330, height: 860 } : CSS,
    ...(dir ? { recordVideo: { dir, size } } : {}),
    ...(storageState ? { storageState } : {}),
  });
  if (trace) await ctx.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await ctx.newPage();
  return { browser, ctx, page, watch };
}

/** On-page HUD so you can read what I am about to do, live, in the window itself.
 *  Watch-mode only — it must never appear in real capture footage. */
export async function installHUD(page) {
  await page.addStyleTag({ content: `
    #__hud { position:fixed; left:0; right:0; bottom:0; z-index:2147483646; pointer-events:none;
      font:600 14px/1.45 -apple-system,system-ui,sans-serif; color:#14130f;
      background:rgba(251,250,247,.97); border-top:2px solid #e4ff4f;
      padding:10px 16px; box-shadow:0 -8px 28px rgba(0,0,0,.14); }
    #__hud b { background:#e4ff4f; padding:1px 7px; border-radius:4px; margin-right:9px; }
    #__hud i { font-style:normal; color:#5a574f; }` }).catch(() => {});
  await page.evaluate(() => {
    if (document.getElementById('__hud')) return;
    const h = document.createElement('div');
    h.id = '__hud';
    h.innerHTML = '<b>watch</b><i>ready</i>';
    document.documentElement.appendChild(h);
    window.__say = (step, text) => {
      const el = document.getElementById('__hud');
      if (el) el.innerHTML = `<b>${step}</b><i>${text}</i>`;
    };
  }).catch(() => {});
}

/** Narrate a step to both the terminal and the on-page HUD. */
export async function say(page, step, text) {
  console.log(`  [${step}] ${text}`);
  await page.evaluate(([s, t]) => window.__say && window.__say(s, t), [step, text]).catch(() => {});
}

/** Timeline log — the script IS the edit decision list. No timeline archaeology, ever. */
export function timeline() {
  const t0 = Date.now();
  const beats = [];
  let markCounter = 0;
  return {
    mark(name, extra = {}) {
      const time = (Date.now() - t0) / 1000;
      // The id is what makes a rollback exact. Dropping by NAME removes the first match, so two
      // beats sharing a name means a failure in the second deletes the first — a verified beat
      // silently replaced by the one that failed verification.
      // `extra` is spread FIRST: spreading it last lets a caller's payload overwrite `id`, and
      // `drop()` then removes whichever entry happens to share the forged value.
      const beat = { ...extra, id: ++markCounter, t: +time.toFixed(3), name };
      beats.push(beat);
      return beat;
    },
    /** Log a click with its exact point, so the edit can ring a pulse there.
     *
     *  🚨 This mark is NOT the frame to freeze on. It is written after `locator.click()`
     *  RETURNS, so the real click is already earlier — and an SPA re-renders in between. A
     *  still cut 0.12s "before" this mark showed the page after navigation: the spotlight
     *  framed empty space, a dialog was caught mid-crossfade as a double exposure, and a
     *  save button already read "Wird gespeichert…" under a card pointing at
     *  "Änderungen speichern". Cut every freeze from the matching `_hover` mark instead —
     *  see `action()` in the template and playwright-capture.md §16. */
    markClick(name, rect) {
      return this.mark(name, {
        click: {
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
        },
        rect,
      });
    },
    /** Remove a beat that turned out to be invalid.
     *
     *  `mark()` writes the beat when the dwell STARTS, because that is when its source time is
     *  known — but a beat is only usable if it still described the element when the dwell ENDED
     *  (`assertRectHeld`). Without this, a beat whose verification threw is already in the list,
     *  and a salvage path that writes the list on failure hands the composition the exact rect
     *  the assertion had just rejected. */
    drop(beat) {
      const id = typeof beat === 'object' && beat !== null ? beat.id : beat;
      const index = beats.findIndex((candidate) => candidate.id === id);
      if (index !== -1) beats.splice(index, 1);
      return index !== -1;
    },
    get beats() { return beats; },
  };
}

// ── interaction helpers ────────────────────────────────────────────────────
// These exist because each capture script re-invented them and one of the re-inventions
// shipped a defect. Use them instead of raw type/waitForTimeout loops.

/** Type into an input/textarea/contenteditable and VERIFY it landed. A silent mis-type is a
 *  wrong recording that surfaces minutes later as a confused AI answer. */
export async function typeInto(page, locator, text, { delay = 30, clear = false } = {}) {
  await locator.click(clear ? { clickCount: 3 } : {});
  if (clear) await page.keyboard.press('ControlOrMeta+a').catch(() => {});
  await page.keyboard.type(text, { delay });
  const got = (await locator.evaluate((el) => (el.value ?? el.innerText ?? '').trim()).catch(() => ''));
  const probe = text.slice(0, Math.min(24, text.length));
  if (!got.includes(probe)) throw new Error(`typeInto: element reads "${got.slice(0, 60)}" — expected it to contain "${probe}"`);
  return got;
}

/** Replace a contenteditable title and VERIFY the readback. Ctrl+A alone does NOT reliably
 *  select in a contenteditable — a plain type() after it PREPENDED, so the field ended up
 *  reading "<new title><old title>" and later steps could not find the record by name.
 *  Triple-click + select-all, type, read back, one retry, then fail loudly. */
export async function setTitle(page, locator, text, { delay = 45 } = {}) {
  for (let attempt = 0; ; attempt++) {
    await locator.click({ clickCount: 3 });
    await page.keyboard.press('ControlOrMeta+a').catch(() => {});
    await page.keyboard.type(text, { delay });
    await page.waitForTimeout(400);
    const got = (await locator.evaluate((el) => (el.value ?? el.innerText ?? '').trim()).catch(() => ''));
    if (got === text) return true;
    if (attempt >= 1) throw new Error(`setTitle: wanted "${text}", element reads "${got.slice(0, 60)}"`);
  }
}

/** Progress strings that mean "the assistant is still working".
 *  ENGLISH ONLY BY DESIGN — these are your app's words, not a standard. Pass your own via
 *  `waitSettled(page, { progress })`, and if you capture a localised UI it must list the
 *  localised strings too: a pattern that matches nothing makes the wait return immediately,
 *  which reads as "the agent finished" and cuts the beat mid-run. */
export const PROGRESS_DEFAULT = /Thinking|Working|Running|Starting sandbox|Fetching|Loading|Analysing|Analyzing/i;

// ── is the app busy? ───────────────────────────────────────────────────────
// TEXT IS THE WRONG SIGNAL, and this cost two full re-captures.
//
// Diffing `main`'s innerText declares a run finished whenever the visible text happens to
// hold still — which it does between tool steps, while the agent is very much still working.
// The next scripted message then went into a composer that was still busy and was swallowed
// with no error at all: the beat ended on the agent's question instead of on the saved skill,
// and nothing in the log said so.
//
// A composer's own send button is usually the app's answer to "am I busy": it reads "Stop"
// for the whole run and "Send" when idle. Ask the UI, don't infer from prose.

/** The control that means "still working". Override per app — and per locale, since this
 *  matches an accessible NAME. */
export const BUSY_DEFAULT = (page) =>
  page.getByRole('button', { name: /^Stop$/i }).first();

/** A tool-permission prompt waiting for a click. Override per app and locale.
 *  NOTE the loose match, and keep it loose in your own: an accessible name often carries the
 *  keyboard hint, so the real name is "Allow\n↵" and an anchored /^Allow$/ matches NOTHING.
 *  That silently skipped the approval for a whole capture — the action was never performed and
 *  the beat had no ending. */
export const APPROVAL_DEFAULT = (page) =>
  page.getByRole('button', { name: /Allow/i }).first();

const isVisible = (locator) => locator.isVisible().catch(() => false);

/** Wait until the app is idle. Returns elapsed seconds, or null on timeout.
 *  `stablePolls` is deliberately generous: between two tool steps the button flips back to
 *  "Send" for a couple of seconds, and a short window reads that as finished. */
export async function waitIdle(page, { maxMs = 300000, stablePolls = 6, pollMs = 1500,
  busy = BUSY_DEFAULT } = {}) {
  const t0 = Date.now();
  let idle = 0;
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(pollMs);
    if (await isVisible(busy(page))) { idle = 0; continue; }
    if (++idle >= stablePolls) return +(((Date.now() - t0) / 1000).toFixed(1));
  }
  return null;
}

/** Click every tool-permission prompt that appears within `windowMs`.
 *
 *  Do NOT gate this on idle. The agent writes its draft file first, and BETWEEN tool steps
 *  the app looks finished for a few seconds — an idle check walks straight past the approval
 *  that arrives moments later. Watch for the button over a fixed window instead.
 *  Returns how many prompts were approved. */
export async function approveTools(page, { windowMs = 240000, max = 3, pollMs = 1500,
  approval = APPROVAL_DEFAULT, onApprove } = {}) {
  const deadline = Date.now() + windowMs;
  let approved = 0;
  while (Date.now() < deadline && approved < max) {
    await page.waitForTimeout(pollMs);
    const button = approval(page);
    if (!(await isVisible(button))) continue;
    if (onApprove) await onApprove(button, approved);
    else await button.click();
    approved += 1;
    await page.waitForTimeout(2500);
    await waitIdle(page, { maxMs: 180000 });
  }
  return approved;
}

/** Send one scripted line into an IDLE composer and wait for the reply.
 *  Verifies the readback: typing into a busy composer loses the text silently. */
export async function sendPrompt(page, locator, text, { idleMs = 300000 } = {}) {
  await waitIdle(page, { maxMs: idleMs });
  await locator.click();
  await page.keyboard.insertText(text);
  await page.waitForTimeout(900);
  const got = await locator.inputValue().catch(() => '');
  const probe = text.slice(0, Math.min(24, text.length));
  if (!got.includes(probe)) {
    throw new Error(`sendPrompt: composer reads "${got.slice(0, 60)}" — the line did not land`);
  }
  await page.keyboard.press('Enter');
}

/** Wait until an async/AI answer SETTLES: the app reports itself idle AND the text has held
 *  still for N polls. The idle check is the load-bearing half — the text check alone returned
 *  early mid-tool-call (see the block above), and an earlier re-invention of it recorded
 *  a progress line like "Starting sandbox…" as the final answer.
 *  Returns elapsed seconds, or null on timeout (caller decides if that's fatal). */
export async function waitSettled(page, { maxMs = 180000, minMs = 12000, minLength = 400,
  stablePolls = 4, pollMs = 1500, progress = PROGRESS_DEFAULT, scope = 'main',
  busy = BUSY_DEFAULT } = {}) {
  const t0 = Date.now();
  let last = '', stable = 0;
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(pollMs);
    if (busy && await isVisible(busy(page))) { stable = 0; continue; }
    const txt = await page.evaluate((sel) => document.querySelector(sel)?.innerText || '', scope);
    const norm = txt.replace(/\b(gerade eben|vor \d+\s*\w+|just now|\d+\s*[smhd])\b/gi, '~');
    if (Date.now() - t0 >= minMs && !progress.test(txt) && norm === last && norm.length > minLength) {
      if (++stable >= stablePolls) return +(((Date.now() - t0) / 1000).toFixed(1));
    } else { stable = 0; last = norm; }
  }
  return null;
}

/** Scroll a text match into view and return its (or its following table's) exact rect —
 *  the measured way to get a spotlight rect for content the assistant just produced.
 *  NEVER estimate such rects as percentages of <main>: two percentage-guessed spotlights
 *  both landed their edges mid-text and each cost a revision round. */
export async function focusOn(page, re, { takeNextTable = false, block = 'center' } = {}) {
  const args = [re.source, re.flags, takeNextTable, block];
  const found = await page.evaluate(([src, flags, nextTable, blk]) => {
    const rx = new RegExp(src, flags);
    const els = [...document.querySelectorAll('main h1,main h2,main h3,main h4,main p,main strong,main td,main div')];
    const hit = els.find((e) => rx.test(e.innerText || '') && (e.innerText || '').length < 400);
    if (!hit) return null;
    let target = hit;
    if (nextTable) {
      let n = hit, t = null;
      for (let i = 0; i < 8 && n; i++) { n = n.nextElementSibling; if (!n) break;
        t = n.matches('table') ? n : n.querySelector?.('table'); if (t) break; }
      if (t) target = t;
    }
    target.scrollIntoView({ block: blk, behavior: 'instant' });
    return true;
  }, args);
  if (!found) return null;
  await page.waitForTimeout(900);
  return await page.evaluate(([src, flags, nextTable]) => {
    const rx = new RegExp(src, flags);
    const els = [...document.querySelectorAll('main h1,main h2,main h3,main h4,main p,main strong,main td,main div')];
    const hit = els.find((e) => rx.test(e.innerText || '') && (e.innerText || '').length < 400);
    if (!hit) return null;
    let target = hit;
    if (nextTable) {
      let n = hit, t = null;
      for (let i = 0; i < 8 && n; i++) { n = n.nextElementSibling; if (!n) break;
        t = n.matches('table') ? n : n.querySelector?.('table'); if (t) break; }
      if (t) target = t;
    }
    const b = target.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
  }, args);
}

// ── pointer ────────────────────────────────────────────────────────────────
let pointer = { x: 0, y: 0 };

/** Jump the pointer without animating (e.g. parking it off to one side before recording). */
export async function park(page, x, y) {
  await page.mouse.move(x, y);
  pointer = { x, y };
}

/**
 * Glide the pointer to a target over real time.
 *
 * `page.mouse.move(x, y, { steps })` is NOT this: it dispatches all `steps` events as fast as
 * it can, with no delay, so the entire move can land inside a single recorded frame and read
 * as a teleport. The recorder samples ~25fps — motion has to be paced in wall-clock time to
 * exist on film at all.
 *
 * So: interpolate on a ~60Hz clock with easeInOutQuad, which also reads as a human hand
 * (accelerate away, settle onto the target) rather than a linear robot slide.
 * Verify with `measureGlide()` — max per-frame travel should stay well under ~120px.
 */
export async function glide(page, target, { duration = 700, maxSteps = 30 } = {}) {
  const to = ('width' in target)
    ? { x: target.x + target.width / 2, y: target.y + target.height / 2 }
    : target;
  const from = { ...pointer };
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (dist < 2) { pointer = to; return to; }

  // Long hops take a little longer, so speed stays plausible instead of scaling with distance.
  const dur = Math.min(1400, Math.max(360, duration * Math.sqrt(dist / 900)));
  // ~1 position per recorded frame (25fps => 40ms), capped: each mouse.move already costs
  // 20-80ms on a real app (it re-renders on mousemove), so more steps only make it sluggish.
  const n = Math.max(6, Math.min(maxSteps, Math.round(dur / 40)));

  // Budget the time: sleep only the SLACK. Blindly sleeping per step stacks the delay on top
  // of the round-trip and made a 0.9s glide take 4.4s.
  const t0 = Date.now();
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // easeInOutQuad
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    const slack = (dur * i) / n - (Date.now() - t0);
    if (slack > 4) await page.waitForTimeout(slack);
  }
  pointer = to;
  return to;
}

// ── filming a site you do NOT own ───────────────────────────────────────────
// Everything above assumes the friendly case: your own app, a login you control, a DOM you
// can change if it fights you. A third-party website gives you none of that, and four of its
// properties break the primitives above outright. These helpers are the difference between
// "works on our staging" and "works on any URL".
//
// Run them in this order, right after `page.goto` and before `installCursor`:
//
//   await waitForFonts(page);
//   const consent = await dismissConsent(page);   // INSPECT the result — see below
//   await hideOverlays(page);        // newsletter modal, chat bubble, sticky app banner
//   await freezeMotion(page, { pauseSelectors: ['.the-sites-carousel'] });
//
// and measure every rect with `stableRect()` instead of `locator.boundingBox()`, and scroll
// with `scrollToElement()` rather than `scrollIntoView`.

/** Give any promise a real deadline.
 *
 *  Not decoration. `frame.locator(...).isVisible()` against an iframe that Chromium has not
 *  loaded yet (`<iframe loading="lazy">` below the fold) NEVER SETTLES — it neither resolves nor
 *  rejects, so `.catch()` cannot save you and the whole capture hangs with no error. Measured on
 *  a news site: three lazy widget frames, `frame.evaluate(() => 1+1)` still pending after 15s,
 *  the consent scan still running after 120s. Every cross-frame call below is wrapped. */
function settleWithin(promise, timeoutMs) {
  let timer;
  const TIMED_OUT = Symbol('timeout');
  return Promise.race([
    Promise.resolve(promise).then(
      (value) => ({ status: 'ok', value }),
      (error) => ({ status: 'error', error }),
    ),
    new Promise((resolve) => { timer = setTimeout(() => resolve({ status: 'timeout', TIMED_OUT }), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
}

/** Convenience wrapper for probes that only care "did it say yes". Keeps the three outcomes
 *  distinguishable at the call site via `settleWithin` when they matter — a click that timed out
 *  and a click that succeeded must never collapse into the same value. */
async function withDeadline(promise, timeoutMs, fallback) {
  const outcome = await settleWithin(promise, timeoutMs);
  return outcome.status === 'ok' ? outcome.value : fallback;
}

/** Known consent platforms, most specific first. Ids beat text: they survive localisation,
 *  and a text match on a page you have never seen is a guess.
 *
 *  This list is a STARTER, not a standard. Consent walls are an arms race and the long tail
 *  is endless — which is why `dismissConsent` also reports whether the page is STILL COVERED
 *  after it gives up. A stale selector and a page with no consent wall produce the same
 *  `clicked: false`, and only the coverage check tells them apart. */
const CONSENT_BUTTONS = {
  reject: [
    '#onetrust-reject-all-handler',
    '#CybotCookiebotDialogBodyButtonDecline',
    '[data-testid="uc-deny-all-button"]',
    '#didomi-notice-disagree-button',
    '.cm-btn-decline',
    '#tarteaucitronAllDenied2',
  ],
  accept: [
    '#onetrust-accept-btn-handler',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept',
    '[data-testid="uc-accept-all-button"]',
    '#didomi-notice-agree-button',
    '.cm-btn-success',
    '#BorlabsCookieBoxWrapper ._brlbs-btn-accept-all',
    '.qc-cmp2-summary-buttons button[mode="primary"]',
    '#tarteaucitronPersonalize2',
  ],
};

/** Containers that identify a consent PRODUCT. A button's own markup is often generic while the
 *  surface it sits in is not: Cookie Information wraps everything in `#coiOverlay`, Sourcepoint in
 *  `#sp_message_container_<id>`. A consent-named control inside one of these is identified by the
 *  same evidence a vendor button id gives — the vendor, not a guess about geometry. Without this,
 *  three of four real sites tested fall back to the generic path, and the generic path no longer
 *  clicks anything. */
const CONSENT_CONTAINERS = [
  '#onetrust-consent-sdk', '#CybotCookiebotDialog', '#usercentrics-root', '#didomi-host',
  '.qc-cmp2-container', '#tarteaucitronRoot', '#BorlabsCookieBox', '#cmpwrapper', '#cmpbox',
  '[id^="sp_message_container"]', '#coiOverlay', '#cookiescript_injected', '.cc-window',
  '[class*="cookie-consent" i]', '[id*="cookie-banner" i]',
];

/** Frames that belong to a consent platform, by the frame element's own id or by the host it
 *  loads from. Sourcepoint names its iframe `sp_message_iframe_<id>`; the CMP hosts below are the
 *  ones a consent iframe is actually served from. */
const CONSENT_FRAME_IDS = /^sp_message_iframe|^cmp|consent/i;
const CONSENT_FRAME_HOSTS = /(^|\.)(consensu\.org|privacy-mgmt\.com|cookiebot\.com|onetrust\.com|usercentrics\.eu|didomi\.io|cookieinformation\.com|sourcepoint\.[a-z]+)$/i;

/** Selectors that describe a SHAPE rather than a vendor, and are therefore only safe while a wall
 *  is demonstrably up — same reasoning as the accessible-name fallback. `button[title*="Accept"]`
 *  is a consent button on a consent wall and an "Accept invitation" on a social network;
 *  `button[aria-label*="reject"]` could decline an application. Vendor ids above identify a
 *  specific product and stay unconditional. */
const CONSENT_SHAPES = {
  reject: [
    'button[aria-label*="reject" i]',
    'button[aria-label*="ablehnen" i]',
  ],
  accept: [
    'button[title*="Accept" i]',
    'button[title*="Consent and continue" i]',
    'button[aria-label*="accept all" i]',
    'button[aria-label*="alle akzeptieren" i]',
  ],
};

/** Accessible-name fallback. Add your target's language before filming it — a pattern that
 *  matches nothing fails SILENTLY, which looks exactly like "this site has no consent wall".
 *
 *  `einwilligen` is here because a real German news site labels its only accept button
 *  "Einwilligen und weiter": the list was missing it, the wall stayed up, and every later step
 *  reported success against a full-screen cookie dialog. */
const CONSENT_NAMES = {
  reject: /^(alles? )?(ablehnen|verweigern|nur (technisch )?notwendige|reject( all)?|decline|necessary only|only essential)/i,
  accept: /^(alle[sn]? )?(akzeptieren|zustimmen|einwilligen und weiter|einwilligen|einverstanden|annehmen|erlauben|accept( all)?|allow all|agree|i agree|consent (and|&) continue|got it|verstanden)/i,
};

// `consent (and|&) continue` is spelled out rather than a bare `consent`, which would also match
// "Consent settings" and "Consent preferences" — buttons that open a second layer instead of
// dismissing the wall. Both spellings are here because the SAME site served "Einwilligen und
// weiter" one day and "Consent and continue" the next: consent walls vary by geo and A/B bucket,
// so a name list verified once is not verified.

/** Every place a consent button can hide: the page itself, plus every iframe that actually has
 *  a document. Sourcepoint, Quantcast and many OneTrust deployments render the wall INSIDE an
 *  iframe, where `page.click` cannot see it — verified on two sites. A frame whose `url()` is
 *  empty has not loaded and must be skipped, not queried (see `withDeadline`). */
function consentSearchRoots(page) {
  const frames = page.frames().filter((frame) => {
    if (frame === page.mainFrame()) return false;
    const url = frame.url();
    return Boolean(url) && url !== 'about:blank';
  });
  return [page, ...frames];
}

/** One combined query per frame instead of one per selector.
 *
 *  Probing ~15 vendor selectors against every frame costs a `count()` plus a visibility check
 *  each, and against a slow or cross-origin frame each of those runs to its full timeout — which
 *  spent the entire consent budget before the branch that actually works was ever reached, on a
 *  site the previous version dismissed in 1.5s. A comma-joined locator answers "is ANY of these
 *  here" in one round trip, and only then is it worth asking which. */
async function anyPresent(root, selectors, timeoutMs) {
  const combined = selectors.join(', ');
  return (await withDeadline(root.locator(combined).count(), timeoutMs, 0)) > 0;
}

/** Click and say honestly whether it landed. A click that times out, hits a detached node or is
 *  intercepted must not be reported as a dismissal. */
async function clickReliably(button) {
  const outcome = await settleWithin(button.click({ timeout: 2000 }), 2500);
  return outcome.status === 'ok';
}

/**
 * Does this element live inside a floating layer rather than in the page's own flow?
 *
 * This is the right gate for a generic consent control, and page-wide coverage is not. The most
 * common consent wall in Europe is a fixed BANNER across the bottom of the viewport at 20-30%
 * height: it hits at most two of five sample points, so a coverage test calls the page clear, the
 * generic branches never run, and the banner is filmed. What actually distinguishes a consent
 * button from an ordinary "Agree" in the page body is that it sits in a fixed or sticky container
 * with a stacking context of its own.
 */
// ONE overlay predicate, evaluated in whichever document the element lives in.
//
// It exists as a single plain function precisely because keeping "the same" test in two places
// failed six times in a row: the parent-frame copy silently lost the page-surface check while the
// in-document copy kept it. Playwright serialises this function into either context, so there is
// nothing left to keep in sync. It must not reference anything outside itself.
function isOverlayElement(element) {
  // Page furniture is never an overlay, however it is positioned. A sticky site header is fixed,
  // full-width, and has `<main>` as a sibling — geometry alone says "floating layer" and a header
  // control then becomes clickable on a stranger's site.
  const FURNITURE = 'nav, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"]';

  // Nothing substantial beside it means it IS the document, not a layer over it. An application
  // whose whole UI is one fixed full-viewport element — including one that is an iframe — is the
  // page, and its buttons are app controls.
  const isPageSurface = (node) => {
    let current = node;
    for (let depth = 0; current && current !== document.body && depth < 12; depth++) {
      const parent = current.parentElement;
      if (!parent) break;
      for (const sibling of parent.children) {
        if (sibling === current) continue;
        const tag = sibling.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'NOSCRIPT') continue;
        const box = sibling.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        if (getComputedStyle(sibling).visibility === 'hidden') continue;
        const substantial = (sibling.innerText || '').trim().length >= 20
          || box.width * box.height >= window.innerWidth * window.innerHeight * 0.05;
        if (substantial) return false;
      }
      current = parent;
    }
    return true;
  };

  // Floating is not the same as INTERRUPTING. But a fixed viewport-share threshold is the wrong
  // way to say so: OneTrust ships half-width and third-width floating cards, and a full-screen
  // wrapper with `pointer-events: none` around a small panel fails a centre hit-test entirely.
  // So sample the CANDIDATE's own position rather than the container's midpoint, and accept a
  // modest but real footprint.
  const interrupts = (node, origin) => {
    const box = node.getBoundingClientRect();
    if (box.width * box.height < window.innerWidth * window.innerHeight * 0.02) return false;
    const originBox = origin.getBoundingClientRect();
    const samples = [
      [originBox.left + originBox.width / 2, originBox.top + originBox.height / 2],
      [box.left + box.width / 2, box.top + box.height / 2],
    ];
    for (const [x, y] of samples) {
      const onTop = document.elementFromPoint(
        Math.min(window.innerWidth - 1, Math.max(0, x)),
        Math.min(window.innerHeight - 1, Math.max(0, y)),
      );
      if (onTop && (onTop === node || node.contains(onTop))) return true;
    }
    return false;
  };

  // The page's own surface covers the page. A strip along one edge does not, whatever else is on
  // the document — so the sibling test is only asked of something big enough for its answer to
  // mean anything.
  //
  // This gate is not tidiness. Without it, a 25%-tall cookie banner was classified by whether any
  // sibling counted as "substantial", and on the regression fixture the only qualifying sibling
  // was an `<h1>` at 5.16% of the viewport — 0.16 points over the threshold. On macOS, where
  // default heading metrics differ slightly, it falls under: no substantial sibling, the banner is
  // declared to be the page itself, and a real cookie banner gets filmed. A reviewer running the
  // suite there saw exactly that while it passed on Linux. Detection must not rest on how tall a
  // heading happens to render.
  const PAGE_SURFACE_MINIMUM = 0.8;
  const couldBeTheWholePage = (node) => {
    const box = node.getBoundingClientRect();
    return box.width * box.height >= window.innerWidth * window.innerHeight * PAGE_SURFACE_MINIMUM;
  };

  let current = element;
  for (let depth = 0; current && depth < 12; depth++) {
    const style = getComputedStyle(current);
    // `fixed` or `sticky` only — `absolute` is how every ordinary in-flow embed is positioned.
    if (style.position === 'fixed' || style.position === 'sticky') {
      const isTheDocument = couldBeTheWholePage(current) && isPageSurface(current);
      if (!current.closest(FURNITURE) && !isTheDocument && interrupts(current, element)) {
        return true;
      }
    }
    current = current.parentElement
      || (current.getRootNode() instanceof ShadowRoot ? current.getRootNode().host : null);
  }
  return false;
}

/**
 * Is this control part of a consent surface rather than part of the page?
 *
 * Bounded by `deadline`: the evaluations below run in whatever frame the candidate lives in, and
 * this file's own opening paragraph documents that a query against an unhealthy frame never
 * settles. An unbounded predicate here would defeat the very budget it is called from.
 */
export async function isInsideOverlay(locator, frame = null, deadline = Infinity) {
  const budget = () => Math.max(250, Math.min(3000, deadline - Date.now()));

  const inDocument = await withDeadline(locator.evaluate(isOverlayElement), budget(), false);
  if (inDocument) return true;
  if (!frame || typeof frame.frameElement !== 'function') return false;

  // 🚨 The test above runs INSIDE the candidate's own document, which is the wrong frame for a
  // consent platform. Sourcepoint, Quantcast and many OneTrust deployments render the wall in a
  // dedicated iframe, where the consent UI legitimately IS the whole document — no siblings, so
  // the structural check calls it "the page's own surface" and vetoes the click. Two real news
  // sites stopped being dismissable this way. Ask the parent instead — with the SAME predicate,
  // which is why it is a shared function rather than a second copy that drifts.
  const frameElement = await withDeadline(frame.frameElement(), Math.min(1500, budget()), null);
  if (!frameElement) return false;
  return await withDeadline(frameElement.evaluate(isOverlayElement), budget(), false);
}

/**
 * Is something still parked on top of the whole page?
 *
 * This is the check that turns a silent failure into a loud one. `clicked: false` on its own is
 * ambiguous — it means "no button matched", which is what BOTH a wall-free page and an
 * out-of-date selector list look like. Sampling what is actually on top settles it.
 *
 * Returns `{ covered, blocker, scrollLocked }`. `scrollLocked` is a hint, NOT proof: consent
 * platforms do pin `body { overflow: hidden }` while their dialog is up, but so do sites that
 * scroll an inner container by design — one measured `scrollLocked: true` with no wall present
 * at all, and another kept the lock after its wall was dismissed. Treat `covered` as the verdict
 * and `scrollLocked` as the explanation for why a later scroll went nowhere.
 */
export async function pageIsCovered(page) {
  return await page.evaluate(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const points = [
      [width / 2, height / 2], [width * 0.1, height * 0.1], [width * 0.9, height * 0.1],
      [width * 0.1, height * 0.9], [width * 0.9, height * 0.9],
    ];
    const describe = (element) => element.id
      ? `#${element.id}`
      : `${element.tagName.toLowerCase()}${element.className && typeof element.className === 'string'
        ? '.' + element.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;

    // Covering the viewport is not enough to be a blocker. A single-page app's shell is
    // routinely `position: fixed; inset: 0` with its own scroller — it IS the page, and treating
    // it as a wall aborts a perfectly good capture. What separates the two is intent, and intent
    // shows up as a stacking context nobody uses for ordinary layout, or as an explicit modal
    // role. Consent platforms measured in the wild: z-index 2147483647 and 9999. App shells:
    // `auto`.
    // A z-index cut-off alone trades one error for the other: it stops calling an app shell a
    // wall, and starts missing native `<dialog>` modals (top layer, `z-index: auto`) and the
    // many wrappers that sit at 100-999. So ask several independent questions, and treat the
    // element as a blocker if ANY says "this was put here to interrupt you".
    const MODAL_Z_INDEX = 1000;
    const isModalPrimitive = (element) => {
      try { if (element.matches(':modal')) return true; } catch { /* older engines */ }
      // `open` alone is NOT modality: `show()` opens a non-modal dialog that blocks nothing, and
      // treating a large one as a wall aborts captures of legitimate fixed panels. `:modal` is
      // the real test; engines without it fall through to the other signals.
      if (element.getAttribute('aria-modal') === 'true') return true;
      const role = element.getAttribute('role');
      return role === 'dialog' || role === 'alertdialog';
    };
    const hasTranslucentBackdrop = (element) => {
      const match = getComputedStyle(element).backgroundColor.match(/^rgba?\(([^)]+)\)$/);
      if (!match) return false;
      const parts = match[1].split(',').map((part) => parseFloat(part));
      const alpha = parts.length > 3 ? parts[3] : 1;
      // A dimming backdrop, not an opaque page surface and not a fully transparent wrapper.
      return alpha > 0.05 && alpha < 0.95;
    };
    // The page's own scroller. An application root is routinely fixed, full-viewport, translucent
    // and at a high z-index — every property a consent backdrop has — so appearance cannot tell
    // them apart. Behaviour can: a shell SCROLLS ITS OWN CONTENT, and a wall exists to stop you
    // reaching content. This is checked before the appearance signals and after the definitive
    // ones, so a modal that happens to scroll is still a modal.
    const isOwnScroller = (element) => {
      const overflowY = getComputedStyle(element).overflowY;
      if (overflowY !== 'auto' && overflowY !== 'scroll') return false;
      if (element.scrollHeight <= element.clientHeight + 8) return false;
      // Scrollability alone is NOT enough, and assuming it was made every scrollable wall
      // invisible to this check — a Bootstrap `.modal` is a full-viewport element with
      // `overflow-y: auto` by design.
      //
      // Structural, not proportional. Measuring the share of text the candidate holds fails on a
      // long privacy wall over a short article, which holds most of the words and is still a
      // wall. Ask instead whether anything substantial remains BESIDE it: the document's own
      // surface has no such siblings, a layer on top leaves the article underneath.
      let current = element;
      for (let depth = 0; current && current !== document.body && depth < 12; depth++) {
        const parent = current.parentElement;
        if (!parent) break;
        for (const sibling of parent.children) {
          if (sibling === current) continue;
          const tag = sibling.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'NOSCRIPT') continue;
          const box = sibling.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          if (getComputedStyle(sibling).visibility === 'hidden') continue;
          const substantial = (sibling.innerText || '').trim().length >= 20
            || box.width * box.height >= window.innerWidth * window.innerHeight * 0.05;
          if (substantial) return false;
        }
        current = parent;
      }
      return true;
    };

    // Returns WHICH rule fired, not just that one did. Five independent signals can call
    // something a wall, and a result that only says "true" cannot tell a top-layer modal from a
    // z-index guess that happened to land — so a rule one point away from not firing looks exactly
    // like a certainty. Reporting the path is the cheapest protection against the next threshold
    // that silently flips on another machine: it shows up in the output instead of in a
    // reviewer's screenshot.
    const looksDeliberate = (element) => {
      if (isModalPrimitive(element)) return 'modal-primitive';
      // A backdrop often carries no role while its dialog CHILD does, and the child is too small
      // to pass the coverage test on its own.
      // `dialog[open]` is deliberately absent here: `show()` opens a NON-modal dialog that blocks
      // nothing. `:modal` covers the modal case and is handled by isModalPrimitive above.
      if (element.querySelector('[aria-modal="true"], [role="dialog"], [role="alertdialog"]')) return 'modal-descendant';
      if (isOwnScroller(element)) return null;
      if (hasTranslucentBackdrop(element)) return 'translucent-backdrop';
      let current = element;
      for (let depth = 0; current && depth < 6; depth++) {
        const zIndex = parseInt(getComputedStyle(current).zIndex, 10);
        if (Number.isFinite(zIndex) && zIndex >= MODAL_Z_INDEX) return 'z-index';
        if (isModalPrimitive(current)) return 'modal-primitive-ancestor';
        current = current.parentElement;
      }
      return null;
    };

    const blockerAt = (x, y) => {
      let element = document.elementFromPoint(x, y);
      while (element && element !== document.body && element !== document.documentElement) {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const coversMost = box.width >= width * 0.8 && box.height >= height * 0.7;
        if ((style.position === 'fixed' || style.position === 'absolute') && coversMost
          && looksDeliberate(element)) return { element, reason: looksDeliberate(element) };
        element = element.parentElement;
      }
      return null;
    };

    // A top-layer modal blocks the whole page through its `::backdrop`, which is not an element
    // and has no box of its own — so an ordinary centred `showModal()` dialog covers everything
    // while being 320px wide. Sampling element boxes can never see it; ask the engine instead.
    let topLayer = null;
    for (const candidate of document.querySelectorAll('dialog, [popover]')) {
      let modalSupported = true;
      try { if (candidate.matches(':modal')) { topLayer = candidate; break; } } catch { modalSupported = false; }
      // The fallback runs ONLY where `:modal` threw, i.e. the engine does not know the selector.
      // Running it everywhere reinstated the bug it was meant to avoid: a wide fixed dialog opened
      // with the non-modal `show()` was reported as page coverage.
      if (!modalSupported && candidate.tagName === 'DIALOG' && candidate.hasAttribute('open')
        && getComputedStyle(candidate).position === 'fixed'
        && candidate.getBoundingClientRect().width >= window.innerWidth * 0.5) {
        topLayer = candidate; break;
      }
    }

    const hits = new Map();
    const reasons = new Map();
    for (const [x, y] of points) {
      const hit = blockerAt(x, y);
      if (!hit) continue;
      hits.set(hit.element, (hits.get(hit.element) || 0) + 1);
      reasons.set(hit.element, hit.reason);
    }
    let covered = topLayer;
    let reason = topLayer ? 'top-layer' : null;
    for (const [element, count] of hits) {
      if (count >= 4) { covered = element; reason = reasons.get(element); }
    }

    const scrollLocked = getComputedStyle(document.body).overflow === 'hidden'
      || getComputedStyle(document.documentElement).overflow === 'hidden';

    // `reason` names the RULE that fired, `blocker` names the element. Both, because "which
    // element" and "on what grounds" fail independently.
    return { covered: Boolean(covered), blocker: covered ? describe(covered) : null, reason, scrollLocked };
  });
}

/** Does ANY plausible consent control on this page sit inside a floating layer?
 *
 *  The cheap precondition for the generic branches: if nothing that looks like a consent button
 *  lives in a fixed or sticky container, there is nothing here worth pressing generically. */
/** The first candidate that is visible AND satisfies a predicate — the only scanner in the
 *  consent path, because two of them kept drifting apart.
 *
 *  Three failures it has to carry at once, each of which shipped on its own:
 *
 *  - `.first()` before the visibility test throws away the real button whenever a hidden
 *    duplicate sorts earlier. Consent platforms ship desktop and mobile variants of the same
 *    markup, so duplicates are the norm rather than an edge case.
 *  - Stopping at the first VISIBLE match is not enough either: an ordinary in-flow "Agree"
 *    earlier in the document is visible, fails the predicate, and the real floating button after
 *    it is never examined — so the banner looks absent to the gate and to the late check.
 *  - Stopping after a fixed number of candidates has the same effect, one page further along. The
 *    bound here is the DEADLINE, which is the bound the caller was actually promised. */
async function firstMatching(candidates, timeoutMs, deadline, predicate) {
  const total = await withDeadline(candidates.count(), timeoutMs, 0);
  for (let index = 0; index < total; index++) {
    if (Date.now() >= deadline) return null;
    const candidate = candidates.nth(index);
    if (!await withDeadline(candidate.isVisible(), timeoutMs, false)) continue;
    if (await predicate(candidate)) return candidate;
  }
  return null;
}

/** Is this candidate inside a container or a frame that identifies a consent PRODUCT? */
async function hasVendorIdentity(button, root, deadline) {
  const budget = () => Math.max(0, Math.min(1500, deadline - Date.now()));
  if (budget() === 0) return false;
  const inContainer = await withDeadline(
    button.evaluate((element, selectors) => selectors.some((selector) => element.closest(selector)),
      CONSENT_CONTAINERS), budget(), false);
  if (inContainer) return true;
  if (!root || typeof root.frameElement !== 'function') return false;
  if (CONSENT_FRAME_HOSTS.test(new URL(root.url(), 'https://x.invalid').hostname)) return true;
  const frameElement = await withDeadline(root.frameElement(), budget(), null);
  if (!frameElement) return false;
  // The `id` ONLY. Folding the `title` in meant any iframe whose title happened to contain
  // "consent" was promoted to vendor identity — a label anyone can write, granting the one
  // permission this library reserves for things that identify a product.
  const frameId = await withDeadline(
    frameElement.evaluate((element) => element.id || ''), budget(), '');
  return CONSENT_FRAME_IDS.test(frameId.trim());
}

/** One scan over everything that could dismiss a consent surface, used by `dismissConsent` and by
 *  `consentStillPresent` so the two cannot disagree about what counts.
 *
 *  **Every candidate is returned with a confidence, and only one of them is ever clicked.**
 *
 *  - `vendor` — a caller-supplied selector, a vendor button id, or a consent-named control inside
 *    a container or frame that identifies a consent product. This is identity, not inference, and
 *    it is the only thing this library will press on a site it does not own.
 *  - `generic` — an accessible name or attribute shape in an unidentified floating surface that
 *    talks about consent. Plausible, and not good enough: geometry and vocabulary cannot separate
 *    a cookie banner from an invitation, a new-terms dialog, or an application form. These are
 *    reported as AMBIGUOUS so the capture stops loudly, and never clicked.
 *
 *  That boundary is the honest one. Eight review rounds of adding geometry and vocabulary each
 *  traded one misclassification for another; refusing to act on a guess is the only version that
 *  does not eventually press the wrong button on a stranger's site. */
async function findConsentCandidate(page, {
  order, extraSelectors = [], probeMs = 400, deadline = Infinity, requireOverlay = true,
} = {}) {
  const roots = consentSearchRoots(page);
  const remaining = () => Math.max(0, deadline - Date.now());
  const probeBudget = () => Math.max(0, Math.min(probeMs, remaining()));
  const always = async () => true;

  // Vendor identity FIRST, and as an alternative rather than an addition. Checking it only after
  // the generic context test had already passed meant it was never reached on a site whose
  // container is a known product but whose intermediate markup carries no consent prose — the
  // exact case the container list exists for, and it silently stopped dismissing a wall the
  // previous version handled in 1.5s.
  // Vendor identity, or simply "it is a consent-shaped control in a floating surface".
  //
  // An earlier version also demanded that the surface's WORDS be about consent. That test made
  // sense while a generic match could be clicked — it no longer can, and as a gate on *noticing*
  // it was actively harmful: a banner in a language the vocabulary does not cover, one whose text
  // is in images, or one that is simply terse, failed it and the page was then reported as having
  // no wall at all. Silently filming a consent dialog is the worst outcome available here; a
  // false stop is merely inconvenient.
  const acceptable = (root) => async (candidate) => {
    if (await hasVendorIdentity(candidate, root, deadline)) return true;
    return !requireOverlay || await isInsideOverlay(candidate, root, deadline);
  };

  for (const root of roots) {
    for (const selector of extraSelectors) {
      if (remaining() === 0) return null;
      const button = await firstMatching(root.locator(selector), probeBudget(), deadline, always);
      if (button) return { button, strategy: 'extraSelectors', selector, root, confidence: 'vendor' };
    }
  }

  for (const strategy of order) {
    for (const root of roots) {
      if (remaining() === 0) return null;
      if (!await anyPresent(root, CONSENT_BUTTONS[strategy], probeBudget())) continue;
      for (const selector of CONSENT_BUTTONS[strategy]) {
        if (remaining() === 0) return null;
        const button = await firstMatching(root.locator(selector), probeBudget(), deadline, always);
        if (button) return { button, strategy, selector, root, confidence: 'vendor' };
      }
    }
  }

  let fallback = null;
  for (const strategy of order) {
    for (const root of roots) {
      if (remaining() === 0) break;
      const byName = await firstMatching(root.getByRole('button', { name: CONSENT_NAMES[strategy] }),
        probeBudget(), deadline, acceptable(root));
      if (byName) {
        const label = await withDeadline(byName.innerText(), Math.min(1000, remaining()), '');
        const selector = `role=button[name=${JSON.stringify(label.trim())}]`;
        if (await hasVendorIdentity(byName, root, deadline)) {
          return { button: byName, strategy, selector, root, confidence: 'vendor' };
        }
        fallback = fallback || { button: byName, strategy, selector, root, confidence: 'generic' };
      }

      if (remaining() === 0) break;
      if (!await anyPresent(root, CONSENT_SHAPES[strategy], probeBudget())) continue;
      for (const selector of CONSENT_SHAPES[strategy]) {
        if (remaining() === 0) break;
        const byShape = await firstMatching(root.locator(selector), probeBudget(), deadline, acceptable(root));
        if (!byShape) continue;
        if (await hasVendorIdentity(byShape, root, deadline)) {
          return { button: byShape, strategy, selector, root, confidence: 'vendor' };
        }
        fallback = fallback || { button: byShape, strategy, selector, root, confidence: 'generic' };
      }
    }
  }
  return fallback;
}

/** Is a consent surface present at all — full-screen wall OR partial banner?
 *
 *  The question the capture template asks immediately before the first beat. Page coverage alone
 *  is not enough there for the same reason it was not enough in the gate: a 22%-height CMP
 *  injected after `dismissConsent` returned is not "covering the page", and would otherwise walk
 *  straight into the footage. */
export async function consentStillPresent(page, { prefer = 'reject', extraSelectors = [] } = {}) {
  const order = prefer === 'accept' ? ['accept', 'reject'] : ['reject', 'accept'];
  const coverage = await pageIsCovered(page);
  // Classify even when the page is covered. Returning early lost the ambiguity signal exactly
  // where it is most useful — the caller learns the capture is blocked but not whether a control
  // was found and deliberately left alone, which is the difference between "add a selector" and
  // "this rig sees nothing".
  const candidate = await findConsentCandidate(page, {
    order, extraSelectors, deadline: Date.now() + 4000, requireOverlay: !coverage.covered,
  });
  return {
    present: coverage.covered || Boolean(candidate),
    ambiguous: Boolean(candidate) && candidate.confidence === 'generic',
    ...coverage,
    blocker: coverage.blocker
      || (candidate ? `a consent control in a floating layer (${candidate.selector})` : null),
  };
}

/**
 * Click the consent wall away before anything is recorded.
 *
 * Defaults to REJECT, then falls back to accept. Two reasons, and the second is the one that
 * matters: rejecting sets fewer third-party cookies in a session about to be filmed, and a
 * video that opens by accepting tracking on the viewer's behalf shows a consent decision nobody
 * in the audience made. Sites that only offer "accept" get the fallback, and the return value
 * records which was clicked.
 *
 * **It polls until `timeoutMs`, it does not scan once.** A single pass is timing luck: a banner
 * injected 300ms after load is simply not there yet when a one-shot scan runs, and Playwright
 * IGNORES the `timeout` option on `isVisible` (it is documented as deprecated and unused), so
 * passing one buys nothing. Measured against a fixture: banner at 0ms → found; the same banner
 * at 300ms → `clicked: false` returned in 46ms.
 *
 * Returns `{ clicked, strategy, selector, covered, blocker, scrollLocked }`.
 *
 * 🚨 **Three outcomes, not two.** `clicked: true` is a dismissal. `ambiguous: true` means a
 * consent-shaped control was found in a floating surface and deliberately NOT pressed, because
 * nothing identified it as a consent product — stop and look, do not film. Only
 * `clicked: false, ambiguous: false, covered: false` means the page has no wall this rig can see,
 * and even that is a statement about this rig, not about the page.
 *
 * **Read `covered` too.** `clicked: false, covered: false` `clicked: false, covered: true` means there IS one and this function could not
 * dismiss it — carry on and you will film the dialog, with every later check reporting success:
 * the page stays scroll-locked so scrolls do nothing, and a rect measured below the fold looks
 * perfectly settled while sitting outside the frame.
 */
export async function dismissConsent(page, {
  prefer = 'reject', settleMs = 900, timeoutMs = 9000, probeMs = 400, clearMs = 5000,
  quietExitMs = 3000,
  extraSelectors = [],
} = {}) {
  const order = prefer === 'accept' ? ['accept', 'reject'] : ['reject', 'accept'];
  const deadline = Date.now() + timeoutMs;
  // After a click, give the overlay time to actually leave before judging coverage. Checking
  // immediately reports the dialog mid-fade as still covering the page — a false positive that
  // would abort a capture whose consent step had in fact just succeeded. One site reported its
  // dialog as still covering 2.5s after a click that had worked; probed on its own a moment
  // later the same overlay was `display:none`. Dismissal animations are neither fast nor
  // uniform, so this window is generous on purpose: a false abort costs a whole capture,
  // waiting costs seconds.
  const finish = async (result) => {
    let coverage = await pageIsCovered(page);
    if (result.clicked && coverage.covered) {
      const clearBy = Date.now() + clearMs;
      while (Date.now() < clearBy && coverage.covered) {
        await page.waitForTimeout(250);
        coverage = await pageIsCovered(page);
      }
    }
    return { ...result, ...coverage };
  };

  // The budget is checked INSIDE the loops, not just around them. 20-odd selectors across
  // several frames at `probeMs` each is tens of seconds per pass — a "6-second deadline" that is
  // only tested once per pass is not a deadline.
  const startedAt = Date.now();
  let passesWhileClear = 0;
  let ambiguous = null;

  while (Date.now() < deadline) {
    // A proven full-page wall IS the evidence; the per-candidate overlay test only has to carry
    // the partial-banner case, where nothing else vouches for the control.
    const covered = (await pageIsCovered(page)).covered;
    const candidate = await findConsentCandidate(page, {
      order, extraSelectors, probeMs, deadline, requireOverlay: !covered,
    });

    if (candidate && candidate.confidence === 'vendor') {
      if (await clickReliably(candidate.button)) {
        await page.waitForTimeout(settleMs);
        return finish({
          clicked: true, ambiguous: false,
          strategy: candidate.strategy, selector: candidate.selector,
        });
      }
      await page.waitForTimeout(250);
      continue;
    }

    // A plausible control that nothing identifies. Remember it and keep looking — a vendor match
    // may still appear — but never press it.
    if (candidate) ambiguous = ambiguous || candidate;

    if (!covered && !ambiguous) {
      // Nothing covering the page and nothing consent-shaped in a floating layer. Give a
      // late-injected banner a couple of passes, then stop rather than spending the full budget
      // proving a negative — a page with no wall was costing 9s at the start of every capture,
      // and banners that arrive late arrive within a second or two, not eight.
      //
      // Deliberate: this returns before `timeoutMs`. A CMP injecting later is caught by the
      // template's `consentStillPresent` call immediately before the first beat.
      passesWhileClear += 1;
      if (passesWhileClear >= 2 && Date.now() - startedAt > quietExitMs) {
        return finish({ clicked: false, ambiguous: false, strategy: null, selector: null });
      }
    }

    await page.waitForTimeout(250);
  }

  if (ambiguous) {
    return finish({
      clicked: false,
      ambiguous: true,
      strategy: ambiguous.strategy,
      selector: ambiguous.selector,
    });
  }
  return finish({ clicked: false, ambiguous: false, strategy: null, selector: null });
}

/** Everything that is not the site but sits on top of it: newsletter modals, support-chat
 *  bubbles, "open in our app" interstitials, leftover consent scaffolding. Hidden with CSS
 *  rather than clicked, because their close buttons are the least standardised controls on
 *  the web and a missed click leaves the overlay in the shot.
 *
 *  This CHANGES how the site looks. That is usually what a demo wants and is always a choice
 *  you should be able to defend — so the defaults only cover widgets that are unambiguously
 *  not content.
 *
 *  ⚠ It is NOT a substitute for `dismissConsent`. It hides known containers by selector; a
 *  consent platform not on this list stays up, and `hidden: 0` means "nothing on my list was
 *  showing", never "the page is clear". Ask `pageIsCovered(page)` for that. */
const OVERLAY_SELECTORS = [
  '#onetrust-consent-sdk', '#CybotCookiebotDialog', '#usercentrics-root', '#didomi-host',
  '.qc-cmp2-container', '#tarteaucitronRoot', '#BorlabsCookieBox', '#cmpwrapper', '.cmpboxBG',
  '[id^="sp_message_container"]', '#coiOverlay', '#Coi-Renew',
  '#hubspot-messages-iframe-container', '#intercom-container', '.intercom-lightweight-app',
  '#drift-widget-container', '#crisp-chatbox', '#tidio-chat', '.zsiq_floatmain',
  'iframe[title*="chat" i]', 'iframe[title*="Consent" i]',
];

/** Returns `{ hidden, alreadyHidden }` — only elements that were VISIBLE count as hidden.
 *  An earlier version counted every match, so hiding an element that was already
 *  `display:none` reported a success it had not achieved. */
export async function hideOverlays(page, { extraSelectors = [], keepSelectors = [] } = {}) {
  const selectors = [...OVERLAY_SELECTORS, ...extraSelectors];
  return await page.evaluate((options) => {
    let hidden = 0;
    let alreadyHidden = 0;
    let kept = 0;
    // `keepSelectors` protects matching ELEMENTS. Filtering the selector list by string equality
    // only skips an identical entry, so anything you asked to keep was still hidden the moment a
    // second selector in the list also matched it.
    const isProtected = (element) => options.keep.some((selector) => element.matches(selector));
    for (const selector of options.selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (isProtected(element)) { kept += 1; continue; }
        const box = element.getBoundingClientRect();
        const wasVisible = box.width > 0 && box.height > 0
          && getComputedStyle(element).visibility !== 'hidden';
        element.style.setProperty('display', 'none', 'important');
        if (wasVisible) hidden += 1; else alreadyHidden += 1;
      }
    }
    return { hidden, alreadyHidden, kept };
  }, { selectors, keep: keepSelectors });
}

/**
 * Stop things that move on their own — SELECTIVELY, and not by default.
 *
 * The obvious rule ("motion is nondeterministic, kill it") is wrong on a site you do not own.
 * A video of a news site that keeps the live stream RUNNING is making a point a still cannot
 * make. Motion is only noise relative to a check that treats it as noise. So the rule is
 * conditional on what the beat is for:
 *
 *   freeze the media   when the beat is FREEZE-FRAMED (the still is cut from a source time,
 *                      and a playing video no longer holds that frame at that time) or is
 *                      verified by PIXEL DIFF (pitfalls #1, #13)
 *   leave it running   when the beat's claim IS the motion: a live feed, a player being
 *                      demonstrated, an animation that is the feature
 *
 * `media` therefore defaults to FALSE. Carousels are the one case with no trade-off and are not
 * covered by `media`: a slider rotating every few seconds will rotate INSIDE your hold. There is
 * no generic carousel detector worth shipping — pass the site's own selector as `pauseSelectors`.
 *
 * `cssAnimations` defaults to FALSE for the reason in `stableRect`: pausing every CSS animation
 * also freezes scroll-reveal effects mid-fade. `smoothScroll` defaults to TRUE and is the one
 * unconditional fix — a site-set `scroll-behavior: smooth` makes `behavior:'instant'` a lie.
 */
export async function freezeMotion(page, {
  media = false, cssAnimations = false, smoothScroll = true, pauseSelectors = [],
} = {}) {
  return await page.evaluate((options) => {
    const stopped = { media: 0, animations: 0, paused: 0 };
    if (options.media) {
      for (const element of document.querySelectorAll('video, audio')) {
        element.autoplay = false;
        element.loop = false;
        try { element.pause(); } catch { /* a detached or cross-origin element cannot be paused */ }
        stopped.media += 1;
      }
    }
    for (const selector of options.pauseSelectors) {
      for (const element of document.querySelectorAll(selector)) {
        // Subtree, not the element. A carousel container almost never carries the animation
        // itself — the track, the slides or a pseudo-element does — so pausing only the node you
        // named is the documented usage doing nothing at all.
        const subtree = [element, ...element.querySelectorAll('*')];
        for (const node of subtree) {
          node.style.setProperty('animation-play-state', 'paused', 'important');
          node.style.setProperty('transition', 'none', 'important');
        }
        if (element.getAnimations) {
          for (const animation of element.getAnimations({ subtree: true })) animation.pause();
        }
        stopped.paused += subtree.length;
      }
    }
    if (options.cssAnimations) {
      const style = document.createElement('style');
      style.textContent = `*, *::before, *::after {
        animation-play-state: paused !important;
        transition: none !important;
      }`;
      document.head.appendChild(style);
      stopped.animations = document.getAnimations ? document.getAnimations().length : 0;
      if (document.getAnimations) for (const animation of document.getAnimations()) animation.pause();
    }
    if (options.smoothScroll) {
      // NOT for `scrollIntoView({behavior:'instant'})` — that ignores the CSS property by spec.
      // It is for every scroll that omits the option (`window.scrollBy(x, y)` and friends), which
      // defaults to `auto`, and `auto` does defer to `scroll-behavior: smooth`.
      document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important');
    }
    return stopped;
  }, { media, cssAnimations, smoothScroll, pauseSelectors });
}

/**
 * How much of the viewport is permanently occupied, top and bottom.
 *
 * `scrollIntoView({block:'center'})` knows nothing about fixed navigation: on a site with a 96px
 * sticky header, a "centred" target sits 96px higher than you think and a spotlight sized from
 * that rect frames the menu along with it.
 *
 * **Measure, never hardcode** — and measure AT THE SCROLL POSITION YOU WILL SHOOT FROM. Many
 * sites shrink their header after the first scroll: one measured 118px at the top of the page
 * and 80px once scrolled, so a single measurement taken at load compensates 38px too much for
 * every later beat. `scrollToElement` re-measures for exactly this reason.
 *
 * `bottom` exists because sticky FOOTERS are just as common (subscription bars, app promos) and
 * obscure the lower part of every frame — one covered 13% of the viewport and nothing measured it.
 */
export async function stickyInsets(page) {
  return await page.evaluate(() => {
    let top = 0;
    let bottom = 0;
    for (const element of document.querySelectorAll('body *')) {
      const style = getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;
      const box = element.getBoundingClientRect();
      if (box.height < 8 || box.height > window.innerHeight / 2) continue;
      if (box.width < window.innerWidth * 0.6) continue;
      if (box.top <= 4) top = Math.max(top, Math.round(box.bottom));
      else if (box.bottom >= window.innerHeight - 4) {
        bottom = Math.max(bottom, Math.round(window.innerHeight - box.top));
      }
    }
    return { top, bottom };
  });
}

/** Top inset only — `stickyInsets(page).top`. */
export async function stickyOffset(page) {
  return (await stickyInsets(page)).top;
}

/**
 * Scroll an element into shot and PROVE it got there.
 *
 * Two failures this exists to catch, both of which used to pass silently:
 *
 * 1. **The page is scroll-locked.** A consent platform pins `body{overflow:hidden}` while its
 *    dialog is up. `scrollIntoView` then does nothing at all, `scrollY` stays 0, and the rect you
 *    measure afterwards is of an element still far below the fold — which `stableRect` happily
 *    calls settled, because it is not moving. Observed exactly once and it produced a fully
 *    "verified" beat of a cookie banner.
 * 2. **The sticky header changed size** between the measurement and the shot.
 *
 * Pass `offsetPx` to force a value; otherwise it measures the insets AFTER scrolling, which is
 * the only position whose header height is the one you will film.
 */
export async function scrollToElement(locator, {
  block = 'center', offsetPx = null, settleMs = 400, required = true,
} = {}) {
  const page = locator.page();
  try {
    await locator.evaluate((element, options) => {
      element.scrollIntoView({ block: options.block, behavior: 'instant' });
    }, { block }, { timeout: 5000 });
  } catch (error) {
    // Only translate the one failure a caller cannot diagnose alone: the locator matched
    // nothing. Everything else — an evaluation exception, a crashed page, a bad `block` value —
    // keeps its own message, because rewriting them all destroys the real cause.
    const message = error.message || '';
    // Only a message that says it was waiting for the LOCATOR. A bare "Timeout exceeded" also
    // covers a stalled evaluator or a crashed renderer, and rewriting those destroys the cause.
    const isMissing = /waiting for locator/i.test(message)
      || /element is not attached/i.test(message)
      || /locator\.evaluate: Timeout/i.test(message) && /waiting for/i.test(message);
    if (!isMissing) throw error;
    throw new Error(
      'scrollToElement: the target could not be resolved within 5s. If it came from '
      + 'findByText, the element it tagged is gone — a page that hydrates or re-renders after '
      + 'load (common right after a consent click) replaces the node and takes the '
      + '`data-capture-target` attribute with it. Call findByText again immediately before the '
      + `beat rather than once at the top of the script. (${message.split('\n')[0]})`,
    );
  }
  await page.waitForTimeout(settleMs);

  const insets = offsetPx === null ? await stickyInsets(page) : { top: offsetPx, bottom: 0 };
  if (insets.top) {
    const box = await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    if (box.top < insets.top) {
      // `behavior:'instant'` explicitly, because the two-argument form defaults to `auto`, and
      // `auto` DOES defer to a site-set `scroll-behavior: smooth` — which would leave the page
      // still gliding when the rect is measured a moment later.
      await page.evaluate((delta) => window.scrollBy({ top: delta, behavior: 'instant' }), box.top - insets.top);
      await page.waitForTimeout(200);
    }
  }

  const placement = await locator.evaluate((element, options) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top, bottom: rect.bottom, height: rect.height,
      viewportHeight: window.innerHeight, scrollY: window.scrollY,
      underHeader: rect.top < options.top,
      belowFooter: rect.bottom > window.innerHeight - options.bottom,
      offScreen: rect.bottom < 0 || rect.top > window.innerHeight,
    };
  }, insets);

  if (required && (placement.offScreen || placement.underHeader || placement.belowFooter)) {
    const reason = placement.offScreen
      ? `it is outside the viewport (top ${Math.round(placement.top)}, viewport ${placement.viewportHeight}). `
        + (placement.scrollY === 0
          ? 'The page did not scroll at all — it is almost certainly scroll-locked by a dialog. '
            + 'Call pageIsCovered(page): a consent wall this rig failed to dismiss looks exactly like this.'
          : 'The scroll landed somewhere else.')
      : placement.underHeader
        ? `it sits under the sticky header (top ${Math.round(placement.top)} < ${insets.top}).`
        : `it sits behind the sticky footer (bottom ${Math.round(placement.bottom)} > ${placement.viewportHeight - insets.bottom}).`;
    throw new Error(`scrollToElement: the target is not in shot — ${reason}`);
  }
  return { ...placement, insets };
}

/**
 * Measure an element's rect ONLY once the layout has stopped moving under it.
 *
 * On a page you built, images have intrinsic sizes and the layout after scroll is the layout you
 * measured. On a third-party page, lazy-loaded images below the fold resolve AFTER the scroll and
 * push everything down — a spotlight landing ~430px off its target, from a perfectly correct
 * `getBoundingClientRect` call. A single `boundingBox()` cannot detect this: it returns a valid
 * rect for a layout that is about to change. So sample on requestAnimationFrame until the rect
 * holds still for `framesStill` consecutive frames.
 *
 * Three things are sampled, not one:
 *
 * - **the box** — the obvious one.
 * - **the EFFECTIVE opacity**, multiplied up the ancestor chain. The element's own opacity is
 *   the wrong signal and this is not a corner case: AOS, ScrollTrigger and every hand-rolled
 *   reveal fade the *container*. Measured on a real page: the target read `opacity: 1` while the
 *   card it sits in was at 0.825 mid-transition. Reading only the element calls that settled and
 *   the freeze-frame comes out milky.
 * - **the computed transform** — a transform animation moves the element on screen without
 *   necessarily moving the rect reported for a transformed ancestor chain.
 *
 * `settled: false` is not something to fix with a longer timeout — something is still animating.
 * `inViewport: false` means the rect is real but off-screen, which is what a scroll that silently
 * did nothing looks like; `required` turns both into errors.
 */
export async function stableRect(locator, {
  framesStill = 6, tolerancePx = 1, timeoutMs = 8000, required = true, minOpacity = 0.95,
  requireInViewport = true,
} = {}) {
  // The in-page deadline below is checked from requestAnimationFrame, so it cannot fire if the
  // renderer stops producing frames (backgrounded tab, a stalled compositor). That is the same
  // class of hang as an unloaded iframe: no error, no resolution, just a capture that never
  // returns. So the whole evaluate is raced against a Node-side deadline as well.
  const outcome = await settleWithin(locator.evaluate((element, options) => new Promise((resolve) => {
    const effectiveOpacity = (node) => {
      let opacity = 1;
      let current = node;
      while (current && current.nodeType === 1) {
        const style = getComputedStyle(current);
        if (style.visibility === 'hidden' || style.display === 'none') return 0;
        opacity *= parseFloat(style.opacity) || 0;
        // Cross the shadow boundary: `parentElement` is null at a shadow root, so a target
        // inside a fading custom element would otherwise be measured as fully opaque.
        const parent = current.parentElement;
        current = parent || (current.getRootNode() instanceof ShadowRoot ? current.getRootNode().host : null);
      }
      return opacity;
    };
    const startedAt = performance.now();
    let previous = null;
    let stillFrames = 0;
    const sample = () => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const current = {
        x: box.x, y: box.y, width: box.width, height: box.height,
        opacity: effectiveOpacity(element),
        transform: style.transform,
        inViewport: box.bottom > 0 && box.top < window.innerHeight
          && box.right > 0 && box.left < window.innerWidth,
      };
      const moved = previous === null
        || ['x', 'y', 'width', 'height'].some((key) => Math.abs(current[key] - previous[key]) > options.tolerancePx)
        || Math.abs(current.opacity - previous.opacity) > 0.01
        || current.transform !== previous.transform;
      const visible = current.opacity > options.minOpacity;
      stillFrames = (moved || !visible) ? 0 : stillFrames + 1;
      previous = current;
      if (stillFrames >= options.framesStill) return resolve({ ...current, settled: true });
      if (performance.now() - startedAt > options.timeoutMs) return resolve({ ...current, settled: false });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }), { framesStill, tolerancePx, timeoutMs, minOpacity }), timeoutMs + 4000);

  if (outcome.status !== 'ok') {
    throw new Error(
      `stableRect: the measurement itself did not return within ${timeoutMs + 4000}ms `
      + `(${outcome.status}). requestAnimationFrame is not running — the tab is backgrounded, `
      + 'the renderer has stalled, or the page navigated out from under the locator.'
      + (outcome.error ? ` (${outcome.error.message.split('\n')[0]})` : ''),
    );
  }
  const measured = outcome.value;

  const rect = {
    x: Math.round(measured.x), y: Math.round(measured.y),
    width: Math.round(measured.width), height: Math.round(measured.height),
    opacity: +measured.opacity.toFixed(2),
    settled: measured.settled,
    inViewport: measured.inViewport,
  };

  if (required && !measured.settled) {
    throw new Error(
      `stableRect: the target never held still for ${framesStill} frames within ${timeoutMs}ms `
      + `(last ${rect.width}x${rect.height} at ${rect.x},${rect.y}, effective opacity ${rect.opacity}). `
      + (rect.opacity <= minOpacity
        ? 'It is still transparent — a scroll-reveal animation has not finished, or never runs headless. '
          + 'The opacity is measured through the ancestor chain, so a fading CONTAINER shows up here too.'
        : 'Something is animating it. Freeze the motion or pick another target.')
      + ' A rect measured mid-reflow spotlights the wrong pixels.',
    );
  }
  if (required && requireInViewport && !measured.inViewport) {
    throw new Error(
      `stableRect: the rect is settled but OFF-SCREEN (y ${rect.y}, height ${rect.height}). `
      + 'A stationary element below the fold looks perfectly settled. This is what a scroll that '
      + 'silently did nothing produces — call pageIsCovered(page); a scroll-locked page under an '
      + 'undismissed consent wall is the usual cause.',
    );
  }
  return rect;
}

/**
 * Re-measure after the dwell and fail if the target moved.
 *
 * An in-page choreography can solve drift by tracking the element every frame and moving the
 * spotlight with it. This pipeline composites afterwards from a rect recorded in `beats.json`, so
 * it has nothing to follow WITH — the equivalent guarantee is to prove the rect still described
 * the element at the end of the hold. If it did not, the beat is unusable and you want to know
 * now, not in review.
 */
export async function assertRectHeld(locator, rect, { tolerancePx = 2 } = {}) {
  const after = await stableRect(locator, { required: false });
  // The re-measurement carries its own verdict, and ignoring it lets the worst case through: an
  // element that is STILL animating times out near its original coordinates, drifts by less than
  // the tolerance, and passes — which is precisely the beat this check exists to reject.
  if (!after.settled || !after.inViewport) {
    throw new Error(
      `assertRectHeld: the re-measurement did not settle (settled=${after.settled}, `
      + `inViewport=${after.inViewport}, effective opacity ${after.opacity}). The target was not `
      + 'stable at the end of the hold, so nothing can be claimed about the recorded rect. Note '
      + 'this samples the endpoint, not the whole dwell — it proves the rect matched then, not '
      + 'that it never moved in between.',
    );
  }
  const drift = Math.max(
    Math.abs(after.x - rect.x), Math.abs(after.y - rect.y),
    Math.abs(after.width - rect.width), Math.abs(after.height - rect.height),
  );
  if (drift > tolerancePx) {
    throw new Error(
      `assertRectHeld: the target moved ${drift}px during the hold `
      + `(${rect.x},${rect.y} ${rect.width}x${rect.height} -> ${after.x},${after.y} ${after.width}x${after.height}). `
      + 'The recorded rect no longer describes what is on screen; re-shoot this beat after freezeMotion().',
    );
  }
  return after;
}

/** Page furniture — never the subject, however well the words match. */
const FURNITURE = 'nav, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"]';

/** In-house promo and ad blocks. Heuristic and deliberately narrow: these substrings do not
 *  occur inside ordinary class names, unlike the tempting `[class*="ad"]`, which matches
 *  `header`, `shadow` and `read`. A tour of a news site once framed a "Summer-Sale" house ad
 *  because it was simply the first block whose text matched. */
const PROMO = '[class*="werbung" i], [class*="anzeige" i], [class*="sponsored" i], [class*="advertis" i], [class*="eigenwerbung" i], ins.adsbygoogle';

/**
 * Find a target by its words anywhere in the document, and return a real Playwright **Locator**.
 *
 * Two things this gets right that the obvious version does not:
 *
 * - **It returns a Locator, not an ElementHandle.** An ElementHandle has no `.page()`, so it
 *   cannot be passed to `scrollToElement` — the documented recipe (`findByText` →
 *   `scrollToElement`) failed with `TypeError: locator.page is not a function` on every site it
 *   was tried on. The element is tagged with a `data-capture-target` attribute in the page and
 *   addressed through it; that is a client-side attribute on a page you are only reading, and it
 *   is what makes the handle survive as an ordinary locator.
 * - **It takes the INNERMOST match, not the first in document order.** With `div` and `section`
 *   in the tag list, first-in-document-order is always the outermost wrapper: every single match
 *   in a four-site trial resolved to a `div` — one of them 1104x347 containing six unrelated
 *   headlines — rather than to the heading whose words actually matched. A spotlight sized from
 *   that frames half the page.
 *
 * Excludes nav/header/footer/aria-hidden via `closest()` (structural, not a size heuristic) and
 * obvious promo blocks. Measure the result with `stableRect()`.
 */
let captureTargetCounter = 0;

export async function findByText(page, pattern, {
  within = 'body', tags = 'h1,h2,h3,h4,h5,p,li,strong,td,figcaption,blockquote,a,button,section,article,div',
  maxLength = 400, skipFurniture = true, skipPromo = true, minSizePx = 8,
} = {}) {
  if (!(pattern instanceof RegExp)) {
    throw new TypeError('findByText: `pattern` must be a RegExp.');
  }
  const marker = `ct-${++captureTargetCounter}`;
  const found = await page.evaluate((options) => {
    // Strip `g` and `y`. Both make `RegExp.test` stateful through `lastIndex`, so testing a list
    // of candidates silently skips every other one — a bug that looks like "the search missed it"
    // and changes with the number of elements on the page.
    const expression = new RegExp(options.source, options.flags.replace(/[gy]/g, ''));
    const root = document.querySelector(options.within);
    if (!root) return 'NO_SCOPE';
    const matches = [...root.querySelectorAll(options.tags)].filter((element) => {
      if (options.skipFurniture && element.closest(options.furniture)) return false;
      if (options.skipPromo && element.closest(options.promo)) return false;
      const text = element.innerText || '';
      if (!expression.test(text) || text.length > options.maxLength) return false;
      const box = element.getBoundingClientRect();
      // Not `> 0`: skip-to-content links are real elements with real text at 1x1 and opacity 0,
      // and they sit first in the document, so they win every loose match.
      return box.width >= options.minSizePx && box.height >= options.minSizePx;
    });
    // Innermost wins: drop any match that contains another match.
    const innermost = matches.filter(
      (element) => !matches.some((other) => other !== element && element.contains(other)),
    );
    const target = innermost[0] || null;
    if (!target) return false;
    target.setAttribute('data-capture-target', options.marker);
    return true;
  }, {
    source: pattern.source, flags: pattern.flags, within, tags, maxLength,
    skipFurniture, skipPromo, minSizePx, furniture: FURNITURE, promo: PROMO, marker,
  });

  if (found === 'NO_SCOPE') {
    // Silently falling back to `body` turns a typo'd scope into a search of the whole page, which
    // then confidently returns an unrelated element.
    throw new Error(`findByText: the scope \`${within}\` matches nothing on this page.`);
  }
  return found ? page.locator(`[data-capture-target="${marker}"]`) : null;
}
