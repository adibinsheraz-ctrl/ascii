/**
 * Shape matcher: each image cell is compared against every glyph's
 * 4×8 region vector, then the top candidates are scored on the 12×24 patch.
 * Strong Sobel responses can override with directional line glyphs.
 */

import { linearToSrgb } from "./color";
import type { LinearImage } from "./buffer";
import { blueNoiseThreshold, floydSteinberg, orderedThreshold } from "./dither";
import { PATCH_H, PATCH_W, REGION_H, REGION_W } from "./glyphs";
import { cellEdge, directionalChar, type EdgeField } from "./sobel";
import type { AsciiCell, DitherMode, GlyphBank, GlyphDescriptor } from "./types";

const FINE_CANDIDATES = 12;

function regionSSD(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s / a.length;
}

function patchSSD(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s / n;
}

const scratchA = new Float32Array(PATCH_W * PATCH_H);
const scratchB = new Float32Array(PATCH_W * PATCH_H);

function normalizeInto(src: Float32Array, mean: number, std: number, out: Float32Array): void {
  const inv = std > 1e-4 ? 1 / std : 1;
  for (let i = 0; i < src.length; i++) out[i] = (src[i] - mean) * inv;
}

export type CellSample = {
  mean: number;
  std: number;
  regions: Float32Array;
  patch: Float32Array;
  r: number;
  g: number;
  b: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export function sampleCell(img: LinearImage, x0: number, y0: number, x1: number, y1: number): CellSample {
  const { width: w, height: h, data } = img;
  const xa = Math.max(0, Math.min(w, x0));
  const xb = Math.max(xa + 1e-3, Math.min(w, x1));
  const ya = Math.max(0, Math.min(h, y0));
  const yb = Math.max(ya + 1e-3, Math.min(h, y1));

  const patch = new Float32Array(PATCH_W * PATCH_H);
  const regions = new Float32Array(REGION_W * REGION_H);
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let ySum = 0;
  let count = 0;

  const cellW = xb - xa;
  const cellH = yb - ya;

  for (let py = 0; py < PATCH_H; py++) {
    for (let px = 0; px < PATCH_W; px++) {
      const sx0 = xa + (px / PATCH_W) * cellW;
      const sy0 = ya + (py / PATCH_H) * cellH;
      const sx1 = xa + ((px + 1) / PATCH_W) * cellW;
      const sy1 = ya + ((py + 1) / PATCH_H) * cellH;
      const ix0 = Math.max(0, Math.floor(sx0));
      const iy0 = Math.max(0, Math.floor(sy0));
      const ix1 = Math.min(w, Math.ceil(sx1));
      const iy1 = Math.min(h, Math.ceil(sy1));
      let accY = 0;
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let n = 0;
      const stepX = Math.max(1, Math.floor((ix1 - ix0) / 4));
      const stepY = Math.max(1, Math.floor((iy1 - iy0) / 4));
      for (let y = iy0; y < iy1; y += stepY) {
        for (let x = ix0; x < ix1; x += stepX) {
          const i = (y * w + x) * 4;
          accR += data[i];
          accG += data[i + 1];
          accB += data[i + 2];
          accY += data[i + 3];
          n++;
        }
      }
      if (n === 0) {
        const cx = Math.max(0, Math.min(w - 1, Math.floor((sx0 + sx1) * 0.5)));
        const cy = Math.max(0, Math.min(h - 1, Math.floor((sy0 + sy1) * 0.5)));
        const i = (cy * w + cx) * 4;
        accR = data[i];
        accG = data[i + 1];
        accB = data[i + 2];
        accY = data[i + 3];
        n = 1;
      }
      const inv = n ? 1 / n : 0;
      patch[py * PATCH_W + px] = accY * inv;
      rSum += accR * inv;
      gSum += accG * inv;
      bSum += accB * inv;
      ySum += accY * inv;
      count++;
    }
  }

  const mean = count ? ySum / count : 0;
  let varSum = 0;
  for (let i = 0; i < patch.length; i++) {
    const d = patch[i] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / patch.length);

  const rw = PATCH_W / REGION_W;
  const rh = PATCH_H / REGION_H;
  for (let ry = 0; ry < REGION_H; ry++) {
    for (let rx = 0; rx < REGION_W; rx++) {
      let acc = 0;
      let n = 0;
      const px0 = Math.floor(rx * rw);
      const py0 = Math.floor(ry * rh);
      const px1 = Math.floor((rx + 1) * rw);
      const py1 = Math.floor((ry + 1) * rh);
      for (let y = py0; y < py1; y++) {
        for (let x = px0; x < px1; x++) {
          acc += patch[y * PATCH_W + x];
          n++;
        }
      }
      regions[ry * REGION_W + rx] = n ? acc / n : 0;
    }
  }

  const invC = count ? 1 / count : 0;
  return {
    mean,
    std,
    regions,
    patch,
    r: rSum * invC,
    g: gSum * invC,
    b: bSum * invC,
    x0: xa,
    y0: ya,
    x1: xb,
    y1: yb,
  };
}

function scoreGlyph(
  sample: CellSample,
  glyph: GlyphDescriptor,
  faceBoost: number,
  targetMean: number,
): number {
  const meanTerm = (targetMean - glyph.mean) ** 2;
  const regionTerm = regionSSD(sample.regions, glyph.regions);
  normalizeInto(sample.patch, sample.mean, sample.std, scratchA);
  normalizeInto(glyph.patch, glyph.mean, glyph.std, scratchB);
  const structure = patchSSD(scratchA, scratchB);

  // In flat/low-contrast cells, suppress structure matching to prevent noise amplification
  const contrastFactor = Math.min(1, Math.max(0, (sample.std - 0.01) / 0.06));
  const effStruct = structure * contrastFactor + (1 - contrastFactor) * regionTerm;

  const wMean = 0.40 - 0.12 * faceBoost;
  const wRegion = 0.32;
  const wStruct = 0.28 + 0.12 * faceBoost;
  return wMean * meanTerm + wRegion * regionTerm + wStruct * effStruct;
}

function nearestByMean(glyphs: GlyphDescriptor[], target: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < glyphs.length; i++) {
    const d = Math.abs(glyphs[i].mean - target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function matchCell(
  sample: CellSample,
  bank: GlyphBank,
  edge: EdgeField | null,
  edgeStrength: number,
  faceBoost: number,
  forcedMean?: number,
): number {
  const glyphs = bank.glyphs;
  const targetMean = forcedMean ?? sample.mean;
  const coarse: { i: number; s: number }[] = [];
  const wMean = 0.5 - 0.1 * faceBoost;
  const wRegion = 0.5 + 0.1 * faceBoost;
  for (let i = 0; i < glyphs.length; i++) {
    const meanPenalty = (glyphs[i].mean - targetMean) ** 2;
    if (meanPenalty > 0.16 && glyphs.length > 12) continue;
    const regionTerm = regionSSD(sample.regions, glyphs[i].regions);
    coarse.push({ i, s: wMean * meanPenalty + wRegion * regionTerm });
  }
  if (coarse.length === 0) return nearestByMean(glyphs, targetMean);
  coarse.sort((a, b) => a.s - b.s);
  const top = coarse.slice(0, FINE_CANDIDATES);
  let best = top[0].i;
  let bestS = Infinity;
  for (const c of top) {
    const s = scoreGlyph(sample, glyphs[c.i], faceBoost, targetMean) + (glyphs[c.i].mean - targetMean) ** 2 * 0.12;
    if (s < bestS) {
      bestS = s;
      best = c.i;
    }
  }

  if (edge && edgeStrength > 0.02) {
    const e = cellEdge(edge, sample.x0, sample.y0, sample.x1, sample.y1);
    const mag = e.mag;
    const thresh = 0.2 + (1 - edgeStrength) * 0.28 + faceBoost * 0.14;
    if (mag > thresh) {
      const ch = directionalChar(e.angle);
      let dirIndex = glyphs.findIndex((g) => g.char === ch);
      if (dirIndex < 0 && ch === "-") dirIndex = glyphs.findIndex((g) => g.char === "_");
      if (dirIndex >= 0) {
        const blend = Math.min(1, (mag - thresh) / 0.4) * edgeStrength * (1 - faceBoost * 0.55);
        if (blend > 0.68 && faceBoost < 0.32) best = dirIndex;
        else {
          const dirScore = scoreGlyph(sample, glyphs[dirIndex], faceBoost, targetMean) * (1 - blend);
          if (dirScore < bestS) best = dirIndex;
        }
      }
    }
  }

  return best;
}

export function matchGrid(params: {
  img: LinearImage;
  bank: GlyphBank;
  cols: number;
  rows: number;
  edge: EdgeField | null;
  edgeStrength: number;
  dither: DitherMode;
  faceWeights?: Float32Array;
}): AsciiCell[] {
  const { img, bank, cols, rows, edge, edgeStrength, dither, faceWeights } = params;
  const samples: CellSample[] = new Array(cols * rows);
  const luma = new Float32Array(cols * rows);
  const face = new Float32Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = (col / cols) * img.width;
      const x1 = ((col + 1) / cols) * img.width;
      const y0 = (row / rows) * img.height;
      const y1 = ((row + 1) / rows) * img.height;
      const s = sampleCell(img, x0, y0, x1, y1);
      const i = row * cols + col;
      samples[i] = s;
      luma[i] = s.mean;
      if (faceWeights) {
        const cx = Math.min(img.width - 1, ((x0 + x1) / 2) | 0);
        const cy = Math.min(img.height - 1, ((y0 + y1) / 2) | 0);
        face[i] = faceWeights[cy * img.width + cx];
      }
    }
  }

  const means = bank.glyphs.map((g) => g.mean);
  const quantize = (v: number) => {
    let best = means[0];
    let bd = Infinity;
    for (const m of means) {
      const d = Math.abs(m - v);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  };

  let target: Float32Array = luma;
  if (dither === "floyd-steinberg") {
    const dithered = new Float32Array(luma.length);
    dithered.set(floydSteinberg(luma, cols, rows, (v) => quantize(v)));
    target = dithered;
  } else if (dither === "ordered" || dither === "blue-noise") {
    target = new Float32Array(luma.length);
    for (let i = 0; i < luma.length; i++) {
      const x = i % cols;
      const y = (i / cols) | 0;
      const n = dither === "ordered" ? orderedThreshold(x, y) : blueNoiseThreshold(x, y);
      target[i] = quantize(Math.max(0, Math.min(1, luma[i] + n)));
    }
  }

  const cells: AsciiCell[] = new Array(cols * rows);
  for (let i = 0; i < samples.length; i++) {
    const idx = matchCell(
      samples[i],
      bank,
      edge,
      edgeStrength,
      face[i],
      dither === "none" ? undefined : target[i],
    );
    const g = bank.glyphs[idx];
    cells[i] = {
      glyphIndex: idx,
      char: g.char,
      luma: samples[i].mean,
      r: linearToSrgb(samples[i].r),
      g: linearToSrgb(samples[i].g),
      b: linearToSrgb(samples[i].b),
    };
  }
  return cells;
}
