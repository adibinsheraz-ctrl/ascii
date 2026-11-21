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
  const cols = Math.max(30, Math.min(360, Math.round(settings.columns)));
  const rows = studioRows(frame.width, frame.height, cols, bank.metrics.aspect);
  ensureState(state, cols, rows);

  const { data, width, height } = frame;
  const contrast = settings.contrast;
  const brightness = settings.brightness;
  const gamma = settings.gamma;
  const invert = settings.invert;
  const maxG = bank.glyphs.length - 1;

  const cells: AsciiCell[] = new Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = ((col / cols) * width) | 0;
      const x1 = Math.max(x0 + 1, (((col + 1) / cols) * width) | 0);
      const y0 = ((row / rows) * height) | 0;
      const y1 = Math.max(y0 + 1, (((row + 1) / rows) * height) | 0);

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;

      // 4-tap multi-tap sampling matching the WebGL shader
      const dx = (x1 - x0) * 0.22;
      const dy = (y1 - y0) * 0.22;
      const midX = (x0 + x1) * 0.5;
      const midY = (y0 + y1) * 0.5;
      const taps = [
        [midX - dx, midY - dy],
        [midX + dx, midY - dy],
        [midX - dx, midY + dy],
        [midX + dx, midY + dy],
      ];

      for (const [tx, ty] of taps) {
        const x = Math.max(0, Math.min(width - 1, tx | 0));
        const y = Math.max(0, Math.min(height - 1, ty | 0));
        const idx = (y * width + x) * 4;
        rSum += data[idx];
        gSum += data[idx + 1];
        bSum += data[idx + 2];
        count++;
      }

      const inv = 1 / count;
      const avgR = rSum * inv;
      const avgG = gSum * inv;
      const avgB = bSum * inv;

      // Linear luminance matching WebGL shader
      const linR = srgbToLinear(avgR);
      const linG = srgbToLinear(avgG);
      const linB = srgbToLinear(avgB);
      let luma = linearLuma(linR, linG, linB);

      // Tone processing matching WebGL shader
      luma = (luma - 0.5) * contrast + 0.5 + brightness;
      luma = Math.max(0, Math.min(1, luma));
      luma = luma ** gamma;
      if (invert) {
        luma = 1.0 - luma;
      }

      // Pick glyph index proportional to luminance matching WebGL shader
      const gIdx = Math.max(0, Math.min(maxG, Math.round(luma * maxG)));
      const g = bank.glyphs[gIdx];
      const i = row * cols + col;

      cells[i] = {
        glyphIndex: gIdx,
        char: g.char,
        luma,
        r: Math.round(avgR),
        g: Math.round(avgG),
        b: Math.round(avgB),
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
