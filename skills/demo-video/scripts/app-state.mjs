#!/usr/bin/env node
// Snapshot the app's list state before capturing, then restore it afterwards.
//
//   node app-state.mjs snapshot [file]      # record what exists now
//   node app-state.mjs diff     [file]      # what has appeared since
//   node app-state.mjs restore  [file]      # dry run: what would be deleted
//   node app-state.mjs restore  [file] --go # delete everything created since the snapshot
//   node app-state.mjs record <id> [title]  # log a record a probe/setup just created (no browser)
//
// `record` exists because the list scan only sees ROW_SELECTOR records (chats by default).
// A probe that creates something ELSE — e.g. a workspace doc via a create button that fires
// instantly, no dialog — is invisible to snapshot/diff; log its id the moment you create it,
// and diff/restore will surface it (removal may need a hand adapted to that record type).
// ROW_SELECTOR is overridable via STATE_ROW_SELECTOR for apps whose records live elsewhere.
//
// WHY THIS EXISTS. Driving a real app creates records — a capture run typically leaves a
// conversation behind (plus one "Untitled" per file-attach). Across several runs those pile up
// as near-duplicate rows in the sidebar, which is IN THE FOOTAGE and reads as a broken test
// account, forcing a re-capture. Cleaning up by TITLE does not work: the assistant auto-titles
// each run differently — one demo prompt produced "Friendly deadline reminder email",
// "Friendly reminder email draft" and "Friendly Friday deadline reminder" on three runs, so a
// title rule kept missing one and the duplicates survived. Identity is the only stable key.
//
// Run `snapshot` ONCE before the first capture, then `restore --go` when the video is signed
// off. Anything the user created themselves is outside the diff and is never touched.
//
// Adapting to another app: change ORIGIN, ROW_SELECTOR and the delete flow in `remove()`.
//
// SCOPE — this walks ONE list of ONE record type through the UI. That covers the common case
// (a capture leaves conversations behind) and nothing else. A video whose writes are a
// different shape — one guide seeded a memory row, three support tickets, a product-tour
// state and a shared-chat flag, none of them a chat row — is invisible to
// snapshot/diff, so `restore --go` will cheerfully report nothing to do while the app is
// still dirty.
//
// For those, write a project-local `capture/fixtures.mjs` next to capture.js with explicit
// `seed` / `reset` commands against whatever store the app uses, record the verified baseline
// in a comment at the top of it, and call it either side of the capture:
//
//   node fixtures.mjs reset && node fixtures.mjs seed && node capture.js
//
// Use BOTH when both apply: this script for the record type it understands, fixtures.mjs for
// the rest. `record <id>` remains the escape hatch for a one-off out-of-list creation.
import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const [, , cmd, fileArg] = process.argv;
const GO = process.argv.includes('--go');
const FILE = cmd === 'record' ? './app-state.json'
           : (fileArg && !fileArg.startsWith('--') ? fileArg : './app-state.json');
const ORIGIN = process.env.APP_ORIGIN;   // no default on purpose — the target instance changes

// These match accessible NAMES, so they are app- and locale-specific: the defaults are English
// and will find nothing in a localised UI, which makes `restore` report "nothing to delete"
// while the app is still dirty. Override without editing this file:
//   APP_ROW_MENU='Row actions|<the localised name>' APP_DELETE='Delete|<the localised name>' …
const pattern = (variable, fallback, anchored) => {
  const source = process.env[variable] || fallback;
  return new RegExp(anchored ? `^(${source})$` : source, 'i');
};
const ROW_MENU = pattern('APP_ROW_MENU', 'Conversation actions', false);
const DELETE_ITEM = pattern('APP_DELETE', 'Delete', true);
const CONFIRM_BUTTON = pattern('APP_CONFIRM', 'Delete|Confirm', true);
const STATE = process.env.STORAGE_STATE || './storageState.json';
const ROW_SELECTOR = process.env.STATE_ROW_SELECTOR || 'a[href^="/chats/"]';
const canonicalOrigin = (value) => { try { return new URL(value).origin; } catch { return value; } };

if (!['snapshot', 'diff', 'restore', 'record'].includes(cmd)) {
  console.error('usage: app-state.mjs <snapshot|diff|restore> [file] [--go]  |  record <id> [title]');
  process.exit(2);
}
if (cmd !== 'record' && !ORIGIN) {   // record only logs an id locally; the rest hit the app
  console.error('APP_ORIGIN is not set. State the exact origin in chat, then pass it explicitly:\n' +
    '  APP_ORIGIN=https://<the-instance-you-mean> node app-state.mjs ' + cmd);
  process.exit(2);
}

// `record` needs no browser and no login — it just logs an id you created out-of-list.
// It must run BEFORE the playwright require below, which is why that require is lazy.
if (cmd === 'record') {
  const id = process.argv[3];
  if (!id || id.startsWith('--')) { console.error('usage: app-state.mjs record <id> [title]'); process.exit(2); }
  const title = process.argv.slice(4).filter((a) => !a.startsWith('--')).join(' ');
  const data = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8'))
             : { at: new Date().toISOString(), origin: ORIGIN, ids: [] };
  data.created = data.created || [];
  if (!data.created.some((c) => c.id === id)) data.created.push({ id, title, at: new Date().toISOString() });
  writeFileSync(FILE, JSON.stringify(data, null, 2));
  console.log(`recorded created id ${id}${title ? ` (${title})` : ''} -> ${FILE} (${data.created.length} recorded)`);
  process.exit(0);
}
if (!existsSync(STATE)) { console.error(`no ${STATE} — run the auth step first`); process.exit(2); }

// The diff treats "not in the snapshot" as "this run created it". That inference only holds
// against the instance and the record type the snapshot was taken on — reuse it elsewhere and
// every record there looks new, so `restore --go` deletes the lot. Fatal, not a warning: on
// the wrong instance the deletion list still reads as a perfectly plausible set of chat titles.
// Checked before the browser starts, so a mismatch costs no login and no page load.
if (cmd !== 'snapshot' && existsSync(FILE)) {
  const previous = JSON.parse(readFileSync(FILE, 'utf8'));
  if (previous.origin && canonicalOrigin(previous.origin) !== canonicalOrigin(ORIGIN)) {
    console.error(`${FILE} was taken against ${previous.origin}, but APP_ORIGIN is ${ORIGIN}.\n` +
      'Every record on this instance would count as created-since and be deleted. Refusing.\n' +
      'Point APP_ORIGIN at the instance the snapshot came from, or take a fresh snapshot.');
    process.exit(2);
  }
  if (previous.rowSelector && previous.rowSelector !== ROW_SELECTOR) {
    console.error(`${FILE} was taken with STATE_ROW_SELECTOR='${previous.rowSelector}', but this run ` +
      `uses '${ROW_SELECTOR}'.\nThe two scans list different records, so the diff is meaningless. Refusing.`);
    process.exit(2);
  }
}

// Resolve playwright from the CWD's node_modules (the capture rig), not from the skill folder
// this file lives in — otherwise running it by absolute path fails with ERR_MODULE_NOT_FOUND.
const { chromium } = createRequire(process.cwd() + '/')('playwright');

// No `chromiumSandbox` here on purpose: this script only ever drives YOUR app to snapshot and
// restore its records. Anything pointed at a page you do not control must pass
// `chromiumSandbox: true` — see extract-brand.mjs and openRecorder({ untrusted }).
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 833 }, storageState: STATE });
const page = await ctx.newPage();

async function scan() {
  // NOT networkidle: HMR and realtime sockets stay open against a dev server, so it never
  // fires and every command here times out with a stack trace that looks like a login
  // problem. Wait for the rows instead (pitfalls: "networkidle never fires against Vite").
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(ROW_SELECTOR, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  // scroll the list so lazily-mounted rows are included
  await page.evaluate(async (sel) => {
    const last = () => [...document.querySelectorAll(sel)].pop();
    for (let i = 0; i < 12; i++) { last()?.scrollIntoView(); await new Promise((r) => setTimeout(r, 220)); }
  }, ROW_SELECTOR).catch(() => {});
  await page.waitForTimeout(800);
  return await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((a) => ({
    id: a.getAttribute('href').split('/').pop(),
    title: a.innerText.trim().split('\n')[0],
  })), ROW_SELECTOR);
}

async function remove(id, title) {
  const row = page.locator(`a[href$="${id}"]`).first();
  if (!(await row.count())) return false;
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await page.waitForTimeout(350);
  // Menu names are LOCALISED with the app UI — an English-only 'Conversation actions' match
  // silently fails on a German capture account. Match DE and EN; extend for other locales.
  await row.locator('xpath=..').getByRole('button', { name: ROW_MENU }).first().click({ force: true });
  await page.waitForTimeout(600);
  await page.getByRole('menuitem', { name: DELETE_ITEM }).first().click();
  await page.waitForTimeout(600);
  const confirm = page.getByRole('button', { name: CONFIRM_BUTTON }).last();
  if (await confirm.count()) await confirm.click().catch(() => {});
  await page.waitForTimeout(1000);
  console.log(`  deleted  ${title.slice(0, 52)}`);
  return true;
}

const rows = await scan();

if (cmd === 'snapshot') {
  writeFileSync(FILE, JSON.stringify({ at: new Date().toISOString(), origin: ORIGIN,
    rowSelector: ROW_SELECTOR, ids: rows.map((r) => r.id) }, null, 2));
  console.log(`snapshot: ${rows.length} existing records -> ${FILE}`);
} else {
  if (!existsSync(FILE)) { console.error(`no ${FILE} — run \`snapshot\` before capturing`); await browser.close(); process.exit(2); }
  const snap = JSON.parse(readFileSync(FILE, 'utf8'));
  const before = new Set(snap.ids);
  const created = rows.filter((r) => !before.has(r.id));

  console.log(`${rows.length} records now; ${before.size} in the snapshot; ${created.length} created since:\n`);
  for (const c of created) console.log(`   ${c.title.slice(0, 56).padEnd(56)} ${c.id.slice(0, 8)}`);

  // An empty baseline is legitimate on a fresh account, and is also what a scan that silently
  // failed (bad login, wrong selector) leaves behind — in which case this list is the account's
  // entire history, not this run's leftovers. Read the titles before passing --go.
  if (!before.size && created.length) {
    console.log(`\n⚠ the snapshot recorded ZERO records, so everything above counts as created-since.\n` +
      `  That is expected on a fresh account. If it is not, the snapshot scan failed and the list\n` +
      `  above is the account's real history — re-snapshot instead of deleting.`);
  }

  // ids logged via `record` that the list scan can't see (a different record type, e.g. a
  // workspace doc): surface them so they aren't forgotten, even though remove() below —
  // which drives the chat-row menu — won't reach them without adapting.
  const scanIds = new Set(rows.map((r) => r.id));
  const offList = (snap.created || []).filter((c) => !scanIds.has(c.id) && !before.has(c.id));
  if (offList.length) {
    console.log(`\n${offList.length} recorded at creation but not in this list scan (different record type):`);
    for (const c of offList) console.log(`   ${(c.title || '(untitled)').slice(0, 48).padEnd(48)} ${c.id.slice(0, 8)}  — remove by hand or with an adapted remove()`);
  }
  if (!created.length && !offList.length) { console.log('\n✓ nothing to restore'); await browser.close(); process.exit(0); }

  if (cmd === 'diff' || !GO) { console.log(`\n${cmd === 'diff' ? '' : 'DRY RUN — '}re-run \`restore ${FILE} --go\` to delete these.`); }
  else {
    let done = 0;
    for (let pass = 0; pass < 4; pass++) {          // the list is virtualised; re-scan between passes
      const live = (await scan()).filter((r) => !before.has(r.id));
      if (!live.length) break;
      for (const c of live) { try { if (await remove(c.id, c.title)) done++; } catch (e) { console.log(`  FAILED  ${c.title.slice(0,40)} — ${e.message.split('\n')[0]}`); } }
    }
    const left = (await scan()).filter((r) => !before.has(r.id));
    console.log(`\ndeleted ${done}. ${left.length ? `⚠ ${left.length} still present` : '✓ app restored to the snapshot'}`);
  }
}
await browser.close();
