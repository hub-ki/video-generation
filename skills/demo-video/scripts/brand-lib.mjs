// Color maths shared by extract-brand.mjs and apply-brand.mjs.
//
// Everything here works in sRGB and returns hex, because the composition's tokens are hex and
// a snapshot is authored RGB 1:1 — so a token you can compare against a measured pixel is worth
// more than a wider gamut we would only have to convert back.

export function parseColor(input) {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) {
    const digits = hex[1];
    const expand = (part) => parseInt(part.length === 1 ? part + part : part, 16);
    if (digits.length <= 4) {
      return {
        red: expand(digits[0]), green: expand(digits[1]), blue: expand(digits[2]),
        alpha: digits.length === 4 ? expand(digits[3]) / 255 : 1,
      };
    }
    return {
      red: expand(digits.slice(0, 2)), green: expand(digits.slice(2, 4)), blue: expand(digits.slice(4, 6)),
      alpha: digits.length === 8 ? expand(digits.slice(6, 8)) / 255 : 1,
    };
  }
  const functional = value.match(/^rgba?\(([^)]+)\)$/);
  if (functional) {
    const parts = functional[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channel = (part) => (part.endsWith("%") ? Math.round((parseFloat(part) / 100) * 255) : parseInt(part, 10));
    const alphaPart = parts[3];
    return {
      red: channel(parts[0]), green: channel(parts[1]), blue: channel(parts[2]),
      alpha: alphaPart === undefined ? 1 : alphaPart.endsWith("%") ? parseFloat(alphaPart) / 100 : parseFloat(alphaPart),
    };
  }
  return null;
}

export function toHex({ red, green, blue }) {
  const part = (channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0");
  return `#${part(red)}${part(green)}${part(blue)}`;
}

export function relativeLuminance(color) {
  const channel = (raw) => {
    const value = raw / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue);
}

export function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function toHsl(color) {
  const red = color.red / 255, green = color.green / 255, blue = color.blue / 255;
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return { hue: 0, saturation: 0, lightness };
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return { hue, saturation, lightness };
}

export function fromHsl({ hue, saturation, lightness }) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = lightness - chroma / 2;
  const sector = Math.floor(((hue % 360) + 360) % 360 / 60);
  const table = [
    [chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary],
    [0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary],
  ][sector];
  return { red: (table[0] + offset) * 255, green: (table[1] + offset) * 255, blue: (table[2] + offset) * 255, alpha: 1 };
}

export function withLightness(color, lightness) {
  const hsl = toHsl(color);
  return fromHsl({ ...hsl, lightness: Math.max(0, Math.min(1, lightness)) });
}

export function mix(first, second, weight) {
  return {
    red: first.red * (1 - weight) + second.red * weight,
    green: first.green * (1 - weight) + second.green * weight,
    blue: first.blue * (1 - weight) + second.blue * weight,
    alpha: 1,
  };
}

// The canvas has to sit DARKER than the card, or the floating window dissolves into the page
// behind it and the whole design stops reading (design-system.md → The window). So the canvas
// is always derived from the card rather than taken from the site: a site's own page background
// is usually the card colour, and using it for both makes them identical.
export function canvasFromCard(card, drop = 0.055) {
  const hsl = toHsl(card);
  return fromHsl({ ...hsl, lightness: Math.max(0, hsl.lightness - drop) });
}

// A highlighter has to clear the ink that sits ON it. On a light palette that means pushing a
// saturated brand accent UP in lightness (it almost never clears near-black ink as it ships); on
// a dark palette the invariant is the same ratio in the other direction, so the bar goes dark and
// the ink stays light. Either way the accent contributes its HUE, not its lightness.
export function highlighterFromAccent(accent, { dark = false } = {}) {
  const hsl = toHsl(accent);
  const saturation = Math.min(hsl.saturation, 0.62);
  const [first, second] = dark ? [0.24, 0.17] : [0.83, 0.92];
  return [
    toHex(fromHsl({ hue: hsl.hue, saturation, lightness: first })),
    toHex(fromHsl({ hue: hsl.hue, saturation: saturation * 0.72, lightness: second })),
  ];
}

// The bars this design actually depends on, in one place so the generator and the applier cannot
// drift apart. Headline ink sits ON the highlighter, card ink sits on the card, and the canvas
// has to stay distinguishable from the card or the floating window — the whole point of the look
// — disappears into the background.
export function paletteChecks({ bg, ink, ink2, card, highlight }) {
  const rows = [
    { label: "ink on canvas", ratio: contrastRatio(ink, bg), floor: 4.5, want: 7 },
    { label: "ink on card", ratio: contrastRatio(ink, card), floor: 4.5, want: 7 },
    { label: "ink on highlight (stop 1)", ratio: contrastRatio(ink, highlight[0]), floor: 4.5, want: 7 },
    { label: "ink on highlight (stop 2)", ratio: contrastRatio(ink, highlight[1]), floor: 4.5, want: 7 },
    { label: "secondary ink on canvas", ratio: contrastRatio(ink2, bg), floor: 3, want: 4.5 },
  ].map((row) => ({
    ...row,
    verdict: row.ratio < row.floor ? "FAIL" : row.ratio < row.want ? "thin" : "ok",
  }));

  const separation = contrastRatio(card, bg);
  rows.push({
    label: "card against canvas",
    ratio: separation,
    floor: 1.06,
    want: 1.06,
    verdict: separation < 1.06 ? "FAIL" : separation > 1.6 ? "loud" : "ok",
  });

  const errors = [];
  const warnings = [];
  for (const row of rows) {
    if (row.label === "card against canvas") continue;
    if (row.verdict === "FAIL") errors.push(`${row.label}: ${row.ratio.toFixed(2)}:1, needs ≥ ${row.floor}:1`);
    if (row.verdict === "thin") {
      warnings.push(`${row.label}: ${row.ratio.toFixed(2)}:1 — readable, below the ${row.want}:1 this design is drawn for`);
    }
  }
  if (separation < 1.06) {
    errors.push("card and canvas are the same tone — the floating window and the overlay cards will have no edge");
  } else if (separation > 1.6) {
    warnings.push("card is much brighter than the canvas — the window will read as a cut-out rather than as paper on a desk");
  }
  if (relativeLuminance(card) <= relativeLuminance(bg)) {
    warnings.push("the canvas is lighter than the card; this design assumes a canvas slightly DARKER than the window it holds");
  }

  return { rows, errors, warnings };
}

export function printPaletteTable(rows) {
  console.log("  check                        ratio   verdict");
  for (const row of rows) {
    console.log(`  ${row.label.padEnd(28)} ${row.ratio.toFixed(2).padStart(5)}   ${row.verdict}`);
  }
}

export function rgbaString(color, alpha) {
  return `rgba(${Math.round(color.red)},${Math.round(color.green)},${Math.round(color.blue)},${alpha})`;
}

// Put our class/style on someone else's <svg>. A logo exported from a design tool routinely
// carries its own `class` or `style`, and simply prepending ours produces a duplicate attribute:
// the parser keeps whichever comes first, so it happens to work until the day the file is saved
// with the attributes in the other order and the outro mark silently changes size.
export function injectSvgAttributes(markup, { className, style }) {
  const openingTag = markup.match(/^<svg\b[^>]*>/i);
  if (!openingTag) return markup;
  const stripped = openingTag[0]
    .replace(/\s+class\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+style\s*=\s*"[^"]*"/gi, "");
  const attributes = `class="${className}"${style ? ` style="${style}"` : ""}`;
  return stripped.replace(/^<svg\b/i, `<svg ${attributes}`) + markup.slice(openingTag[0].length);
}
