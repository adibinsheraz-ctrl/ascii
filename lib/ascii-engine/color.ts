/** Linear-light color science for conversion and palettes. */

export function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(s * 255)));
}

export function linearLuma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function srgbLuma(r: number, g: number, b: number): number {
  return linearLuma(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
}

export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const n =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const v = Number.parseInt(n.slice(0, 6), 16);
  if (Number.isNaN(v)) return [255, 255, 255];
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
  else if (max === G) h = ((B - R) / d + 2) / 6;
  else h = ((R - G) / d + 4) / 6;
  return [h, s, l];
}

export function hslToRgb(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let T = t;
    if (T < 0) T += 1;
    if (T > 1) T -= 1;
    if (T < 1 / 6) return p + (q - p) * 6 * T;
    if (T < 1 / 2) return q;
    if (T < 2 / 3) return p + (q - p) * (2 / 3 - T) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

/** Slight saturation lift so full-color glyphs feel printed, not washed. */
export function boostSaturation(
  r: number,
  g: number,
  b: number,
  amount = 1.18,
): [number, number, number] {
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToRgb(h, Math.min(1, s * amount), l);
}

export function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export const PALETTES = {
  mono: [236, 232, 223] as [number, number, number],
  phosphor: [102, 255, 158] as [number, number, number],
  amber: [255, 176, 72] as [number, number, number],
  ice: [164, 220, 255] as [number, number, number],
};

export const BACKGROUNDS = {
  black: [10, 10, 10] as [number, number, number],
  charcoal: [18, 18, 20] as [number, number, number],
  transparent: [0, 0, 0] as [number, number, number],
};

export function glyphColor(
  mode: string,
  luma: number,
  srcR: number,
  srcG: number,
  srcB: number,
  customAccent: string,
  duotoneLow: string,
  duotoneHigh: string,
): [number, number, number] {
  const lift = (rgb: [number, number, number]): [number, number, number] => {
    const t = Math.max(0, Math.min(1, luma));
    const k = 0.72 + 0.28 * t;
    return [
      Math.round(rgb[0] * k),
      Math.round(rgb[1] * k),
      Math.round(rgb[2] * k),
    ];
  };

  switch (mode) {
    case "phosphor":
      return lift(PALETTES.phosphor);
    case "amber":
      return lift(PALETTES.amber);
    case "ice":
      return lift(PALETTES.ice);
    case "custom":
      return lift(parseHex(customAccent));
    case "full":
      return boostSaturation(srcR, srcG, srcB);
    case "duotone":
      return lerpColor(parseHex(duotoneLow), parseHex(duotoneHigh), luma);
    case "gradient":
      return lerpColor(parseHex(duotoneLow), parseHex(duotoneHigh), luma);
    default:
      return lift(PALETTES.mono);
  }
}
