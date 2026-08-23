# Running the capture rig headless, in a container or CI

Capturing on a developer laptop hides four failures that a container surfaces immediately. All
four were measured in a real container build by a team running this pipeline as a service —
the fixes are cheap, and each one presents as a *different* problem than it is.

---

## 1. Fonts: the container has none of the ones you assume

**Symptom:** the video renders with empty boxes (tofu) where CJK, Cyrillic, Greek or accented
text should be, or emoji come out monochrome. On a Mac the same composition is perfect, because
macOS ships the fallbacks.

**Fix — install them explicitly.** On top of the Playwright base image, whose tag must match the
Playwright version in your `package.json` (see §3 — `scripts/setup-capture-env.sh` pins
`PW_VERSION`, and the image tag has to follow it):

```dockerfile
FROM mcr.microsoft.com/playwright:v1.61.1-noble
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*
USER pwuser
```

🚨 **`USER pwuser` is not optional when you film pages you do not control.** The Playwright image
runs as **root** by default, and Chromium refuses to enable its own sandbox as root — the usual
workaround is `--no-sandbox`, which removes the renderer's process isolation entirely. That is a
defensible trade for your own staging app and an indefensible one for arbitrary third-party
pages, where the page content is exactly the untrusted input the sandbox exists to contain. Run
as `pwuser`, keep Chromium's sandbox on, add `--init` so zombie renderers get reaped, and apply
Playwright's documented seccomp profile (<https://playwright.dev/docs/docker>) rather than
`--privileged` or a blanket `--security-opt seccomp=unconfined`.

Verified in that container by rendering a mixed-script card and looking at the PNG: `Grüße
日本語 中文 한국어`, `Привет`, `Γειά σου`, `ğüşiöç` and colour emoji all resolve, no tofu.

Two things worth knowing:

- **The Playwright base image does not include CJK.** The three Noto packages are the whole
  difference.
- **`fonts-noto-color-emoji` is separate.** Without it you get monochrome substitute glyphs
  rather than nothing, which is easy to miss in review and obvious in the finished video.

**Give every font declaration a real fallback stack.** Put the requested brand face first and
back it with faces that actually exist:

```css
font-family: 'Requested Brand Face', Inter, 'Noto Sans', 'Liberation Sans', system-ui, sans-serif;
```

Without the stack, a brand face that failed to install falls back to the default *serif*, and
the layout visibly changes — a failure that reads as "the design is broken" rather than "a font
is missing". This matters more than usual here because the brand face is user-supplied
(`references/brand-style.md`) and may simply not be on the machine.

**Wait for `document.fonts.ready` before every screenshot and every capture start.** Otherwise
you occasionally catch the frame before the font swap. It reproduces rarely and lands as
"the wrong font is in the video", which is a miserable thing to chase.

```js
await page.evaluate(() => document.fonts.ready);
```

`audit-composition.mjs`'s glyph-coverage check catches tofu after the fact. That is the safety
net; this section is how not to need it.

## 2. `/dev/shm`: Chromium dies on the first capture

Docker's 64MB default for `/dev/shm` is not enough for Chromium to record a full-viewport
video. It does not degrade — it crashes on the first capture.

```yaml
services:
  renderer:
    shm_size: 1g
```

The common alternative, `--disable-dev-shm-usage`, moves the shared memory to `/tmp` and trades
the crash for slower captures. Prefer raising the limit.

## 3. Pin the image and the npm package to the SAME Playwright version

**Symptom:** `Executable doesn't exist at …/chrome-linux/chrome` — immediately after a browser
install reported success.

**Cause:** `bunx playwright install` (or `npx`) resolves *some* Playwright version and downloads
the browser revision that version wants. If your `package.json` pins a different one, the pinned
library then looks for a revision that was never downloaded. Reported concretely: revision 1234
installed, revision 1194 expected.

**Fix:** keep the image tag and the dependency in lockstep — whatever `PW_VERSION` in
`scripts/setup-capture-env.sh` says (`1.61.1` at the time of writing) in `package.json`, and
`v<same>-noble` as the image — and invoke the pinned CLI directly rather than through
`bunx`/`npx`:

```bash
node node_modules/playwright/cli.js install chromium
```

This is the same failure mode as the `bunx hyperframes` warning in `setup-render-env.sh`: a
tool re-materialised per run is not the tool you pinned.

## 4. `addInitScript` runs before `<html>` exists

**Symptom:** a helper you injected is `undefined` at call time — `window.__yourHelper is not a
function` — pointing at the helper as the culprit.

**Cause:** an init script runs before the document element exists. Top-level DOM work in it —
`document.documentElement.appendChild(style)` — throws, and because a thrown init script takes
the *whole* script with it, **every** helper defined in that file is missing. The error names
the last thing you called, not the line that actually failed.

**Fix:** do no DOM work at the top level of an init script. Make it lazy and idempotent, called
from inside each helper:

```js
await page.addInitScript(() => {
  const ensureStyle = () => {
    if (document.getElementById('__capture-style')) return;
    if (!document.documentElement) return;          // too early — the next call will do it
    const style = document.createElement('style');
    style.id = '__capture-style';
    style.textContent = '…';
    document.documentElement.appendChild(style);
  };
  window.__yourHelper = (...args) => { ensureStyle(); /* … */ };
});
```

**This skill's own helpers are not affected** — `installCursor` and the rest run through
`page.addStyleTag` / `page.evaluate` *after* navigation, where the document exists. The trap
applies the moment you move injection into `addInitScript` to survive navigations, which is a
natural thing to want.

## 5. Give the renderer nothing it does not need

If you run this as a service rather than by hand:

- **Attach it only to the network it needs.** A renderer that cannot resolve your database or
  cache cannot be talked into reaching them. Filming needs the public internet and nothing else.
- **No standing credentials.** Hand it per-job presigned URLs for its inputs and outputs.
- **Keep the public-only URL policy in the service, not just in the script** — see
  `references/foreign-sites.md` §0. A string check does not survive redirects, DNS rebinding or
  subresource requests, so put a network layer under it that drops private ranges.
