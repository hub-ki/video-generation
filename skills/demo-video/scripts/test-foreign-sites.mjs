// Deterministic regression tests for the foreign-site capture helpers.
//
//   npm install && npm test                     (from the package root)
//   node skills/demo-video/scripts/test-foreign-sites.mjs
//
// `playwright` is resolved relative to THIS file, not the working directory, so a clean checkout
// needs the package root's own dependencies installed — hence the manifest next to the README.
//
// Local file:// fixtures only — no network, no live sites.
//
// Every consent fixture carries a real consent sentence ("Wir und unsere Partner verwenden
// Cookies…"). That is deliberate and not padding: a generic name or shape match must prove it
// sits in a surface whose WORDS are about consent, because geometry cannot separate a cookie
// banner from a legitimate "Accept invitation" modal. Banners without that text do not exist —
// it is legally required — so a bare fixture would have been testing something no site does. Live smoke runs against real
// websites are worth doing and are NOT a substitute for this: every case below is a defect that
// shipped, and each one presented as success rather than as an error.

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { dismissConsent, pageIsCovered, consentStillPresent, hideOverlays, stickyInsets,
         scrollToElement, stableRect, findByText, waitForFonts } from './capture-lib.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fixtures');
const fixtureUrl = (name) => pathToFileURL(join(FIXTURES, name)).href;
const VIEWPORT = { width: 1200, height: 800 };

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const withFixture = async (name, run) => {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.goto(fixtureUrl(name));
  try { await run(page); } finally { await context.close(); }
};

console.log('\nconsent that arrives late');
await withFixture('late-consent.html', async (page) => {
  const consent = await dismissConsent(page, { timeoutMs: 4000 });
  // Nothing identifies this banner's vendor, so it is REPORTED and deliberately not pressed.
  check('notices a banner injected after load', consent.ambiguous, JSON.stringify(consent));
  check('and does not press it', !consent.clicked);
});

console.log('\nlazy iframe with no execution context');
await withFixture('lazy-iframe.html', async (page) => {
  const startedAt = Date.now();
  // Its own hard deadline. Awaiting the operation directly means a regression to the original
  // defect makes the SUITE hang instead of failing, and an external CI timeout is not an
  // assertion — it is a person noticing later.
  const consent = await Promise.race([
    dismissConsent(page, { timeoutMs: 3000 }),
    new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 15000)),
  ]);
  const elapsed = Date.now() - startedAt;
  check('does not hang', !consent.timedOut, `${elapsed}ms`);
  // 3s deadline + the clearMs re-check. A bound of 20s would have passed the original defect's
  // successor just as happily; this one fails if the deadline stops being respected.
  check('honours its own deadline', elapsed < 9000, `${elapsed}ms`);
  // A visible consent-shaped control sits on this page AND three iframes never load. The
  // predicate therefore runs against a frame that never answers — the case where an unbounded
  // evaluation hangs forever rather than failing.
  check('still reports the banner despite the stalled frames',
    !consent.timedOut && consent.ambiguous, JSON.stringify(consent));
  check('and honours the remaining-budget contract', elapsed < 9000, `${elapsed}ms`);
});

console.log('\nfixed app shell is not a consent wall');
await withFixture('app-shell.html', async (page) => {
  const coverage = await pageIsCovered(page);
  check('no false positive on a full-viewport fixed shell', !coverage.covered, JSON.stringify(coverage));
});

console.log('\nhidden duplicate button, keepSelectors, promo and furniture exclusion');
await withFixture('duplicates.html', async (page) => {
  const consent = await dismissConsent(page, { timeoutMs: 4000 });
  // Assert the STRATEGY, not just success: the accessible-name fallback would rescue this
  // fixture even with the duplicate bug intact, and the test would pass for the wrong reason.
  check('skips the hidden duplicate and clicks the visible button via the selector list',
    consent.clicked && consent.selector === '.cm-btn-decline', JSON.stringify(consent));

  // #keepme also matches a default hide selector (#crisp-chatbox is applied to it too), so this
  // proves element-level protection rather than the absence of any matching rule.
  const overlays = await hideOverlays(page, { keepSelectors: ['#keepme'] });
  check('hides the chat widget', overlays.hidden >= 1, JSON.stringify(overlays));
  check('keeps a protected element even though a hide selector matches it',
    await page.locator('#keepme').isVisible() && overlays.kept >= 1, JSON.stringify(overlays));

  const global = await findByText(page, /Preise ab/g);   // `g` on purpose: it must be stripped
  const id = global ? await global.evaluate((element) => element.id) : null;
  check('ignores nav and promo blocks, takes the innermost match', id === 'real', `got #${id}`);
});

console.log('\nancestor opacity, sticky insets, viewport placement');
await withFixture('reveal.html', async (page) => {
  const insets = await stickyInsets(page);
  check('measures a sticky header', insets.top === 64, JSON.stringify(insets));
  check('measures a sticky footer', insets.bottom === 48, JSON.stringify(insets));

  const target = await findByText(page, /Pricing from/);
  check('finds the target', Boolean(target));

  // A CONTAINER at zero while the target itself is opacity:1 — what a scroll-reveal that never
  // runs headless leaves behind. Held there rather than caught mid-fade, so the refusal names
  // which rule fired whatever the machine's load does to the probe's timing.
  const holdContainerAt = (value) => page.evaluate((opacity) => {
    const card = document.getElementById('card');
    card.style.transition = 'none';
    card.style.opacity = opacity;
  }, value);

  await holdContainerAt('0');
  await scrollToElement(target);
  let refused = false;
  try {
    await stableRect(target, { timeoutMs: 400, framesStill: 3 });
  } catch (error) {
    refused = /invisible/.test(error.message);
  }
  check('refuses a target inside an invisible container', refused);

  // …but a container a designer deliberately set to .8 is a value, not an unfinished animation.
  // Refusing it is unfixable by definition: no amount of waiting settles a design decision.
  await holdContainerAt('0.8');
  let translucentRect = null;
  try {
    translucentRect = await stableRect(target, { timeoutMs: 1500, framesStill: 3 });
  } catch (error) {
    translucentRect = { error: error.message };
  }
  check('films a container held at a deliberate .8', translucentRect?.settled === true,
    JSON.stringify(translucentRect));
  check('and says it is translucent', translucentRect?.translucent === true,
    JSON.stringify(translucentRect));

  await page.evaluate(() => {
    const card = document.getElementById('card');
    card.style.transition = '';
    card.style.opacity = '';
    card.classList.add('shown');
  });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('card')).opacity === '1');
  const rect = await stableRect(target);
  check('measures it once the container has finished', rect.settled && rect.inViewport, JSON.stringify(rect));
  check('clears the sticky header', rect.y >= insets.top, `y=${rect.y} header=${insets.top}`);

  const fonts = await waitForFonts(page);
  check('reports font readiness', fonts.ready === true, JSON.stringify(fonts));
});

console.log('\nconsent walls a z-index rule alone would miss');
await withFixture('modal-variants.html', async (page) => {
  const coverage = await pageIsCovered(page);
  // The REASON matters as much as the verdict: this fixture exists for the descendant-role rule,
  // and it has an opaque low-z backdrop precisely so no other rule can carry it. If it ever passes
  // via `z-index` or `translucent-backdrop`, the rule it was written for has quietly stopped
  // working and the test would still be green.
  check('sees a z-index 120 backdrop whose dialog role is on the child, via that rule',
    coverage.covered && coverage.reason === 'modal-descendant', JSON.stringify(coverage));
  const consent = await dismissConsent(page, { timeoutMs: 4000 });
  check('reports it without pressing it (no vendor identity)',
    consent.ambiguous && !consent.clicked, JSON.stringify(consent));
});

await withFixture('native-dialog.html', async (page) => {
  const coverage = await pageIsCovered(page);
  // The dialog is 320px wide: its own box covers ~4% of the viewport. Only the ::backdrop covers
  // the page, and ::backdrop is not an element — a box-sampling test cannot see this at all.
  check('sees a SMALL native modal whose ::backdrop covers the page, via the top layer',
    coverage.covered && coverage.reason === 'top-layer', JSON.stringify(coverage));
});

await withFixture('translucent-shell.html', async (page) => {
  const coverage = await pageIsCovered(page);
  check('does not mistake a translucent z-index 5000 app root for a wall', !coverage.covered,
    JSON.stringify(coverage));
});

console.log('\na generic button on an uncovered page');
await withFixture('plain-agree.html', async (page) => {
  const consent = await dismissConsent(page, { timeoutMs: 2000 });
  const state = await page.locator('#state').innerText();
  check('does not press an unrelated "Agree"', state === 'untouched' && !consent.clicked,
    `state=${state} ${JSON.stringify(consent)}`);
});

console.log('\npartial banners and scrollable walls');
await withFixture('bottom-banner.html', async (page) => {
  const coverage = await pageIsCovered(page);
  check('a 22%-height banner does NOT read as page coverage', !coverage.covered, JSON.stringify(coverage));
  const consent = await dismissConsent(page, { timeoutMs: 5000 });
  // The point is that page coverage is the wrong gate: an unidentified partial banner must be
  // SEEN. Whether to press it is a separate question, and the answer is no.
  check('sees it anyway, via overlay membership', consent.ambiguous, JSON.stringify(consent));
  check('and leaves it alone', !consent.clicked && (await page.locator('#banner').count()) === 1);
});

await withFixture('scrollable-wall.html', async (page) => {
  const coverage = await pageIsCovered(page);
  check('a full-screen wall that scrolls itself is still a wall', coverage.covered,
    JSON.stringify(coverage));
  check('and the scroller exemption did not swallow it', coverage.reason !== null,
    JSON.stringify(coverage));
});

await withFixture('in-page-agree.html', async (page) => {
  const consent = await dismissConsent(page, { timeoutMs: 3000 });
  const state = await page.locator('#state').innerText();
  check('does not press an in-flow "Alle akzeptieren" even while the page is covered',
    state === 'untouched', `state=${state} ${JSON.stringify(consent)}`);
});

await withFixture('long-wall-short-page.html', async (page) => {
  const coverage = await pageIsCovered(page);
  // The wall holds ~6x the article's text. A share-of-text rule called this the page itself.
  check('a long wall over a short article is still a wall', coverage.covered, JSON.stringify(coverage));
  const consent = await dismissConsent(page, { timeoutMs: 5000 });
  check('and is reported rather than pressed', consent.ambiguous && !consent.clicked,
    JSON.stringify(consent));
});

await withFixture('shell-with-agree.html', async (page) => {
  const consent = await dismissConsent(page, { timeoutMs: 3000 });
  const state = await page.locator('#state').innerText();
  check('does not press a consent-named button inside the app\'s own fixed shell',
    state === 'untouched' && !consent.clicked, `state=${state} ${JSON.stringify(consent)}`);
});

await withFixture('iframe-wall.html', async (page) => {
  await page.waitForTimeout(600);
  const coverage = await pageIsCovered(page);
  check('an iframe wall reads as page coverage from the parent', coverage.covered,
    JSON.stringify(coverage));
  const consent = await dismissConsent(page, { timeoutMs: 6000 });
  // The regression this guards: the own-surface test runs inside the candidate's document, and a
  // dedicated consent iframe has no siblings there — so it was classified as the page itself and
  // its button refused, on two real news sites at once.
  check('and its button is pressed, not vetoed as "the page itself"', consent.clicked,
    JSON.stringify(consent));
  check('the iframe is gone', (await page.locator('#sp_message_iframe_1').count()) === 0);
});

console.log('\nlate injection, after the early exit');
await withFixture('bottom-banner.html', async (page) => {
  await page.evaluate(() => document.getElementById('banner').remove());
  const consent = await dismissConsent(page, { timeoutMs: 4000, quietExitMs: 500 });
  check('exits early on a clear page', !consent.clicked && !consent.covered, JSON.stringify(consent));
  // Now inject a partial banner AFTER dismissConsent has returned — the case the template's
  // late gate exists for. Page coverage alone does not see it.
  await page.evaluate(() => {
    const banner = document.createElement('div');
    banner.id = 'late';
    banner.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:180px;background:#fff;z-index:50';
    banner.innerHTML = '<p>Wir verwenden Cookies und verarbeiten Daten zu Datenschutzzwecken.</p>'
      + '<button>Alle ablehnen</button>';
    document.body.appendChild(banner);
  });
  const coverage = await pageIsCovered(page);
  check('a late 22% banner is NOT page coverage', !coverage.covered, JSON.stringify(coverage));
  const late = await consentStillPresent(page);
  check('but consentStillPresent catches it', late.present, JSON.stringify(late));
});

console.log('\nfloating is not the same as interrupting');
await withFixture('sticky-header-invite.html', async (page) => {
  const consent = await dismissConsent(page, { timeoutMs: 3000 });
  const state = await page.locator('#state').innerText();
  check('does not press "Accept invitation" in an ordinary sticky header',
    state === 'untouched' && !consent.clicked, `state=${state} ${JSON.stringify(consent)}`);
});

await withFixture('responsive-embed.html', async (page) => {
  await page.waitForTimeout(600);
  const consent = await dismissConsent(page, { timeoutMs: 3000 });
  const state = await page.frameLocator('iframe').locator('#state').innerText().catch(() => 'unknown');
  check('does not press "Accept all" inside a normal responsive embed',
    state === 'untouched' && !consent.clicked, `state=${state} ${JSON.stringify(consent)}`);
});

await withFixture('inflow-then-banner.html', async (page) => {
  const consent = await dismissConsent(page, { timeoutMs: 5000 });
  const state = await page.locator('#state').innerText();
  // The scan must walk PAST the first visible match when it fails the overlay test.
  // Scanning must walk PAST the in-flow match; the banner one is then reported, not pressed.
  check('walks past the in-flow button to the one in the banner',
    consent.ambiguous && state === 'untouched', `state=${state} ${JSON.stringify(consent)}`);
  check('and presses neither', !consent.clicked);
});

await withFixture('banner-on-bare-page.html', async (page) => {
  const consent = await dismissConsent(page, { timeoutMs: 4000 });
  // Nothing else on this page is large or wordy enough to count as "substantial". The banner must
  // still be seen, and for a reason that does not depend on how tall an <h1> renders.
  check('flags a banner even when nothing else on the page is substantial',
    consent.ambiguous && !consent.clicked, JSON.stringify(consent));
});

console.log('\nunknown surfaces must never read as "no wall"');
await withFixture('untranslated-banner.html', async (page) => {
  const consent = await dismissConsent(page, { timeoutMs: 4000 });
  // No recognised consent vocabulary anywhere — the text is an image and the page is in Thai.
  // Reporting this as clear is the one outcome that ends with a cookie banner in the video.
  check('flags a banner whose language and copy it cannot read',
    consent.ambiguous && !consent.clicked, JSON.stringify(consent));
  const late = await consentStillPresent(page);
  check('and the late gate sees it too', late.present && late.ambiguous, JSON.stringify(late));
});

console.log('\nis it even about consent?');
await withFixture('invitation-modal.html', async (page) => {
  const consent = await dismissConsent(page, { timeoutMs: 3000 });
  const state = await page.locator('#state').innerText();
  // Fixed, centred, occluding, role=dialog — it passes every positional test. It is simply not a
  // cookie banner, and geometry cannot tell the difference. The words have to.
  check('does not press "Accept invitation" in a genuine non-consent modal',
    state === 'untouched' && !consent.clicked, `state=${state} ${JSON.stringify(consent)}`);
  // The page has a privacy footer and a cookie link. Nothing about the page as a whole may
  // authorise a control inside an unrelated modal.
  check('and a privacy footer elsewhere on the page does not authorise it',
    state === 'untouched');
});

await withFixture('compact-card.html', async (page) => {
  const consent = await dismissConsent(page, { timeoutMs: 5000 });
  // ~7% of the viewport: under any fixed area threshold, still unmistakably a consent card.
  // ~7% of the viewport AND a vendor-shaped container class: identified, therefore pressed.
  check('dismisses a compact floating card that names its vendor', consent.clicked,
    JSON.stringify(consent));
  check('the card is gone', (await page.locator('#card').count()) === 0);
});

await withFixture('app-iframe.html', async (page) => {
  await page.waitForTimeout(600);
  const consent = await dismissConsent(page, { timeoutMs: 3000 });
  const state = await page.frameLocator('#app').locator('#state').innerText().catch(() => 'unknown');
  // The app is a fixed full-viewport iframe. The parent-side check must apply the page-surface
  // test too — omitting it there was the sibling gap this fixture exists for.
  // `!ambiguous` is the load-bearing half. Generic candidates are never clicked, so asserting
  // only `!clicked` would still pass if the parent-side page-surface test went missing and the
  // app iframe were classified as an overlay again — the regression would return unnoticed.
  check('does not press "Alle akzeptieren" inside an app delivered as a full-viewport iframe',
    state === 'untouched' && !consent.clicked, `state=${state} ${JSON.stringify(consent)}`);
  check('and does not even flag it — the app iframe is the page, not an overlay',
    !consent.ambiguous, JSON.stringify(consent));
});

console.log('\nsettled but off-screen');
await withFixture('reveal.html', async (page) => {
  await page.waitForTimeout(1600);
  const target = await findByText(page, /Pricing from/);
  await page.evaluate(() => window.scrollTo(0, 0));   // the target is now far below the fold
  let refused = false;
  try {
    await stableRect(target);
  } catch (error) {
    refused = /OFF-SCREEN/.test(error.message);
  }
  check('refuses a stationary rect that is outside the viewport', refused);
});

console.log('\ninput validation');
await withFixture('app-shell.html', async (page) => {
  let threw = false;
  try { await findByText(page, /x/, { within: '#does-not-exist' }); }
  catch (error) { threw = /matches nothing/.test(error.message); }
  check('throws on a scope that matches nothing', threw);
  let typeThrew = false;
  try { await findByText(page, 'not a regexp'); } catch (error) { typeThrew = error instanceof TypeError; }
  check('rejects a non-RegExp pattern', typeThrew);
});

await browser.close();
console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
