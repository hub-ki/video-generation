// TEMPLATE — copy to <project>/capture/capture.js and fill in the beats.
//
// The contract: this script IS the edit decision list. Every beat you `mark()` lands in
// beats.json with its source time and the element's exact rect, so Phase 2 needs no contact
// sheets, no frame scanning, and has no retries to disambiguate.
//
//   node capture.js   ->  out/<NAME>/{<NAME>.webm, beats.json}
import { openRecorder, installCursor, timeline, glide, park, CSS,
         typeInto, setTitle, waitSettled, waitIdle, approveTools, sendPrompt, focusOn,
         waitForFonts, dismissConsent, pageIsCovered, consentStillPresent, hideOverlays, freezeMotion,
         stickyInsets, scrollToElement, stableRect, assertRectHeld, findByText } from './lib.js';
import { chromium } from 'playwright';
import { existsSync, readdirSync, renameSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const NAME = 'demo';
const START_URL = 'https://example.com/';
const out = `out/${NAME}`;

// OWN APP, behind a login          -> keep this, run `bun run auth` first (a human signs in)
// PUBLIC WEBSITE you do not own    -> set STATE = null
//
// Filming a stranger's site while logged in is a different act from filming your own, and the
// difference is not technical. The session belongs to a person, the terms of the site are not
// yours, and everything past the login is by definition non-public. If you ever do it, get an
// explicit yes for that specific domain and destroy the session file when the job ends —
// do not leave a stranger's cookies lying next to the footage.
const STATE = './storageState.json';

// 🚨 TWO SEPARATE QUESTIONS. Do not collapse them.
//
//   OURS       — do we control this application? Decides whether the browser sandbox is on and
//                whether the foreign-site safeguards run.
//   STATE      — is there a login? Decides nothing about trust.
//
// Deriving one from the other is a security bug, and it was one here: an AUTHENTICATED
// third-party site (which references/foreign-sites.md §0 permits after explicit per-domain
// approval) has a storageState, so "no state means untrusted" quietly turned the sandbox off and
// skipped every safeguard for exactly the riskiest target this skill supports.
const OURS = true;                 // ← set to false for ANY page you do not control
const UNTRUSTED = !OURS;

// A page you do not control also raises a question your own app never asks: are you allowed to
// film this one? Trademarks, terms of use, and whatever personal data happens to be on screen
// are the caller's problem, and this script cannot decide it for them.
const PUBLIC_SITE = UNTRUSTED;

// Read by BOTH consent checks — the one in the boot sequence and the late gate before the first
// beat. Keep them here rather than at either call site: a selector known to only one of the two
// is how a dismissed banner reappears in the footage.
const CONSENT_OPTIONS = {
  prefer: 'reject',
  extraSelectors: [],        // e.g. ['#their-cmp .accept-all'] — an explicit override, tried
                             // first, and deliberately not subject to the reject-first order
};

if (!PUBLIC_SITE && !existsSync(STATE)) { console.error('run `bun run auth` first (the human signs in)'); process.exit(1); }
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// ── selectors ───────────────────────────────────────────────────────────────
// RESOLVE THESE AGAINST THE LIVE DOM FIRST — never guess. A one-off probe that prints
// getByRole counts + boundingBoxes costs one call and saves a failed capture.
const S = {
  // thing: (p) => p.getByRole('link', { name: /^…$/i }).first(),
};

// On a site you do not own there are no test ids and no stable class names, so target by the
// words on the page and exclude the furniture: `findByText(page, /…/)` searches the whole
// document but skips nav, header, footer and aria-hidden, because the same phrase lives in
// the menu and the footer of nearly every marketing site.

// ── (optional) SETUP: put the app in the story's starting state, unrecorded ──
// Do this in a separate non-recording context so it never appears in the footage.
// If it writes anything, mirror it in RESTORE below.
//
// If setup (or a dry run) involves an AI/async write, verify its PERSISTENT postcondition —
// the doc really exists, the tree really shows the folders — not just the chat's success
// message. An AI "saved to workspace" flow once ended green while persisting nothing
// browsable; three beats were shot against the missing structure and re-shot.
// Use typeInto()/setTitle() for text entry (they verify the readback) and waitSettled()
// for AI answers (a hand-rolled wait once returned early and recorded the spinner).
async function withPage(fn) {
  // Same trust flag as the recorder. This helper is meant for your own app, but "meant for" is
  // not a guarantee, and an unsandboxed browser opened against a page you do not control undoes
  // the recorder's protection before it starts.
  const b = await chromium.launch({ chromiumSandbox: UNTRUSTED });
  const c = await b.newContext({ viewport: CSS, ...(STATE ? { storageState: STATE } : {}) });
  const p = await c.newPage();
  try { await fn(p); } finally { await b.close(); }
}
// await withPage(async (p) => { … });

// ── RECORD ──────────────────────────────────────────────────────────────────
const { browser, ctx, page } = await openRecorder({
  dir: out,
  storageState: STATE ?? undefined,
  // Turns Chromium's own sandbox ON. Playwright leaves it off by default, so filming a page you
  // do not control without this means a stranger's JavaScript is parsed by an unsandboxed
  // renderer — no container hardening compensates for that.
  untrusted: UNTRUSTED,
});
// KEEP timeline() ON THE LINE AFTER openRecorder. Its t0 is what makes every mark() a
// SOURCE time in the recorded webm, which is what Phase 3 cuts against. Moving it below
// the goto/hold (a natural-looking reorder) silently shifts every beat by the page-load
// duration, and every derived cut point is wrong by that much with nothing to flag it.
const tl = timeline();
const hold = (ms) => page.waitForTimeout(ms);

/** Glide the cursor to an element, log the beat + its exact rect, dwell on it.
 *
 *  `stableRect` rather than `boundingBox`: a single measurement is a valid answer about a
 *  layout that is still moving. Lazy-loaded images resolving below the fold push everything
 *  down AFTER the scroll — measured at ~430px of drift on a real news site — and a rect
 *  recorded mid-reflow spotlights whatever slid into that space instead. The re-check after
 *  the dwell is the compositing pipeline's version of following the element: nothing here can
 *  follow, so it proves the rect still described the element when the hold ended. */
async function beat(name, loc, {
  dwell = 1200, duration, verifyHeld = PUBLIC_SITE,
  // 'on-target' drives the cursor onto the element — right when the beat is ABOUT using a
  // control. 'parked' keeps it out of the frame, which is what a passive beat needs: on a
  // heading or a paragraph the arrow lands squarely on the letters and sits there for the whole
  // dwell, and the spotlight is then framing text with a cursor in it. A site tour shows things
  // rather than operating them, so it parks by default; its motion comes from the scroll.
  cursor = PUBLIC_SITE ? 'parked' : 'on-target',
} = {}) {
  const box = await stableRect(loc);
  if (cursor === 'parked') await park(page, CSS.width - 60, CSS.height - 60);
  else await glide(page, box, duration ? { duration } : {});   // real-time + eased; never {steps}
  // mark() runs when the dwell STARTS, because that is when the source time is known — so the
  // beat is in the list before anything can prove it wrong. Everything from here until the beat
  // is verified rolls back to that exact entry (by id, not by name: two beats sharing a name
  // would otherwise delete the wrong one), and the dwell is inside the rollback because a page
  // can just as easily die during it as during the check.
  const marked = tl.mark(name, { rect: box });
  try {
    await hold(dwell);
    if (verifyHeld) await assertRectHeld(loc, box);
  } catch (error) {
    tl.drop(marked);
    throw error;
  }
  console.log(`  ${marked.t.toFixed(2)}s  ${name}`);
  return box;
}

/**
 * The standard action figure: approach -> settle on the control -> click.
 *
 * It logs TWO marks and the edit uses them differently:
 *   <name>_hover  ← CUT THE FREEZE STILL FROM THIS ONE
 *   <name>_click  ← only for the click-pulse coordinate
 *
 * Never freeze on `_click`. That mark is written after `locator.click()` returns, so the
 * real click is already past and an SPA has re-rendered — a still cut even 0.12s "before" it
 * showed the navigated page. `_hover` sits a settled ~700ms earlier and is always the
 * affordance itself. See playwright-capture.md §16.
 */
async function action(name, loc, { approach = 900, settle = 700 } = {}) {
  const rect = await stableRect(loc);
  await glide(page, rect);
  await hold(approach);
  // Same transaction as beat(): `_hover` is the mark the edit cuts its freeze-still from, so a
  // dwell or click that fails after it must not leave it behind — the salvage block writes the
  // list and calls every surviving entry verified.
  const hover = tl.mark(`${name}_hover`, { rect });
  try {
    await hold(settle);
    await loc.click();
  } catch (error) {
    tl.drop(hover);
    throw error;
  }
  tl.markClick(`${name}_click`, rect);
  return rect;
}

// EVERYTHING from here to the SALVAGE block is inside the try, including navigation, consent
// and the coverage abort. `recordVideo` only finalises the webm when the context closes, so any
// throw that skips `ctx.close()` loses the whole recording AND leaks a browser — and the boot
// sequence below deliberately throws.
let captureError = null;
try {

// `domcontentloaded`, not `networkidle`: an ad-heavy or continuously-polling third-party page
// may never go idle, and a navigation timeout here happens BEFORE any of the recovery code
// below can run. Settle with a bounded wait instead.
await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
const fonts = await waitForFonts(page);
// Reported, not fatal — but never silent. A page whose fonts never settle records the fallback
// face, and that is discovered in review unless someone says so here.
if (!fonts.ready) console.warn(`  ⚠ fonts not ready (${fonts.reason}) — this take may record fallback faces`);
await hold(1200);

// ── clear the site's own furniture BEFORE anything is worth recording ────────
// Skip this block for your own app; every line of it is about a page you do not control.
if (PUBLIC_SITE) {
  const consent = await dismissConsent(page, CONSENT_OPTIONS);
  console.log(consent.clicked
    ? `  consent: ${consent.strategy} via ${consent.selector}`
    : consent.ambiguous
      ? `  consent: found ${consent.selector} but did NOT press it — nothing identifies it`
      : '  consent: nothing found');

  // A consent-shaped control that no vendor container, frame or selector identifies. The library
  // refuses to press it on purpose: geometry and wording cannot tell a cookie banner from an
  // invitation or a change-of-terms dialog, and pressing the wrong one changes something real on
  // a site we do not own. Look at the screenshot and add its selector to CONSENT_OPTIONS.
  if (consent.ambiguous) {
    await page.screenshot({ path: join(out, 'AMBIGUOUS.png') });
    throw new Error(
      `an unidentified consent-shaped control is on the page (${consent.selector}). It was NOT `
      + `clicked. See ${out}/AMBIGUOUS.png — if it is a consent button, add its selector to `
      + 'CONSENT_OPTIONS.extraSelectors; if it is not, this page needs a different beat.',
    );
  }

  // 🚨 STOP HERE IF THE PAGE IS STILL COVERED. `clicked:false` alone is ambiguous — it is what
  // both a wall-free page and an out-of-date selector list look like. Filming past this point
  // produces a fully "verified" beat of a cookie dialog: the page stays scroll-locked so every
  // scroll is a silent no-op, and a rect measured below the fold is perfectly stationary and
  // therefore perfectly settled. Observed end to end on a real news site.
  if (consent.covered) {
    await page.screenshot({ path: join(out, 'BLOCKED.png') });
    throw new Error(
      `the page is still covered by ${consent.blocker}`
      + (consent.scrollLocked ? ' and scrolling is locked' : '')
      + `. See ${out}/BLOCKED.png, then add the button's selector to CONSENT_OPTIONS above `
      + '— do NOT film past this.',
    );
  }

  await hideOverlays(page);                              // newsletter modal, chat bubble
  await freezeMotion(page);                              // see the doc comment: media stays
                                                         // LIVE by default. Pass
                                                         // { media: true } for a beat you
                                                         // freeze-frame or pixel-verify, and
                                                         // { pauseSelectors: ['.slider'] }
                                                         // for a rotating carousel.
  await hold(600);

  // Logged for the record only. Do NOT cache it and pass it to every scroll: plenty of sites
  // shrink the header after the first scroll (118px at the top, 80px once scrolled), so a value
  // measured here over-compensates every later beat. `scrollToElement` re-measures per call.
  const insets = await stickyInsets(page);
  if (insets.top || insets.bottom) {
    console.log(`  sticky: ${insets.top}px top, ${insets.bottom}px bottom (re-measured per scroll)`);
  }
}

await installCursor(page);          // the cursor is NEVER in a capture — inject it
await park(page, CSS.width - 60, CSS.height - 60);        // park it out of the way
await hold(400);

// LAST GATE, after every other boot step. `dismissConsent` returns as soon as the page is
// demonstrably clear rather than polling to its full deadline, so a CMP that injects late — or
// one that reappears after `hideOverlays` — would otherwise be discovered in review. This costs
// one evaluate and is the only check standing between a late banner and the finished video.
if (PUBLIC_SITE) {
  // `consentStillPresent`, not `pageIsCovered`: a 22%-height banner injected after the boot
  // sequence is not "covering the page" and would sail through a coverage-only check straight
  // into the first beat. This asks the same question the consent gate asks — full wall OR a
  // consent control sitting in a floating layer.
  // The SAME options. Passing a custom selector to the first call and not the second meant a
  // CMP you had taught the rig to dismiss could reinject before the first beat and walk straight
  // through the late gate, because the second consumer had never heard of it.
  const late = await consentStillPresent(page, CONSENT_OPTIONS);
  if (late.present) {
    if (late.ambiguous) console.error('  (unidentified — it was not pressed, by design)');
    await page.screenshot({ path: join(out, 'BLOCKED-LATE.png') });
    throw new Error(
      `a consent surface appeared after the boot sequence: ${late.blocker}. `
      + `See ${out}/BLOCKED-LATE.png — a layer that injects this late needs its selector in `
      + 'CONSENT_OPTIONS above, which both consent checks read.',
    );
  }
}

tl.mark('start');

// ── your beats ──────────────────────────────────────────────────────────────
// A recording cannot be resumed, so a beat that throws ends the take — but the beats already
// filmed are still good footage, and Phase 4 reads one file per beat anyway. Losing them too is
// a choice, not a consequence. `stableRect` and `assertRectHeld` throw by design here, precisely
// so a wrong rect never reaches the cut.
// Public site, target by its words. findByText returns a LOCATOR (innermost match, furniture
// and promo blocks excluded); scrollToElement measures the sticky insets itself and THROWS if
// the target did not actually land in shot.
// const section = await findByText(page, /Preise ab/i);
// if (!section) throw new Error('no element matched /Preise ab/ — check the wording on the page');
// await scrollToElement(section);
// await beat('pricing', section, { dwell: 2200 });
//
// Own app, target by role:
// await beat('open_thing', S.thing(page), { dwell: 1600 });
// await S.thing(page).click();
// await page.waitForURL(/…/); await hold(1500);
// await beat('thing_open', S.panel(page), { dwell: 1500 });
//
// Use beat() rather than a bare tl.mark(..., { rect: await …boundingBox() }). A hand-written mark
// is measured once, never re-checked, and never rolled back — and the salvage block calls every
// surviving entry verified. If you must mark by hand, mark something WITHOUT a rect.
//
// Dwell generously: these numbers ARE the pacing. A guide should never need pausing.
// Also mark any GROUP rect you'll want to spotlight (a whole section, an open menu) —
// boundingBox() on the group container, not just the label.
//
// EVERY rect you mark() must be MEASURED — boundingBox() of a real locator, or focusOn()
// for content the assistant just produced. Never a percentage of <main>: two spotlights
// built from percentage guesses both landed their edges mid-text and each cost a round.

} catch (error) {
  captureError = error;
}

// ── SALVAGE ─────────────────────────────────────────────────────────────────
// Every step is guarded independently. `recordVideo` only finalises the webm on close, so an
// unclosed context loses every frame — and the moment that close is most likely to fail is
// exactly when something has already gone wrong, which is when the salvage matters most.
try { await ctx.close(); } catch (error) { console.error(`  ⚠ context close failed: ${error.message}`); }
try { await browser.close(); } catch (error) { console.error(`  ⚠ browser close failed: ${error.message}`); }

const vid = readdirSync(out).find((f) => f.endsWith('.webm'));
if (vid) renameSync(join(out, vid), join(out, `${NAME}.webm`));
else console.error('  ⚠ no .webm in the output directory — the recording was not finalised');
writeFileSync(join(out, 'beats.json'), JSON.stringify(tl.beats, null, 2));
console.log(`\n  video -> ${out}/${NAME}.webm`);
console.log(`  beats -> ${out}/beats.json   (the edit decision list)`);

if (captureError) {
  console.error(`\n  ✗ the take ended early. ${tl.beats.length} VERIFIED beat(s) survive: ${captureError.message}`);
  console.error('  Those beats are usable — Phase 4 composes one file per beat, and it does not');
  console.error('  care that they came from one recording. A beat whose rect failed verification');
  console.error('  has been removed from the list rather than handed on.');
  console.error('  Re-running re-records EVERYTHING (a take cannot be resumed), so mixing clips');
  console.error('  from two runs is the cheap repair — but only where the scenes are');
  console.error('  self-contained. On a public site they usually are; on your own app, shared');
  console.error('  state and relative timestamps make two runs visibly discontinuous. See');
  console.error('  references/foreign-sites.md §9.');
  process.exitCode = 1;
}

// ── RESTORE: leave the instance exactly as you found it ─────────────────────
// Own app only. On someone else's site there is nothing to restore because you should not
// have written anything — filming is read-only. If a beat needs a form filled in, use a
// demo/sandbox target, not a stranger's production database.
// await withPage(async (p) => { … });
