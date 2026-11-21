/**
 * Glyph bank: rasterize every ramp character, extract shape vectors,
 * build a 2×2 luminance LUT for the live engine.
 */

import { srgbLuma } from "./color";
import { RAMPS, type GlyphBank, type GlyphDescriptor, type RampPreset } from "./types";

export const FONT_URL = "/fonts/JetBrainsMono-Regular.woff2";
export const FONT_FAMILY = "JetBrains Mono ASCII";

export const PATCH_W = 12;
export const PATCH_H = 24;
export const REGION_W = 4;
export const REGION_H = 8;

const LUT_LEVELS = 8;

let fontReady: Promise<FontFace> | null = null;

export function loadAsciiFont(): Promise<FontFace> {
  if (!fontReady) {
    fontReady = (async () => {
      const face = new FontFace(FONT_FAMILY, `url(${FONT_URL})`, {
        style: "normal",
        weight: "400",
      });
      const loaded = await face.load();
      const fonts =
        typeof document !== "undefined" && document.fonts
          ? document.fonts
          : typeof self !== "undefined" && "fonts" in self
            ? (self as unknown as { fonts: FontFaceSet }).fonts
            : null;
      if (fonts) {
        fonts.add(loaded);
        await fonts.ready;
      }
      return loaded;
    })();
  }
  return fontReady;
}

export function resetFontCache(): void {
  fontReady = null;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas context unavailable");
  return ctx as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
}

export function rampCharacters(preset: RampPreset, custom: string): string {
  const raw = custom.trim().length >= 2 ? custom : RAMPS[preset];
  const used = new Set<string>();
  let out = "";
  for (const ch of raw) {
    if (ch === "\n" || ch === "\r") continue;
    if (used.has(ch)) continue;
    used.add(ch);
    out += ch;
  }
  if (!out.includes(" ")) out = " " + out;
  return out.length >= 2 ? out : RAMPS.classic;
}

function patchFromImage(data: Uint8ClampedArray, w: number, h: number): {
  mean: number;
  std: number;
  regions: Float32Array;
  patch: Float32Array;
  orientation: number;
  edgeEnergy: number;
} {
  const patch = new Float32Array(PATCH_W * PATCH_H);
  const stepX = w / PATCH_W;
  const stepY = h / PATCH_H;
  let sum = 0;
  for (let py = 0; py < PATCH_H; py++) {
    for (let px = 0; px < PATCH_W; px++) {
      let acc = 0;
      let n = 0;
      const x0 = Math.floor(px * stepX);
      const y0 = Math.floor(py * stepY);
      const x1 = Math.max(x0 + 1, Math.floor((px + 1) * stepX));
      const y1 = Math.max(y0 + 1, Math.floor((py + 1) * stepY));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          acc += srgbLuma(data[i], data[i + 1], data[i + 2]);
          n++;
        }
      }
      const v = n ? acc / n : 0;
      patch[py * PATCH_W + px] = v;
      sum += v;
    }
  }
  const mean = sum / patch.length;
  let varSum = 0;
  for (let i = 0; i < patch.length; i++) {
    const d = patch[i] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / patch.length);

  const regions = new Float32Array(REGION_W * REGION_H);
  const rw = PATCH_W / REGION_W;
  const rh = PATCH_H / REGION_H;
  for (let ry = 0; ry < REGION_H; ry++) {
    for (let rx = 0; rx < REGION_W; rx++) {
      let acc = 0;
      let n = 0;
      const x0 = Math.floor(rx * rw);
      const y0 = Math.floor(ry * rh);
      const x1 = Math.floor((rx + 1) * rw);
      const y1 = Math.floor((ry + 1) * rh);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          acc += patch[y * PATCH_W + x];
          n++;
        }
      }
      regions[ry * REGION_W + rx] = n ? acc / n : 0;
    }
  }

  let gx = 0;
  let gy = 0;
  for (let y = 1; y < PATCH_H - 1; y++) {
    for (let x = 1; x < PATCH_W - 1; x++) {
      const l = patch[y * PATCH_W + x - 1];
      const r = patch[y * PATCH_W + x + 1];
      const u = patch[(y - 1) * PATCH_W + x];
      const d = patch[(y + 1) * PATCH_W + x];
      gx += r - l;
      gy += d - u;
    }
  }
  const edgeEnergy = Math.hypot(gx, gy) / (PATCH_W * PATCH_H);
  const orientation = edgeEnergy > 0.02 ? Math.atan2(gy, gx) : -1;

  return { mean, std, regions, patch, orientation, edgeEnergy };
}

function buildLiveLut(glyphs: GlyphDescriptor[]): Uint16Array {
  const levels = LUT_LEVELS;
  const lut = new Uint16Array(levels ** 4);
  const tmp = new Float32Array(4);
  for (let a = 0; a < levels; a++) {
    for (let b = 0; b < levels; b++) {
      for (let c = 0; c < levels; c++) {
        for (let d = 0; d < levels; d++) {
          tmp[0] = (a + 0.5) / levels;
          tmp[1] = (b + 0.5) / levels;
          tmp[2] = (c + 0.5) / levels;
          tmp[3] = (d + 0.5) / levels;
          const mean = (tmp[0] + tmp[1] + tmp[2] + tmp[3]) / 4;
          let best = 0;
          let bestScore = Infinity;
          for (let g = 0; g < glyphs.length; g++) {
            const glyph = glyphs[g];
            const r = glyph.regions;
            const tl = (r[0] + r[1] + r[4] + r[5]) / 4;
            const tr = (r[2] + r[3] + r[6] + r[7]) / 4;
            const bl = (r[24] + r[25] + r[28] + r[29]) / 4;
            const br = (r[26] + r[27] + r[30] + r[31]) / 4;
            const ds =
              (tmp[0] - tl) ** 2 +
              (tmp[1] - tr) ** 2 +
              (tmp[2] - bl) ** 2 +
              (tmp[3] - br) ** 2;
            const score = ds * 0.7 + (mean - glyph.mean) ** 2 * 0.3;
            if (score < bestScore) {
              bestScore = score;
              best = g;
            }
          }
          lut[((a * levels + b) * levels + c) * levels + d] = best;
        }
      }
    }
  }
  return lut;
}

export async function createGlyphBank(
  preset: RampPreset,
  customRamp: string,
  atlasScale = 48,
): Promise<GlyphBank> {
  await loadAsciiFont();
  const chars = [...rampCharacters(preset, customRamp)];
  const probe = makeCanvas(64, 128);
  const pctx = ctx2d(probe);
  pctx.font = `${atlasScale}px "${FONT_FAMILY}"`;
  pctx.textBaseline = "alphabetic";
  pctx.textAlign = "left";
  const typedProbe = pctx as CanvasRenderingContext2D & { fontKerning?: string };
  if ("fontKerning" in typedProbe) typedProbe.fontKerning = "none";
  const metrics = pctx.measureText("M");
  const cellWidth = Math.max(8, Math.ceil(metrics.width));
  const ascent = metrics.fontBoundingBoxAscent || atlasScale * 0.8;
  const descent = metrics.fontBoundingBoxDescent || atlasScale * 0.25;
  const cellHeight = Math.max(12, Math.ceil(ascent + descent));

  const atlasCols = Math.max(8, Math.ceil(Math.sqrt(chars.length)));
  const atlasRows = Math.ceil(chars.length / atlasCols);
  const atlas = makeCanvas(atlasCols * cellWidth, atlasRows * cellHeight);
  const actx = ctx2d(atlas);
  actx.clearRect(0, 0, atlas.width, atlas.height);
  actx.font = `${atlasScale}px "${FONT_FAMILY}"`;
  actx.textBaseline = "alphabetic";
  actx.textAlign = "left";
  actx.fillStyle = "#ffffff";
  actx.imageSmoothingEnabled = false;

  const scratch = makeCanvas(cellWidth, cellHeight);
  const sctx = ctx2d(scratch);

  const glyphs: GlyphDescriptor[] = [];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const col = i % atlasCols;
    const row = (i / atlasCols) | 0;
    const ax = col * cellWidth;
    const ay = row * cellHeight;
    actx.fillText(ch, ax, ay + ascent);

    sctx.clearRect(0, 0, cellWidth, cellHeight);
    sctx.fillStyle = "#000000";
    sctx.fillRect(0, 0, cellWidth, cellHeight);
    sctx.font = `${atlasScale}px "${FONT_FAMILY}"`;
    sctx.textBaseline = "alphabetic";
    sctx.fillStyle = "#ffffff";
    sctx.fillText(ch, 0, ascent);
    const img = sctx.getImageData(0, 0, cellWidth, cellHeight);
    const shape = patchFromImage(img.data, cellWidth, cellHeight);
    glyphs.push({
      char: ch,
      mean: shape.mean,
      std: shape.std,
      regions: shape.regions,
      patch: shape.patch,
      orientation: shape.orientation,
      edgeEnergy: shape.edgeEnergy,
    });
  }

  return {
    fontFamily: FONT_FAMILY,
    metrics: {
      cellWidth,
      cellHeight,
      aspect: cellWidth / cellHeight,
    },
    glyphs,
    atlas,
    atlasCols,
    atlasCellW: cellWidth,
    atlasCellH: cellHeight,
    liveLut: buildLiveLut(glyphs),
    lutLevels: LUT_LEVELS,
  };
}

export function lookupLive(
  bank: GlyphBank,
  tl: number,
  tr: number,
  bl: number,
  br: number,
): number {
  const L = bank.lutLevels;
  const q = (v: number) => Math.max(0, Math.min(L - 1, (v * L) | 0));
  return bank.liveLut[((q(tl) * L + q(tr)) * L + q(bl)) * L + q(br)];
}
