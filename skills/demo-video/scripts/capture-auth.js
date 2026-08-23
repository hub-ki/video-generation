// One-time login so the capture rig can reach the app.
//
//   bun run auth   (npm run auth on a machine without bun)
//
// Opens a real browser window. YOU sign in — password or "Continue with Microsoft".
// Your credentials are never sent to, seen by, or stored by the agent.
// On success this saves ./storageState.json (session cookies/localStorage only).
//
// storageState.json is a credential: gitignored, and revocable any time by deleting it.
import { chromium } from 'playwright';
import { chmodSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const STATE = join(here, 'storageState.json');
// Canonicalised, because a trailing slash in APP_ORIGIN makes the `x.origin === APP` check
// below permanently false and the script then waits out its full 10 minutes on a good login.
const APP = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : undefined;
if (!APP) {
  console.error(
    'APP_ORIGIN is not set. Which instance gets recorded (and which version of it) is a decision\n' +
    'the user must see in chat before footage exists — state the exact origin there, then:\n' +
    '  APP_ORIGIN=https://<the-instance-you-mean> npm run auth');
  process.exit(2);
}
const PROTECTED = APP + (process.env.APP_PROTECTED_PATH || '/');  // any route that needs auth
const DEADLINE_MS = 10 * 60 * 1000;

// The probe below proves a session by loading PROTECTED and checking it doesn't bounce to
// /login. On an app whose "/" is public that proves nothing, and an anonymous session gets
// saved while announcing success — so name a route that genuinely requires auth.
if (!process.env.APP_PROTECTED_PATH) {
  console.warn('  ! APP_PROTECTED_PATH is not set, so the session is verified against "/".\n' +
               '    If "/" is reachable signed-out, an anonymous session will pass this check.\n' +
               '    Re-run with APP_PROTECTED_PATH=/some/route that requires a login.\n');
}

// "Signed in" means: back on the APP's own origin, off /login.
// (The old check was "any URL that isn't /login" — which the Microsoft OAuth
//  redirect satisfies instantly, saving an anonymous session. Hence this.)
const onAppAuthed = (u) => {
  try {
    const x = new URL(u);
    return x.origin === APP && !/^\/login\b/.test(x.pathname);
  } catch { return false; }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sandbox ON, always, regardless of whose app this is — and that is a correction of an earlier
// version that tied it to ownership. Owning the application does not make its IDENTITY PROVIDER
// yours: a normal SSO login navigates to Microsoft, Google or Okta, so a sign-in flow renders
// third-party pages by construction. Playwright leaves `chromiumSandbox` off by default, hence
// the explicit true. The opt-out exists only for hosts that forbid user namespaces, and it says
// so out loud rather than failing quietly.
const SANDBOX = process.env.AUTH_DISABLE_SANDBOX !== '1';
if (!SANDBOX) {
  console.warn('⚠ AUTH_DISABLE_SANDBOX=1 — Chromium runs without its sandbox. Every page in this '
    + 'login flow, including your identity provider, is parsed without process isolation.');
}
const browser = await chromium.launch({
  headless: false,
  chromiumSandbox: SANDBOX,
  args: ['--window-size=1360,960'],
});
const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();
await page.goto(APP + '/login');

console.log(`
  A browser window is open.

  Sign in there yourself — password or "Continue with Microsoft".
  Microsoft may open a popup or redirect this tab; both are handled.

  I am waiting until you are actually back inside the app, and then
  verifying the session really works before saving anything.
`);

const t0 = Date.now();
let saved = false;
let lastSeen = '';

while (Date.now() - t0 < DEADLINE_MS) {
  // Any tab in this context (incl. an OAuth popup that redirected back) will do.
  const candidate = ctx.pages().find((p) => onAppAuthed(p.url()));
  // Origin + path only. A full OAuth URL carries the authorization code, state and nonce in
  // its query string, and this line goes into an agent-visible log.
  const redact = (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return u; } };
  const urls = ctx.pages().map((p) => redact(p.url())).join(' , ');
  if (urls !== lastSeen) { console.log('  … currently at:', urls); lastSeen = urls; }

  if (candidate) {
    await candidate.waitForLoadState('networkidle').catch(() => {});
    await sleep(2500);                       // let tokens/cookies settle

    // Functional check: does a protected route actually stay put in a fresh tab?
    // A URL heuristic is what got this wrong the first time — verify for real.
    const probe = await ctx.newPage();
    await probe.goto(PROTECTED, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    const ok = onAppAuthed(probe.url());
    await probe.close();

    if (ok) {
      await ctx.storageState({ path: STATE });
      chmodSync(STATE, 0o600);   // playwright writes it 0644 under the usual umask
      console.log('\n  ✓ verified signed in — session saved -> ' + STATE);
      console.log('    (cookies/localStorage only — no password is stored)\n');
      saved = true;
      break;
    }
    console.log('  … not authenticated yet (protected route bounced back to /login) — still waiting');
  }
  await sleep(1500);
}

await browser.close();
if (!saved) {
  console.error('\n  ✗ Gave up after 10 minutes without a verified session. Nothing was saved.\n');
  process.exit(1);
}
