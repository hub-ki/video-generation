#!/bin/bash
# setup-render-env.sh — get a working HyperFrames render environment on macOS or Linux.
#
# It figures out which of these you are and does only what's needed:
#   1. Healthy machine (node + full ffmpeg)      -> installs hyperframes if missing, exits fast.
#   2. No hyperframes                            -> installs a PINNED version locally.
#   3. No ffmpeg / only a STRIPPED one           -> brew (macOS), else the ffmpeg-static npm
#                                                   package (all platforms, no sudo), else
#                                                   Remotion's bundled compositor (wrapped).
#   4. macOS with the statfs bug (false          -> patches hyperframes' disk check.
#      "Low disk space / 0.0 GB free")              Skipped when the bug isn't present.
#
# Usage:  render_env="$(bash scripts/setup-render-env.sh)" && eval "$render_env"
#     or: bash scripts/setup-render-env.sh              # just prints the exports
#
# NOT `source <(bash scripts/setup-render-env.sh)`: bash reports the status of `source`, not
# of the process substitution that produced its input, so a bootstrap that dies partway
# through reports success and leaves you with half its exports applied. Capturing first makes
# the failure visible and applies nothing on a non-zero exit.
#
# Idempotent — safe to re-run. Everything it prints to stdout is shell exports;
# all commentary goes to stderr.

set -euo pipefail

PKG_LOG="$(mktemp -t hf-install.XXXXXX)"
trap 'rm -f "$PKG_LOG"' EXIT

# 🚨 `bun add` and `npm install` WALK UP looking for a project when the working directory has no
# manifest of its own. Without this, installing "into ~/.hyperframes-cli" found the user's home as
# the nearest project and wrote `~/package.json`, `~/bun.lock` and `~/node_modules` — a setup
# script modifying files outside its own cache, on someone else's machine. A private manifest
# stops the search at the directory we mean.
prepare_cache_dir(){
  mkdir -p "$1"
  [ -f "$1/package.json" ] || printf '{\n  "name": "hyperframes-cache",\n  "private": true,\n  "version": "0.0.0"\n}\n' > "$1/package.json"
}

# And verify afterwards, because "it printed no error" is not "it landed where I asked".
assert_installed_here(){   # $1=dir $2=package name
  [ -d "$1/node_modules/$2" ] && return 0
  say "ERROR: $2 was not installed into $1 — check for a stray package.json above it."
  say "       Install log:"
  tail -15 "$PKG_LOG" | sed 's/^/         /'
  return 1
}

BINDIR="$HOME/.hyperframes-ffmpeg"
CLIHOME="$HOME/.hyperframes-cli"
HF_VERSION="0.7.57"          # pinned: the disk-check patch below matches this build
FFMPEG_STATIC_VERSION="5.3.0"     # both pinned: their postinstall downloads a prebuilt
FFPROBE_STATIC_VERSION="3.1.0"    # binary, so a floating range changes what runs here
say(){ echo "$@" >&2; }
# %q so a path with a space or a shell metacharacter survives the caller's eval intact.
emit(){ printf 'export %s=%q\n' "$1" "$2"; }

# Prefer bun when present, fall back to npm elsewhere. This is
# `bun add` / `npm install` into a private cache — NOT `bunx`/`npx`, which re-materialise
# the CLI each run and drop the §3 patch. Both ffmpeg-static and hyperframes rely on a
# postinstall to fetch binaries; every install below is re-verified afterwards, so a
# manager that blocks lifecycle scripts degrades to the next tier instead of half-working.
# --exact / --save-exact: without them both managers persist a caret range, so the next
# install in this directory can silently pull a different build of a pinned dependency.
if command -v bun >/dev/null 2>&1; then
  pkg_install(){ bun add --exact "$@" >"$PKG_LOG" 2>&1; }
else
  pkg_install(){ npm install --silent --no-fund --no-audit --save-exact "$@" >"$PKG_LOG" 2>&1; }
fi

# ---- 0. node ---------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  say "ERROR: node not found. Install Node 18+ then re-run:"
  say "       https://nodejs.org   (macOS: brew install node · Debian/Ubuntu: apt install nodejs)"
  exit 1
fi

# ---- 1. ffmpeg -------------------------------------------------------------
# This pipeline needs a FULL build, not just any binary called ffmpeg:
#   fps= / pad=        Phase 3 frame pinning and even-dimension padding
#   crop=              Phase 1B chrome removal
#   freezedetect=      audit-composition.mjs's frozen-stretch rule + the Phase 6 dead-air sweep
# Two stripped builds are commonly already on PATH and pass a naive `command -v
# ffmpeg` check, then fail mid-pipeline: Playwright's bundled ffmpeg (no fps, no
# h264 decoder) and Remotion's compositor bundle (--disable-filters allowlist).
# So probe for the filters, never for the binary.
has_filter(){
  # Here-string, NOT `ffmpeg -filters | grep -q`: under `set -o pipefail` grep exits on
  # the first match, ffmpeg takes SIGPIPE (141), and the pipeline reports failure for a
  # filter that IS present — nondeterministically, depending on how early the name sorts.
  grep -qE "^ [TSC.]+ +$2 " <<<"$("$1" -hide_banner -filters 2>/dev/null || true)"
}
# `crop` belongs in the required set, not the documentation: Phase 1B removes browser chrome with
# it and Phase 3 crops every beat. A build without it passes this gate and dies mid-pipeline.
usable_ffmpeg(){ [ -x "$1" ] && has_filter "$1" fps && has_filter "$1" pad && has_filter "$1" crop; }

emit_ffmpeg(){   # $1=ffmpeg $2=ffprobe
  emit HYPERFRAMES_FFMPEG_PATH "$1"
  emit HYPERFRAMES_FFPROBE_PATH "$2"
  has_filter "$1" freezedetect || say "# WARNING: no freezedetect in this ffmpeg — audit-composition.mjs's\
 frozen-stretch check and the Phase 6 dead-air sweep will silently pass. Verify freezes by hand (pitfalls #1, #16)."
}

FF="$(command -v ffmpeg 2>/dev/null || true)"
FP="$(command -v ffprobe 2>/dev/null || true)"
if [ -n "$FF" ] && usable_ffmpeg "$FF" && [ -n "$FP" ]; then
  say "# ffmpeg: full build at $FF — nothing to work around"
  emit_ffmpeg "$FF" "$FP"
elif command -v brew >/dev/null 2>&1 && brew install ffmpeg >/dev/null 2>&1 \
     && usable_ffmpeg "$(command -v ffmpeg 2>/dev/null || true)"; then
  say "# ffmpeg: installed via Homebrew"
  emit_ffmpeg "$(command -v ffmpeg)" "$(command -v ffprobe)"
else
  # No system ffmpeg (or only a stripped one) and no brew — the normal case on Linux
  # and on a Mac without Homebrew. ffmpeg-static ships johnvansickle/evermeet FULL
  # builds per platform, needs no sudo, and installs next to the pinned CLI.
  prepare_cache_dir "$CLIHOME"
  SFF="$(cd "$CLIHOME" && node -e 'try{process.stdout.write(require("ffmpeg-static")||"")}catch{}' 2>/dev/null || true)"
  if ! usable_ffmpeg "$SFF"; then
    say "# ffmpeg: no full build found — installing ffmpeg-static + ffprobe-static into $CLIHOME"
    ( cd "$CLIHOME" && pkg_install "ffmpeg-static@$FFMPEG_STATIC_VERSION" "ffprobe-static@$FFPROBE_STATIC_VERSION" ) \
      || { say "# ffmpeg-static install failed; last lines of the log:"; tail -10 "$PKG_LOG" | sed 's/^/#   /'; }
    SFF="$(cd "$CLIHOME" && node -e 'try{process.stdout.write(require("ffmpeg-static")||"")}catch{}' 2>/dev/null || true)"
  fi
  SFP="$(cd "$CLIHOME" && node -e 'try{process.stdout.write(require("ffprobe-static").path||"")}catch{}' 2>/dev/null || true)"
  if usable_ffmpeg "$SFF" && [ -x "$SFP" ]; then
    say "# ffmpeg: ffmpeg-static at $SFF"
    emit_ffmpeg "$SFF" "$SFP"
  else
    # Last resort: the ffmpeg bundled with Remotion's compositor, if some project
    # nearby has one. It is a STRIPPED build — it rejects fps=/pad=ceil(...) — so
    # wrap it to drop those, and accept that freezedetect is gone.
    case "$(uname -s)" in
      Darwin) PLATFORM_GLOB='*@remotion/compositor-darwin-*'; LIBVAR=DYLD_LIBRARY_PATH ;;
      Linux)  PLATFORM_GLOB='*@remotion/compositor-linux-*';  LIBVAR=LD_LIBRARY_PATH ;;
      *)      PLATFORM_GLOB='*@remotion/compositor-*';        LIBVAR=LD_LIBRARY_PATH ;;
    esac
    D=""
    for root in "$PWD" "$HOME"; do
      D="$(find "$root" -maxdepth 8 -type d -path "$PLATFORM_GLOB" 2>/dev/null | head -1)"
      [ -n "$D" ] && [ -x "$D/ffmpeg" ] && break || D=""
    done
    if [ -z "$D" ]; then
      say "ERROR: no usable ffmpeg. ffmpeg-static could not be installed (offline?) and no"
      say "       Remotion compositor bundle was found. Fix any one of these and re-run:"
      say "         (a) macOS:  brew install ffmpeg"
      say "         (b) Linux:  apt install ffmpeg   (or dnf/pacman)"
      say "         (c) static: https://johnvansickle.com/ffmpeg/ -> drop ffmpeg+ffprobe in ~/.local/bin"
      say "         (d) retry the install: (cd $CLIHOME && bun add --exact ffmpeg-static@$FFMPEG_STATIC_VERSION ffprobe-static@$FFPROBE_STATIC_VERSION)"
      exit 1
    fi
    say "# ffmpeg: falling back to Remotion's STRIPPED bundle at $D (wrapping it)"
    mkdir -p "$BINDIR"
    cat > "$BINDIR/ffmpeg" <<EOF
#!/bin/bash
export $LIBVAR="$D"
all=("\$@"); args=(); i=0; n=\${#all[@]}
while [ \$i -lt \$n ]; do
  a="\${all[\$i]}"
  case "\$a" in
    -vf|-filter:v|-filter_complex)
      v="\${all[\$((i+1))]}"
      v="\$(printf '%s' "\$v" | sed -E 's/,?pad=ceil\(iw\/2\)\*2:ceil\(ih\/2\)\*2//g; s/,?fps=[0-9.]+//g; s/^,+//; s/,+\$//')"
      if [ -n "\$v" ]; then args+=("\$a" "\$v"); fi
      i=\$((i+2)); continue ;;
    *) args+=("\$a") ;;
  esac
  i=\$((i+1))
done
exec "$D/ffmpeg" "\${args[@]}"
EOF
    printf '#!/bin/sh\nexport %s="%s"\nexec "%s/ffprobe" "$@"\n' "$LIBVAR" "$D" "$D" > "$BINDIR/ffprobe"
    chmod +x "$BINDIR/ffmpeg" "$BINDIR/ffprobe"
    # Validate the WRAPPER, not just the bundle it wraps. `usable_ffmpeg` rejects this build when
    # it is found on PATH, so accepting it unchecked here made the rejection depend on how the
    # binary was discovered. `fps` and `pad` are expected to be missing — the wrapper's whole job
    # is to strip them from filter chains — but `crop` is used unmodified in Phase 1B and 3, so a
    # bundle without it must fail here rather than mid-pipeline.
    if ! has_filter "$BINDIR/ffmpeg" crop; then
      say "ERROR: the Remotion fallback bundle at $D has no 'crop' filter, which Phase 1B (chrome"
      say "       removal) and Phase 3 (per-beat crops) require. Install a real ffmpeg:"
      say "         macOS:  brew install ffmpeg"
      say "         Linux:  apt install ffmpeg   (or dnf/pacman)"
      say "         static: https://johnvansickle.com/ffmpeg/ -> ~/.local/bin"
      exit 1
    fi
    emit_ffmpeg "$BINDIR/ffmpeg" "$BINDIR/ffprobe"
    printf 'export PATH=%q:"$PATH"\n' "$BINDIR"
  fi
fi

# ---- 2. hyperframes CLI ----------------------------------------------------
# Use a local, patchable copy. NEVER `bunx`/`npx hyperframes` for rendering —
# those re-materialise a fresh copy each run and silently drop the patch below.
CLI="${1:-}"
if [ -z "$CLI" ] || [ ! -f "$CLI" ]; then
  for c in "$CLIHOME/node_modules/hyperframes/dist/cli.js" \
           "$PWD/node_modules/hyperframes/dist/cli.js"; do
    [ -f "$c" ] && CLI="$c" && break
  done
fi
# A stray copy under ~/.npm, ~/.bun or ~/code is a HINT that something is installed, never a
# substitute: whatever version another project happens to carry is not the one the patch below was
# written against.
if [ -z "$CLI" ] || [ ! -f "$CLI" ]; then
  CLI="$(find "$HOME/.npm" "$HOME/.bun" "$HOME/code" -maxdepth 7 -type f \
         -path '*hyperframes/dist/cli.js' 2>/dev/null | head -1 || true)"
fi

version_of(){ node -e 'try{process.stdout.write(require(require("path").resolve(process.argv[1],"../../package.json")).version)}catch{}' "$1" 2>/dev/null || true; }

install_pinned(){
  say "# hyperframes: installing the pinned $HF_VERSION into $CLIHOME"
  prepare_cache_dir "$CLIHOME"
  ( cd "$CLIHOME" && pkg_install "hyperframes@$HF_VERSION" ) || {
    say "ERROR: installing hyperframes@$HF_VERSION failed. Last lines of the log:"
    tail -15 "$PKG_LOG" | sed 's/^/         /'
    exit 1
  }
  assert_installed_here "$CLIHOME" hyperframes || exit 1
  CLI="$CLIHOME/node_modules/hyperframes/dist/cli.js"
}

if [ -z "$CLI" ] || [ ! -f "$CLI" ]; then
  install_pinned
elif [ "$(version_of "$CLI")" != "$HF_VERSION" ]; then
  # Not a warning any more. This skill patches a specific build and composes against its
  # behaviour; carrying on with whatever turned up produces renders that behave nothing like the
  # documentation, and the cause is three steps away from the symptom.
  say "# hyperframes: found $(version_of "$CLI") at $CLI, which is not the pinned $HF_VERSION"
  install_pinned
fi
[ -f "$CLI" ] || { say "ERROR: hyperframes CLI still not found at $CLI"; exit 1; }

# The searches above accept the first cli.js they find anywhere under ~/.npm, ~/.bun or
# ~/code — which can be any version some other project happens to have. Say which one won,
# because a mismatch here surfaces later as a render that behaves nothing like this skill.
CLI_VERSION="$(version_of "$CLI")"
if [ -n "$CLI_VERSION" ] && [ "$CLI_VERSION" != "$HF_VERSION" ]; then
  say "ERROR: hyperframes is $CLI_VERSION at $CLI but this skill needs $HF_VERSION, and the"
  say "       isolated install did not take. Remove that copy and re-run."
  exit 1
fi
say "# hyperframes: $CLI${CLI_VERSION:+ (v$CLI_VERSION)}"

# ---- 3. patch the false "0 GB free" disk check (only if this OS has the bug)
if grep -q 'return bytesToMb(stats.bsize \* stats.bavail);' "$CLI" && \
   ! grep -q 'if (!stats.bsize || !stats.bavail) return null;' "$CLI"; then
  # Node, not python3. Node is already a hard requirement of this pipeline; python3 was an
  # undeclared second one that happened to be present on the machines this was written on.
  node -e '
    const fs = require("fs");
    const target = process.argv[1];
    const source = fs.readFileSync(target, "utf8");
    const before = "const stats = statfsSync(path2);\n    return bytesToMb(stats.bsize * stats.bavail);";
    const after = "const stats = statfsSync(path2);\n    if (!stats.bsize || !stats.bavail) return null;\n    return bytesToMb(stats.bsize * stats.bavail);";
    if (source.includes(before)) {
      fs.writeFileSync(target, source.replace(before, after));
      console.error("# patched disk-check (this OS reports bsize=0 -> false \"0 GB free\")");
    }
  ' "$CLI"
fi

# ---- 4. how to render ------------------------------------------------------
RUNTIME="node"; command -v bun >/dev/null 2>&1 && RUNTIME="bun"
emit PRODUCER_BROWSER_GPU_MODE hardware
emit HYPERFRAMES_CLI "$CLI"
say "# render with: $RUNTIME \$HYPERFRAMES_CLI render . -q high --crf 14 -o ./renders/<folder>_1080.mp4"
say "#   (name outputs <folder>_<resolution>.mp4 — e.g. workspace_1080.mp4 / workspace_4k.mp4)"
