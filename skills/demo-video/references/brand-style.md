# The brand step — give it a style, or take one off a website

The design is one look with swappable tokens. **Nothing in this skill is branded**, so before
the first render every project answers one question: *whose brand is this video in?*

Run this **once per project, right after scaffolding and before composing** — not at the end.
A palette settled late means re-reading every snapshot you already approved, and a logo settled
late is the classic "the outro is still the placeholder" bug.

```
brand.json  ──apply-brand.mjs──▶  index.html   (the :root token block + every logo slot)
```

`brand.json` is the only place a brand is written down. `apply-brand.mjs` is the only thing that
writes it into the composition. Hand-editing the tokens works right up until you re-run the
script, and hand-editing one of the two logo slots is how the intro and the outro end up
carrying different marks.

## Ask, in one message

Put the question in the same message as the plan check — it is one decision, not a phase:

> Whose brand should this be in? Four ways: **(1) send me your tokens** (a palette, a font, a
> logo file, or a brand guide), **(2) name a URL** and I'll pull the palette, type and logo off
> it for you to correct, **(3) give me one colour** — your brand colour, or just your logo — and
> I'll build a palette around it for you to look at, or **(4) I use a neutral grey default**,
> which is fine for an internal clip and not fine for anything a customer sees.

Do not guess a brand from a screenshot of the app. The app's *own* UI palette is not the video's
palette — the canvas has to sit behind the app and stay distinguishable from it.

---

## A. The user gives you the style

Write their values into `brand.json` and run the script. Nothing else:

```json
{
  "name": "Acme",
  "language": "en",
  "colors": {
    "bg": "#f1eee7",
    "ink": "#15110c",
    "ink2": "#5f584e",
    "card": "#fcfaf6",
    "highlight": ["#f2eda8", "#f7f5d4"],
    "dot": "rgba(21,17,12,.10)"
  },
  "font": { "sans": "\"Inter\",-apple-system,system-ui,Arial,sans-serif" },
  "logo": { "path": "./assets/brand-logo.svg" }
}
```

```bash
node <skill>/scripts/apply-brand.mjs .            # writes tokens + both logo slots
node <skill>/scripts/apply-brand.mjs . --check    # validate without writing
```

A brand guide usually gives you a **surface colour and an accent**, not these six tokens. Derive
the rest rather than inventing them — see "Deriving the tokens" below.

`dot` is optional (defaults to `ink` at 10%), `logo` is optional (the placeholder mark stays,
with a warning), `language` is carried through to the narration checks and the companion docs.

## B. Extract it from their website

```bash
node <skill>/scripts/extract-brand.mjs https://their.site --out ./brand.json --logo-dir ./assets
node <skill>/scripts/apply-brand.mjs .
```

It loads the page in a real browser, asks it for **computed** styles (never a screenshot — a
colour read off a downscaled image is a guess), weights each colour by the area it actually
covers, and writes `brand.json` plus the logo file.

What it does, so you can correct it rather than trust it:

| token | how it is chosen |
| --- | --- |
| `card` | the dominant **light** background on the page — the site's own paper colour |
| `bg` | **derived**: `card` darkened ~5.5%, never taken from the page (see below) |
| `ink` | the darkest text colour that clears 4.5:1 on `card` |
| `ink2` | a real secondary text colour if the page has one, else `ink` mixed toward the canvas |
| `highlight` | the **hue** of the strongest accent (a button fill beats a button's text colour), pushed up to a light marker tone |
| `font.sans` | the heading font stack, plus a system fallback chain appended |
| `logo` | the first plausible header/logo `svg` or `img`, saved to `--logo-dir` |

Everything it considered is kept under `extractedFrom` in the file, so a wrong pick is a
one-line edit rather than a re-run.

**It is a starting point, not an answer.** Three things it gets wrong often enough to expect:

- **A site with a dark hero and a light body has two truths** and this picks the light one. If
  the brand is genuinely dark-first, swap `card`/`bg` for dark values by hand and re-check the
  contrast table — the design works dark, it just is not the default.
- **The accent may be a call-to-action colour that is not the brand colour** (a green "Buy" on
  an otherwise blue brand). Read `extractedFrom.accentCandidates` and pick.
- **The logo may be a wordmark in a raster image**, or the wrong image entirely. Ask for the
  real file; it is one message and always better than a 40px PNG scaled to 190px.

If the page needs a login or a cookie banner covers everything, run it `--headed`, clear the
banner yourself, and it reads the page you are looking at.

## C. Build one from a single colour

For the common case where there is no brand guide and no website — just "our colour is this
blue", or only a logo file:

```bash
node <skill>/scripts/make-brand.mjs --accent "#2f6df6" --name Acme --out ./brand.json
node <skill>/scripts/make-brand.mjs --from-logo ./assets/logo.svg --name Acme   # takes the accent off an SVG mark
```

It derives the whole palette from that one colour and **repairs itself until every bar below
passes**, so what it writes is applyable by construction.

| flag | |
| --- | --- |
| `--accent "#rrggbb"` | the brand colour. Required unless `--from-logo` is given |
| `--from-logo <file.svg>` | takes the most saturated colour out of an SVG mark. SVG only — a raster logo has to be sampled by eye, and it says so rather than guessing |
| `--mood tinted\|warm\|cool\|mono` | how the neutrals relate to the accent. Default `tinted` |
| `--dark` | a dark palette (card above canvas, light ink, a dark highlighter bar) |
| `--name` `--font` `--logo` `--language` | written straight through into `brand.json` |

**The neutrals are not grey.** They carry a fraction of the accent's hue, so the canvas, the
cards and the ink belong to the same family as the highlighter. Grey neutrals next to one
saturated bar are exactly what makes a recoloured template look recoloured — which is the failure
mode this exists to prevent, not a subtlety.

`--mood` picks how that lands: `tinted` puts the neutrals on the accent's own hue, `warm` and
`cool` move them to a fixed warm or cool hue regardless of the accent (use these when the accent
is loud enough that tinting everything with it reads as a colour cast), and `mono` makes them
truly neutral.

**It gets the relationships right, not the taste.** Whether that blue is the right blue is the
user's call — which is what the preview below is for. The file records what it did under
`generatedFrom`, including any repair it had to make, so nothing about the result is a mystery.

## D. The neutral default

The template ships a grey palette carrying no company's colours, and a placeholder mark. It is
fine for an internal clip where the point is the product, not the packaging. It is **not** fine
for anything a customer sees, and it is never a silent choice — if you ship the default, say so.

### What a brand token cannot change

Tokens carry colour, type and the mark. They do not carry the **form**, and it is worth being
exact about that rather than letting "unbranded" imply more than it does. These are design
decisions, identical in every video this skill produces, whoever it is for:

- the floating rounded window on a plain canvas
- the scrim-and-spotlight treatment, and the ring around the lit control
- the freeze-frame on every click, and the pulse that marks it

Give it your palette and the result is your colours in this design — not a neutral design in your
colours. That is usually what a caller wants, and it is a different promise. If it is not what
they want, the design is replaceable: `assets/template.html` holds the surfaces and
`references/design-system.md` the rules behind them. Replacing it is a supported route and a real
piece of work, not a setting.

---

## Deriving the tokens

Two rules do most of the work, and both are enforced by `apply-brand.mjs`:

**1. The canvas is derived from the card, never taken from the site.**
A site's page background *is* the card colour. Use it for both and the floating window and the
overlay cards lose their edge — the whole design stops reading. So the canvas is the card, a
shade darker, in the same hue family. If a brand insists the canvas *is* their exact page
colour, lighten the card instead; do not close the gap.

**2. The highlighter has to stay light, because the headline sits ON it.**
Take the accent's **hue**, cap its saturation, and raise its lightness to ~0.83 for the first
stop and ~0.92 for the second (`highlighterFromAccent()` in `brand-lib.mjs`). A saturated brand
accent used raw fails contrast against near-black ink, every time.

`ink2` is a real secondary colour if the brand has one, otherwise `ink` mixed ~42% toward the
canvas. `dot` is `ink` at 10% alpha — it is the canvas texture, not a colour of its own.

### The bars `apply-brand.mjs` refuses to cross

```
ink   on canvas          ≥ 4.5:1   (this design is drawn for ≥ 7:1)
ink   on card            ≥ 4.5:1
ink   on BOTH hl stops   ≥ 4.5:1   ← the one a raw brand accent fails
ink2  on canvas          ≥ 3:1
card against canvas      ≥ 1.06:1  and the card should be the LIGHTER of the two
```

It writes nothing when a bar fails. That is deliberate: a palette that fails here does not fail
visibly in a snapshot — it fails as "the cards look a bit flat", which survives review and ships.

## Type

- **The font must exist on the rendering machine.** The renderer is a real browser, so a
  webfont `@font-face`/`<link>` in the composition works, and a font installed on the system
  works. A name in `font.sans` that resolves to nothing silently falls back and every headline
  is subtly wrong. Verify on a **snapshot**, not by reading the CSS.
- **Always keep a real fallback chain** after the brand face. Both scripts append one.
- **Check the glyphs the brand face actually has.** Accented characters, `ß`, quotation marks
  and currency symbols are the usual gaps. `audit-composition.mjs` flags enclosed numerals
  (①②③) specifically, because they fall back to a box and survive every other check — but it
  cannot know what your face is missing, so read a snapshot of a card with the real copy on it.
- Headlines render at weight 800. A brand face with no bold weight will be synthesised by the
  browser and look it — pick the face with its real weights, or accept a system fallback.

## The logo

- **Get the real file.** Never redraw a mark, never approximate one from memory, never trace it
  from a screenshot. A wrong logo is the one defect every viewer notices.
- **SVG, preferably monochrome.** The template paints `.logo { color: var(--ink) }`, so a mark
  whose paths use `fill="currentColor"` picks up the ink colour and stays consistent across
  intro and outro. A full-colour mark also works — it just ignores the token.
- `logo.path` (relative to `brand.json`) or `logo.inline` (raw SVG markup). Raster files work
  and are emitted as an `<img>`; they will be scaled to 190px in the outro, so anything under
  ~400px wide will look soft.
- **Both slots are written from one source**, and each is named (`<!-- LOGO:START intro -->` /
  `outro`) so they can be sized independently.
- **A wordmark needs its own widths.** `.logo` sizes by WIDTH, and the defaults — 72px intro,
  190px outro — assume a roughly square mark. A 4:1 wordmark at 72px renders ~18px tall next to a
  128px title and reads as broken. Set them in `brand.json`:
  ```json
  "logo": { "path": "./assets/brand-logo.svg", "width": 260, "outroWidth": 520 }
  ```
  `preview-brand.mjs` measures the mark's own viewBox and warns when a wide one is still on the
  default width, so this is caught before a render rather than in review.
- If the mark is a **wordmark** (it spells the name), no title may repeat the name — a title
  names the *feature*. See `design-system.md` → Intro / outro.

## What does NOT get branded

- **The app footage.** It is the real product; that is the entire point of the window.
- **The scrim dim, the spotlight ring, the shadows.** They are neutral by design so they read
  the same on any palette. Tinting the dim to a brand colour makes the app look colour-shifted.
- **The dot grid's geometry.** 27px spacing, 1.5px dots. Only its colour is a token.

## Look at it before you apply it

```bash
node <skill>/scripts/preview-brand.mjs .        # -> brand-preview.html
```

Contrast maths says a palette is legible. It does not say the highlighter looks like a
highlighter, that the canvas reads as a surface rather than as dirt, or that the mark survives at
outro size. Those are eye questions, and until the composition exists there is nothing to
snapshot — so this draws the surfaces the design actually has, at true size, from the same values
`apply-brand.mjs` will write: the canvas, the floating window with a spotlight, a caption
card with a two-line headline on the highlighter, and the intro and outro cards.

**Show it to the user** — especially for a generated palette. It is one file they can open, and
"is this your brand?" is a question only they can answer.

## After applying

1. `node <skill>/scripts/audit-composition.mjs . --timeline` — glyph coverage, copy rules.
2. `node "$HYPERFRAMES_CLI" snapshot --at <a card beat>, <the intro>, <the outro>` and **read
   them**. The preview cannot tell you whether the type stack resolved on this machine.
3. Compare colours against `brand.json` on a **snapshot** only. A frame pulled out of an encoded
   render is darker by a small constant (measured `(-4,-3,-4)`), so it will never match a token.
