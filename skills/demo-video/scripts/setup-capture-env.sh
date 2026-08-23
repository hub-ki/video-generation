#!/usr/bin/env bash
# Stand up the Playwright capture rig for a video project. Idempotent.
#
#   bash <skill>/scripts/setup-capture-env.sh [target-dir]
#
# Creates <target-dir>/ (default ./capture) with package.json, the rig library, the auth
# helper and the DPR fixture; installs playwright + chromium if absent. Prints next steps.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-./capture}"
PW_VERSION="1.61.1"

# Prefer bun when it's there, fall back to npm so the skill
# still works on a machine without bun. Note this is `bun install`, NOT `bunx` — the
# render CLI must stay a stable local copy; see setup-render-env.sh §2.
if command -v bun >/dev/null 2>&1; then
  PKG_INSTALL="bun add"; PKG_EXEC="bunx"; PKG_RUN="bun run"
else
  PKG_INSTALL="npm install"; PKG_EXEC="npx"; PKG_RUN="npm run"
fi

mkdir -p "$DEST"
cd "$DEST"

if [ ! -f package.json ]; then
  cat > package.json <<JSON
{
  "name": "capture-rig",
  "private": true,
  "type": "module",
  "scripts": { "auth": "node auth.js" }
}
JSON
fi

cp "$SKILL_DIR/scripts/capture-lib.js"   ./lib.js
cp "$SKILL_DIR/scripts/capture-auth.js"  ./auth.js
cp "$SKILL_DIR/assets/dpr-fixture.html"  ./fixture.html
[ -f capture.js ] || cp "$SKILL_DIR/scripts/capture-template.js" ./capture.js   # never clobbers a filled-in one

# Append what's missing rather than writing the file only when absent: the rig is scaffolded
# OUTSIDE the product repo (SKILL.md Phase 1A), so no parent .gitignore covers
# storageState.json — and a target that already had a .gitignore used to get no rule at all.
for pattern in 'node_modules/' 'out/' 'storageState.json' 'app-state.json'; do
  grep -qxF "$pattern" .gitignore 2>/dev/null || echo "$pattern" >> .gitignore
done

# A present directory is not a pinned version. An older, newer or half-installed playwright in
# node_modules silently voids the "pinned library" guarantee the browser check below relies on,
# and the symptom surfaces much later as a browser-revision mismatch.
INSTALLED_PW="$(node -e 'try{process.stdout.write(require("./node_modules/playwright/package.json").version)}catch{}' 2>/dev/null || true)"
if [ "$INSTALLED_PW" != "$PW_VERSION" ]; then
  if [ -n "$INSTALLED_PW" ]; then
    echo "# playwright $INSTALLED_PW installed but $PW_VERSION pinned — reinstalling …"
  else
    echo "# installing playwright@$PW_VERSION via $PKG_INSTALL …"
  fi
  PW_LOG="$(mktemp -t pw-install.XXXXXX)"
  trap 'rm -f "$PW_LOG"' EXIT
  if ! $PKG_INSTALL "playwright@$PW_VERSION" >"$PW_LOG" 2>&1; then
    echo "ERROR: installing playwright@$PW_VERSION failed. Output:"
    tail -20 "$PW_LOG"
    exit 1
  fi
fi

# Ask the PINNED library where its browser is and whether that file exists — do NOT test for
# the cache DIRECTORY. `~/.cache/ms-playwright` being present says only that some Playwright
# once downloaded something: a machine holding chromium-1194 while this version wants
# chromium-1228 passes a directory check, prints "capture rig ready", and dies on the first
# capture with "Executable doesn't exist".
CHROMIUM="$(node -e 'try{process.stdout.write(require("playwright").chromium.executablePath())}catch{}' 2>/dev/null || true)"
if [ -z "$CHROMIUM" ] || [ ! -x "$CHROMIUM" ]; then
  echo "# downloading chromium (~100MB, once per revision) …"
  # The PINNED CLI, not `bunx`/`npx playwright install`: those resolve their own Playwright
  # version and fetch THAT version's browser revision, so the pinned library then looks for a
  # revision nobody downloaded and fails with "Executable doesn't exist" immediately after an
  # install that reported success. Reported concretely as revision 1234 fetched, 1194 wanted.
  node node_modules/playwright/cli.js install chromium 2>&1 | tail -1
  CHROMIUM="$(node -e 'try{process.stdout.write(require("playwright").chromium.executablePath())}catch{}' 2>/dev/null || true)"
  if [ -z "$CHROMIUM" ] || [ ! -x "$CHROMIUM" ]; then
    echo "ERROR: chromium still missing at '${CHROMIUM:-<unresolved>}' after install."
    exit 1
  fi
fi
echo "# chromium: $CHROMIUM"

echo "# capture rig ready in $(pwd)"
echo "#"
echo "# 1. AUTH (only if the target needs a login — the HUMAN signs in, never the agent):"
echo "#      APP_ORIGIN=https://your.app APP_PROTECTED_PATH=/some/route $PKG_RUN auth"
echo "# 2. Fill in the beats in capture.js (copied from the template; see references/playwright-capture.md)"
echo "# 3. node capture.js   ->  out/<name>/{*.webm, beats.json}"
