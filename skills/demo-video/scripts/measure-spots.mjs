#!/usr/bin/env node
// Measure spotlight rects ON THE FREEZE STILLS instead of padding a boundingBox.
//
//   node <skill>/scripts/measure-spots.mjs <project-dir> [targets.json]
//   -> <project-dir>/spot-rects.json   (SOURCE px, ready to scale by WIN.w / asset_w)
//
// WHY THIS EXISTS. `boundingBox()` hugs an element's glyphs, so design-system.md says to pad
// it by ~12-18 source px. That works for a control with room around it and fails for
// everything else: a form field has its label ~20px above and its help text ~18px below, and
// row actions sit ~4px apart. Padding then either still slices the control's own ink or grows
// into the neighbour — and `verify-material.mjs` reports a DIFFERENT edge each round, so you
// chase the error from edge to edge. Five spotlights in one build went through three rounds
// of that before being measured instead.
//
// The fix is to stop guessing a distance and find the layout's own whitespace: walk each edge
// outward until a run of genuinely blank pixel rows/columns, then sit inside that run. That is
// where a human would draw the box, and it survives a re-capture.
//
// targets.json (defaults to <project-dir>/spot-targets.json):
//   {
//     "beats": "capture/out/<name>/beats.json",
//     "dpr": 2,
//     "targets": [
//       { "still": "b7b", "seed": "open_hover", "limit": 60 }
//     ]
//   }
// `still` is an asset basename in <project>/assets/<still>.png, `seed` a beat name whose
// rect starts the search, `limit` how far (source px) an edge may travel before giving up.
//
// Seed with the `_hover` mark, not `_click` — that is the frame the still was cut from.
import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const projectDir = resolve(process.argv[2] || ".");
const configPath = process.argv[3]
  ? resolve(process.argv[3])
  : join(projectDir, "spot-targets.json");

if (!existsSync(configPath)) {
  console.error(
    `no ${configPath}\n\n` +
      "Create it, e.g.:\n" +
      '{\n  "beats": "capture/out/demo/beats.json",\n  "targets": [\n' +
      '    { "still": "b7b", "seed": "open_hover", "limit": 60 }\n  ]\n}\n'
  );
  process.exit(2);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const dpr = config.dpr ?? 2; // capture runs at device-scale-factor 2 by default
const beats = JSON.parse(readFileSync(join(projectDir, config.beats), "utf8"));
const rectOf = (name) => {
  const found = beats.find((entry) => entry.name === name);
  if (!found) throw new Error(`no beat "${name}" in ${config.beats}`);
  if (!found.rect) throw new Error(`beat "${name}" has no rect — mark() it with one`);
  return found.rect;
};

const script = `
import json, sys
from PIL import Image

targets = json.loads(sys.argv[1])
project = sys.argv[2]
out = {}
GAP = 10          # a run this tall/wide counts as real layout whitespace
THRESH = 26       # per-channel distance from the local background that counts as ink

for target in targets:
    image = Image.open("%s/assets/%s.png" % (project, target["still"])).convert("RGB")
    width, height = image.size
    pixels = image.load()
    x0, y0 = int(target["x"]), int(target["y"])
    x1, y1 = x0 + int(target["w"]), y0 + int(target["h"])
    limit = int(target["limit"])

    # Local background = the most common colour in a ring just outside the control, so this
    # works on a light page, a dark one, and inside a dimmed dialog alike.
    ring = []
    for x in range(max(0, x0 - 30), min(width, x1 + 30), 3):
        for y in (max(0, y0 - 30), min(height - 1, y1 + 30)):
            ring.append(pixels[x, y])
    background = max(set(ring), key=ring.count) if ring else (255, 255, 255)

    def is_ink(x, y):
        pixel = pixels[x, y]
        return sum(abs(pixel[i] - background[i]) for i in range(3)) > THRESH

    def row_blank(y, xa, xb):
        return not any(is_ink(x, y) for x in range(max(0, xa), min(width, xb), 2))

    def col_blank(x, ya, yb):
        return not any(is_ink(x, y) for y in range(max(0, ya), min(height, yb), 2))

    def walk(start, step, blank, low, high):
        """Walk outward to the first real whitespace run, then sit inside it.

        Sitting at the run's midpoint gives only GAP/2 clearance, which trips
        verify-material's >=6px rule on tight layouts. Measure the run's full width and take
        up to 12px, or half the run if it is narrower, so the box clears its own subject
        without touching the neighbour on the other side."""
        run_start = None
        position = start
        for _ in range(limit):
            position += step
            if position <= low or position >= high:
                break
            if blank(position):
                if run_start is None:
                    run_start = position
                if abs(position - run_start) + 1 >= GAP:
                    end = position
                    while abs(end - start) < limit:
                        nxt = end + step
                        if nxt <= low or nxt >= high or not blank(nxt):
                            break
                        end = nxt
                    span = abs(end - run_start) + 1
                    return run_start + step * min(12, max(1, span // 2))
            else:
                run_start = None
        return start + step * min(limit, 14)

    top = walk(y0, -1, lambda y: row_blank(y, x0, x1), 0, height - 1)
    bottom = walk(y1, 1, lambda y: row_blank(y, x0, x1), 0, height - 1)
    left = walk(x0, -1, lambda x: col_blank(x, top, bottom), 0, width - 1)
    right = walk(x1, 1, lambda x: col_blank(x, top, bottom), 0, width - 1)

    out[target["still"]] = {
        "x": int(left), "y": int(top),
        "width": int(right - left), "height": int(bottom - top),
    }
    print("  %-8s seed %4d,%4d %4dx%-4d ->  %4d,%4d %4dx%d"
          % (target["still"], x0, y0, x1 - x0, y1 - y0,
             left, top, right - left, bottom - top), file=sys.stderr)

print(json.dumps(out))
`;

const payload = config.targets.map((target) => {
  const rect = rectOf(target.seed);
  return {
    still: target.still,
    limit: target.limit ?? 60,
    x: Math.round(rect.x * dpr),
    y: Math.round(rect.y * dpr),
    w: Math.round(rect.width * dpr),
    h: Math.round(rect.height * dpr),
  };
});

const { stdout, stderr, status } = spawnSync(
  "python3",
  ["-c", script, JSON.stringify(payload), projectDir],
  { encoding: "utf8" }
);
if (status !== 0) {
  console.error(
    stderr || "python3 failed — is Pillow installed? (python3 -m pip install --user Pillow)"
  );
  process.exit(1);
}
process.stderr.write(stderr);

const outPath = join(projectDir, "spot-rects.json");
writeFileSync(outPath, stdout.trim());
console.log(`\n  ${outPath} written (source px)`);
console.log("  Feed these to the composition instead of a padded boundingBox — then still run");
console.log("  verify-material.mjs. It is the check; this is only a better starting point.");
