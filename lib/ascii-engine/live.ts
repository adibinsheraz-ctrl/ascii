/**
 * Live engine: LUT shape matching, temporal smoothing, hysteresis.
 * Designed for 30fps+ on mid-range phones.
 */

import { srgbToLinear, linearLuma } from "./color";
import { lookupLive } from "./glyphs";
import type { AsciiCell, AsciiGrid, AsciiSettings, GlyphBank } from "./types";
import { studioRows } from "./studio";

export type LiveState = {
  luma: Float32Array;
  glyph: Int16Array;
  committed: Float32Array;
  cols: number;
  rows: number;
};

export function createLiveState(): LiveState {
  return {
    luma: new Float32Array(0),
    glyph: new Int16Array(0),
    committed: new Float32Array(0),
    cols: 0,
    rows: 0,
  };
}

function ensureState(state: LiveState, cols: number, rows: number): void {
  const n = cols * rows;
  if (state.luma.length !== n) {
    state.luma = new Float32Array(n);
    state.glyph = new Int16Array(n);
    state.committed = new Float32Array(n);
    state.glyph.fill(-1);
  }
  state.cols = cols;
  state.rows = rows;
}

function autoExposureContrast(pixels: Uint8ClampedArray): { gain: number; offset: number; gamma: number } {
  let min = 1;
  let max = 0;
  let sum = 0;
  const step = 16;
  let n = 0;
  for (let i = 0; i < pixels.length; i += 4 * step) {
    const y = linearLuma(
      srgbToLinear(pixels[i]),
      srgbToLinear(pixels[i + 1]),
      srgbToLinear(pixels[i + 2]),
    );
    if (y < min) min = y;
    if (y > max) max = y;
    sum += y;
    n++;
  }
  const mean = n ? sum / n : 0.5;
  const span = Math.max(0.08, max - min);
  const gain = 0.92 / span;
  const offset = 0.04 - min * gain;
  const gamma = mean < 0.22 ? 0.85 : mean > 0.72 ? 1.08 : 0.95;
  return { gain, offset, gamma };
}

export function convertLive(
  frame: ImageData,
  bank: GlyphBank,
  settings: AsciiSettings,
  state: LiveState,
  background: AsciiGrid["background"] = "black",
): AsciiGrid {
  const cols = Math.max(40, Math.min(240, Math.round(settings.columns)));
  const rows = studioRows(frame.width, frame.height, cols, bank.metrics.aspect);
  ensureState(state, cols, rows);

  const { data, width, height } = frame;
  const { gain, offset, gamma } = autoExposureContrast(data);
  const contrast = settings.contrast;
  const brightness = settings.brightness;
  const invert = settings.invert;
  const hysteresis = 0.045;
  const smooth = 0.38;

  const cells: AsciiCell[] = new Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = ((col / cols) * width) | 0;
      const x1 = Math.max(x0 + 1, (((col + 1) / cols) * width) | 0);
      const y0 = ((row / rows) * height) | 0;
      const y1 = Math.max(y0 + 1, (((row + 1) / rows) * height) | 0);
      const mx = (x0 + x1) >> 1;
      const my = (y0 + y1) >> 1;
      const midX = Math.max(x0, Math.min(width - 1, mx));
      const midY = Math.max(y0, Math.min(height - 1, my));

      const sampleQuad = (sx0: number, sy0: number, sx1: number, sy1: number) => {
        let ySum = 0;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let n = 0;
        const stepX = Math.max(1, ((sx1 - sx0) / 3) | 0);
        const stepY = Math.max(1, ((sy1 - sy0) / 3) | 0);
        for (let y = sy0; y < sy1; y += stepY) {
          for (let x = sx0; x < sx1; x += stepX) {
            const i = (y * width + x) * 4;
            const r = srgbToLinear(data[i]);
            const g = srgbToLinear(data[i + 1]);
            const b = srgbToLinear(data[i + 2]);
            ySum += linearLuma(r, g, b);
            rSum += data[i];
            gSum += data[i + 1];
            bSum += data[i + 2];
            n++;
          }
        }
        const inv = n ? 1 / n : 0;
        return { y: ySum * inv, r: rSum * inv, g: gSum * inv, b: bSum * inv };
      };

      const tl = sampleQuad(x0, y0, midX, midY);
      const tr = sampleQuad(midX, y0, x1, midY);
      const bl2 = sampleQuad(x0, midY, midX, y1);
      const br = sampleQuad(midX, midY, x1, y1);

      const tone = (y: number) => {
        let v = y * gain + offset;
        v = (v - 0.5) * contrast + 0.5 + brightness;
        v = Math.max(0, Math.min(1, v));
        v = v ** gamma;
        return invert ? 1 - v : v;
      };

      const q1 = tone(tl.y);
      const q2 = tone(tr.y);
      const q3 = tone(bl2.y);
      const q4 = tone(br.y);
      const mean = (q1 + q2 + q3 + q4) * 0.25;
      const i = row * cols + col;
      const mixed = state.glyph[i] < 0 ? mean : state.luma[i] * (1 - smooth) + mean * smooth;
      state.luma[i] = mixed;

      let gi = state.glyph[i];
      if (gi < 0 || Math.abs(mixed - state.committed[i]) > hysteresis) {
        gi = lookupLive(bank, q1, q2, q3, q4);
        if (Math.abs(bank.glyphs[gi].mean - mixed) > 0.22) {
          let best = gi;
          let bd = Infinity;
          for (let g = 0; g < bank.glyphs.length; g++) {
            const d = Math.abs(bank.glyphs[g].mean - mixed);
            if (d < bd) {
              bd = d;
              best = g;
            }
          }
          gi = best;
        }
        state.glyph[i] = gi;
        state.committed[i] = mixed;
      }

      const g = bank.glyphs[gi];
      cells[i] = {
        glyphIndex: gi,
        char: g.char,
        luma: mixed,
        r: Math.round((tl.r + tr.r + bl2.r + br.r) * 0.25),
        g: Math.round((tl.g + tr.g + bl2.g + br.g) * 0.25),
        b: Math.round((tl.b + tr.b + bl2.b + br.b) * 0.25),
      };
    }
  }

  return {
    cols,
    rows,
    cells,
    metrics: bank.metrics,
    background,
  };
}
