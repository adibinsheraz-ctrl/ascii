/**
 * Render the character grid directly at the target pixel size.
 * Glyphs are drawn from the measured font (and atlas as a mask fallback)
 * so 8K exports are real 8K, not a stretched preview.
 */

import { BACKGROUNDS, glyphColor } from "./color";
import { FONT_FAMILY } from "./glyphs";
import type { AsciiGrid, FinishEffects, GlyphBank, RenderPalette } from "./types";
import { DEFAULT_FINISH } from "./types";

export function backgroundCss(mode: AsciiGrid["background"]): string {
  if (mode === "transparent") return "transparent";
  if (mode === "charcoal") return "rgb(18,18,20)";
  return "rgb(10,10,10)";
}

export function gridPixelSize(
  grid: AsciiGrid,
  targetWidth: number,
): { width: number; height: number; cellW: number; cellH: number } {
  const cellW = targetWidth / grid.cols;
  const cellH = cellW / grid.metrics.aspect;
  return {
    width: Math.max(1, Math.round(targetWidth)),
    height: Math.max(1, Math.round(cellH * grid.rows)),
    cellW,
    cellH,
  };
}

function fillBackground(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  width: number,
  height: number,
  background: AsciiGrid["background"],
): void {
  if (background === "transparent") {
    ctx.clearRect(0, 0, width, height);
    return;
  }
  const [r, g, b] = BACKGROUNDS[background];
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, width, height);
}

function makeSurface(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function context2d(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null {
  return canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
}

const UNIFORM_MODES = new Set(["mono", "phosphor", "amber", "ice", "custom"]);

export function renderGridToContext(params: {
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  grid: AsciiGrid;
  bank: GlyphBank;
  palette: RenderPalette;
  width: number;
  height: number;
  finish?: FinishEffects;
  fast?: boolean;
}): void {
  const { ctx, grid, bank, palette, width, height, finish = DEFAULT_FINISH, fast } = params;
  const cellW = width / grid.cols;
  const cellH = height / grid.rows;
  const bg = palette.background ?? grid.background;

  fillBackground(ctx, width, height, bg);

  ctx.imageSmoothingEnabled = !fast;
  ctx.imageSmoothingQuality = "high";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const fontSize = cellH * 0.92;
  ctx.font = `${fontSize}px "${FONT_FAMILY}"`;
  const typed = ctx as CanvasRenderingContext2D & {
    textRendering?: string;
    fontKerning?: string;
    letterSpacing?: string;
  };
  if ("textRendering" in typed) typed.textRendering = "geometricPrecision";
  if ("fontKerning" in typed) typed.fontKerning = "none";
  if ("letterSpacing" in typed) typed.letterSpacing = "0px";

  const metrics = ctx.measureText("M");
  const ascent = metrics.fontBoundingBoxAscent || fontSize * 0.8;
  const yBase =
    (cellH - (metrics.fontBoundingBoxAscent || fontSize) - (metrics.fontBoundingBoxDescent || 0)) / 2 +
    ascent;

  const uniform = UNIFORM_MODES.has(palette.colorMode);
  const ink = glyphColor(
    palette.colorMode,
    1,
    255,
    255,
    255,
    palette.customAccent,
    palette.duotoneLow,
    palette.duotoneHigh,
  );

  if (uniform) {
    ctx.fillStyle = `rgb(${ink[0]},${ink[1]},${ink[2]})`;
    const advance = Math.max(0.001, ctx.measureText("M").width);
    const scaleX = cellW / advance;
    for (let row = 0; row < grid.rows; row++) {
      let line = "";
      for (let col = 0; col < grid.cols; col++) {
        line += grid.cells[row * grid.cols + col]?.char ?? " ";
      }
      ctx.setTransform(scaleX, 0, 0, 1, 0, 0);
      ctx.fillText(line, 0, row * cellH + yBase);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    const aw = bank.atlasCellW;
    const ah = bank.atlasCellH;
    const acols = bank.atlasCols;
    const useAtlas = Boolean(fast) && cellW < 10;
    for (let i = 0; i < grid.cells.length; i++) {
      const cell = grid.cells[i];
      if (cell.char === " ") continue;
      const col = i % grid.cols;
      const row = (i / grid.cols) | 0;
      const [r, g, b] = glyphColor(
        palette.colorMode,
        cell.luma,
        cell.r,
        cell.g,
        cell.b,
        palette.customAccent,
        palette.duotoneLow,
        palette.duotoneHigh,
      );
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const dx = col * cellW;
      const dy = row * cellH;
      if (useAtlas) {
        const sx = (cell.glyphIndex % acols) * aw;
        const sy = ((cell.glyphIndex / acols) | 0) * ah;
        ctx.drawImage(bank.atlas as CanvasImageSource, sx, sy, aw, ah, dx, dy, cellW, cellH);
      } else {
        ctx.fillText(cell.char, dx, dy + yBase);
      }
    }
  }

  applyFinish(ctx, width, height, fast ? { ...DEFAULT_FINISH, glow: Math.min(finish.glow, 0.12), grain: 0, scanlines: 0, vignette: 0, grade: "none" } : finish);
}

function applyFinish(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  width: number,
  height: number,
  finish: FinishEffects,
): void {
  if (finish.glow > 0.01) {
    const blur = makeSurface(width, height);
    const bctx = context2d(blur);
    if (bctx) {
      bctx.drawImage(ctx.canvas as CanvasImageSource, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.filter = `blur(${Math.max(1.5, width * 0.0035)}px)`;
      ctx.globalAlpha = finish.glow * 0.4;
      ctx.drawImage(blur as CanvasImageSource, 0, 0);
      ctx.filter = "none";
      ctx.restore();
    }
  }

  if (finish.grade !== "none") {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.28;
    if (finish.grade === "bleach") ctx.fillStyle = "#d5e0f0";
    else if (finish.grade === "nocturne") ctx.fillStyle = "#243868";
    else ctx.fillStyle = "#4a3418";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  if (finish.vignette > 0.01) {
    const g = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.22,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.7,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${0.75 * finish.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  if (finish.scanlines > 0.01) {
    ctx.save();
    ctx.globalAlpha = 0.1 * finish.scanlines;
    ctx.fillStyle = "#000";
    const step = Math.max(2, Math.round(height / 260));
    for (let y = 0; y < height; y += step * 2) ctx.fillRect(0, y, width, step);
    ctx.restore();
  }

  if (finish.grain > 0.01) {
    const gw = Math.min(width, 1600);
    const gh = Math.min(height, 1600);
    const noise = makeSurface(gw, gh);
    const nctx = context2d(noise);
    if (nctx) {
      const id = nctx.createImageData(gw, gh);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = 128 + (Math.random() - 0.5) * 90 * finish.grain;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 40 * finish.grain;
      }
      nctx.putImageData(id, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.drawImage(noise as CanvasImageSource, 0, 0, width, height);
      ctx.restore();
    }
  }
}

export function gridToText(grid: AsciiGrid): string {
  const lines: string[] = [];
  for (let y = 0; y < grid.rows; y++) {
    let line = "";
    for (let x = 0; x < grid.cols; x++) {
      line += grid.cells[y * grid.cols + x]?.char ?? " ";
    }
    lines.push(line);
  }
  return lines.join("\n");
}

export function gridToHtml(grid: AsciiGrid, palette: RenderPalette): string {
  const bg =
    palette.background === "transparent"
      ? "transparent"
      : palette.background === "charcoal"
        ? "#121214"
        : "#0a0a0a";
  const rows: string[] = [];
  for (let y = 0; y < grid.rows; y++) {
    let line = "";
    for (let x = 0; x < grid.cols; x++) {
      const cell = grid.cells[y * grid.cols + x];
      const [r, g, b] = glyphColor(
        palette.colorMode,
        cell.luma,
        cell.r,
        cell.g,
        cell.b,
        palette.customAccent,
        palette.duotoneLow,
        palette.duotoneHigh,
      );
      const ch = cell.char === " " ? "&nbsp;" : escapeHtml(cell.char);
      line += `<span style="color:rgb(${r},${g},${b})">${ch}</span>`;
    }
    rows.push(line);
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>ASCII</title>
<style>
body{margin:0;background:${bg};display:flex;justify-content:center;padding:24px}
pre{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:8px;line-height:8px;letter-spacing:0;margin:0}
</style></head><body><pre>${rows.join("\n")}</pre></body></html>`;
}

export function gridToSvg(grid: AsciiGrid, palette: RenderPalette, targetWidth: number): string {
  const { width, height, cellH } = gridPixelSize(grid, targetWidth);
  const fontSize = cellH * 0.92;
  const bg =
    palette.background === "transparent"
      ? "none"
      : palette.background === "charcoal"
        ? "#121214"
        : "#0a0a0a";
  const bgRect =
    palette.background === "transparent" ? "" : `<rect width="100%" height="100%" fill="${bg}"/>`;
  const lines: string[] = [];
  for (let y = 0; y < grid.rows; y++) {
    let spans = "";
    for (let x = 0; x < grid.cols; x++) {
      const cell = grid.cells[y * grid.cols + x];
      const [r, g, b] = glyphColor(
        palette.colorMode,
        cell.luma,
        cell.r,
        cell.g,
        cell.b,
        palette.customAccent,
        palette.duotoneLow,
        palette.duotoneHigh,
      );
      spans += `<tspan fill="rgb(${r},${g},${b})">${escapeXml(cell.char)}</tspan>`;
    }
    const yy = (y + 0.86) * cellH;
    lines.push(
      `<text x="0" y="${yy.toFixed(2)}" xml:space="preserve">${spans}</text>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${bgRect}
<g font-family="JetBrains Mono, ui-monospace, monospace" font-size="${fontSize.toFixed(2)}">
${lines.join("\n")}
</g>
</svg>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeXml(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
