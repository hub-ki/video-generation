# ffmpeg recipes

`setup-render-env.sh` picks the ffmpeg for you and points `HYPERFRAMES_FFMPEG_PATH`
at it. **Two modes:**

- **Real ffmpeg present** (e.g. `/usr/local/bin/ffmpeg`, checked first): everything
  below works, and so do `fps`, `setpts`, `zoompan`, `tile` — so you *can* also speed
  with `setpts=PTS/10`, zoom with `zoompan`, or tile a contact sheet if you prefer.
- **Fallback: the Remotion-bundled ffmpeg** (stripped build, wrapped): only `crop`,
  `scale=W:-1`, `-ss`/`-t`, `-r` (output rate), `-frames:v 1`, libx264, and image2
  in/out work; `fps=/setpts=/zoompan/tile/hstack/vstack/pad=ceil(...)/lavfi` are
  rejected or missing (the wrapper strips `fps=`/`pad=ceil(...)` so HyperFrames' own
  render survives).

**The recipes below use only the universal subset (`-r` for speed, per-frame reads,
no `tile`), so they run identically in both modes.** That's the safe default — reach
for `setpts`/`zoompan`/`tile` only if you've confirmed a real ffmpeg.

## Probe the source

```bash
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,avg_frame_rate,pix_fmt \
  -show_entries format=duration,size -of default=noprint_wrappers=1 "input.mov"
```

Watch for **variable frame rate** (`r_frame_rate` != `avg_frame_rate`). Screen recordings are almost always VFR — fix it next.

## Make a CFR master (do this first, always)

VFR breaks two things: your `-ss` frame sampling and HyperFrames' internal seeking disagree. Re-encode to constant 30fps so timestamp == frame/30 everywhere:

```bash
ffmpeg -y -i "input.mov" -t 96 -r 30 -an -c:v libx264 -preset veryfast -crf 18 \
  -pix_fmt yuv420p assets/master_cfr.mp4
```

`-t` = the portion you care about. `-r 30` forces CFR. Screen recordings compress tiny.

## Build a content map (to understand the flow)

Extract one frame every few seconds, then **read them** to learn what happens when:

```bash
for t in 0 6 12 18 24 30 36 42 48 54 60 ...; do
  ffmpeg -y -v error -ss $t -i assets/master_cfr.mp4 -frames:v 1 -vf "scale=960:-1" map_$t.jpg
done
```

(The `tile` filter is broken, so no contact sheet — read the individual frames.)

## Measure the window bounds (crop the browser chrome / desktop / green recording border)

A screen recording contains the browser chrome (tabs+address bar), a desktop margin, and macOS's **green recording border** on the left. Find the app viewport with PIL, then crop it out so the recording sits clean inside the design's window:

```python
from PIL import Image
im=Image.open("fullframe.png").convert("L"); W,H=im.size; px=im.load()
bcol=lambda x: sum(1 for y in range(0,H,4) if px[x,y]>150)/(H//4)
brow=lambda y: sum(1 for x in range(0,W,4) if px[x,y]>150)/(W//4)
left =next(x for x in range(W)        if bcol(x)>0.5)
right=next(x for x in range(W-1,0,-1) if bcol(x)>0.5)
bot  =next(y for y in range(H-1,0,-1) if brow(y)>0.5)
# top = just below the browser chrome (~122 for a maximised Chrome window; verify visually)
```

Then all beat assets are cropped `crop=W:H:X:Y` where X=left (bump +6-10px to kill the 2px green line), Y=chrome-bottom, W=right-left, H=bot-Y. Keep this crop **identical across every beat asset** so they line up in the window.

## Cut a beat clip (natural speed)

The render **ignores `data-media-start`**, so give every beat its own file that already starts at the right moment:

```bash
ffmpeg -y -i assets/master_cfr.mp4 -ss <START> -t <DUR> -r 30 -an \
  -vf "crop=W:H:X:Y" -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p assets/beat.mp4
```

## Speed a beat up (montage of "the AI working")

Extract frames at a **decimated** rate, then re-encode at 30fps. Output-rate `N` gives `30/N ×` speed:

```bash
# ~10x: sample at 3fps, replay at 30fps
ffmpeg -y -ss <START> -i assets/master_cfr.mp4 -t <SPAN_SEC> -r 3 -vf "crop=W:H:X:Y" -q:v 3 /tmp/f_%05d.jpg
ffmpeg -y -framerate 30 -i /tmp/f_%05d.jpg -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p assets/beat_fast.mp4
```

Rules of thumb: **typing** the prompt → ~1.6× (`-r 18`) so it stays readable; **reasoning / tool calls** → ~6-10× (`-r 3-5`).

## Result "hero" still

Results (a calendar, a table, a confirmation) often **scroll** while rendering, which fights a zoom/spotlight. Freeze the fullest frame as a still and use that for the result beat:

```bash
ffmpeg -y -ss <BEST_T> -i assets/master_cfr.mp4 -frames:v 1 -vf "crop=W:H:X:Y" assets/result.png
```

## Excise frames (kill a click ring / a blip / a detour)

To cut an artifact out of the middle of a beat, trim the good parts and concat. The
cursor is stationary through a click, so the join is invisible — it just reads as the
click landing (pitfall #11):

```bash
# ring occupies EXACTLY source 265.3667..265.6000 (8 frames @30fps)
ffmpeg -y -i assets/master_cfr.mp4 -filter_complex \
 "[0:v]trim=265.2:265.36,setpts=PTS-STARTPTS[a];[0:v]trim=265.6333:276.12,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1[o]" \
 -map "[o]" -c:v libx264 -preset veryfast -crf 14 -pix_fmt yuv420p -an /tmp/nat.mp4
```

**Boundaries must fall between real frame times** — `trim=…:265.37` keeps the frame at
`265.3667` (pitfall #12). Then apply speed via decimation and **re-scan every frame** of
the result to prove the artifact is gone.

To speed the concatenated result, decimate it (don't chain `setpts` — see below):

```bash
ffmpeg -y -i /tmp/nat.mp4 -r 20 -q:v 3 /tmp/f/%05d.jpg      # 20fps sample of an Ns clip
ffmpeg -y -framerate 30 -i /tmp/f/%05d.jpg -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p out.mp4
# output = N*20 frames @30fps → N*20/30 s → 30/20 = 1.5× speed
```

> **`setpts=PTS/N` is unreliable here.** `-vf "setpts=PTS/7.5,fps=30"` on a 66s clip gave
> 42.9s (≈1.5×), not the expected 8.8s. The decimation recipe above is deterministic —
> frame count is exactly `span × -r`. Always `ffprobe` the duration afterwards.

## Freeze frame

Cut the still at the **same source frame** the neighbouring clips break on, so the hard
cuts are frame-identical (design-system.md → Freeze frames):

```bash
ffmpeg -y -ss 265.2 -i assets/master_cfr.mp4 -frames:v 1 -q:v 2 assets/beat_hover.png
```

## Redact names/emails (only if asked)

The stripped ffmpeg can't `boxblur` reliably; use PIL on the baked pixels (works on stills and, per-frame, on extracted montage frames before re-encoding):

```python
from PIL import Image, ImageFilter
im=Image.open("assets/result.png").convert("RGB")
b=(x0,y0,x1,y1); im.paste(im.crop(b).filter(ImageFilter.GaussianBlur(16)), b)
im.save("assets/result.png")
```

To find exact box coords, dump a **gridded** preview (draw labelled 50px gridlines with PIL, scale down, read the pixel numbers off it) rather than guessing.
