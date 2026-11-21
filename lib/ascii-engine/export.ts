/**
 * True HD / 4K / 8K export. Renders from the character grid at the target
 * size. Large canvases are tiled for mobile limits; we never silently
 * stretch a small bitmap.
 */

import { loadAsciiFont } from "./glyphs";
import { gridPixelSize, gridToHtml, gridToSvg, gridToText, renderGridToContext } from "./render";
import type {
  AsciiGrid,
  FinishEffects,
  GlyphBank,
  RenderPalette,
} from "./types";
import { DEFAULT_FINISH } from "./types";

export type ExportPreset = "hd" | "4k" | "8k" | "custom";
export type ExportFormat = "png" | "jpg" | "svg" | "txt" | "html";

export type ExportRequest = {
  grid: AsciiGrid;
  bank: GlyphBank;
  palette: RenderPalette;
  finish?: FinishEffects;
  preset: ExportPreset;
  customLongEdge?: number;
  format: ExportFormat;
  jpgQuality: number;
  onProgress?: (ratio: number, label: string) => void;
};

export type ExportResult = {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  limited: boolean;
  message?: string;
};

export function timestampName(ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `ASCII_${stamp}.${ext}`;
}

export function longEdgeForPreset(preset: ExportPreset, custom?: number): number {
  if (preset === "hd") return 1920;
  if (preset === "4k") return 3840;
  if (preset === "8k") return 7680;
  return Math.max(256, Math.min(16000, Math.round(custom ?? 1920)));
}

export function detectMaxCanvasSize(): number {
  if (typeof document === "undefined") return 8192;
  const sizes = [16384, 8192, 7680, 4096, 3840, 2048];
  for (const s of sizes) {
    const c = document.createElement("canvas");
    c.width = s;
    c.height = s;
    const ctx = c.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#fff";
    ctx.fillRect(s - 1, s - 1, 1, 1);
    try {
      const d = ctx.getImageData(s - 1, s - 1, 1, 1).data;
      if (d[0] > 0) return s;
    } catch {
      continue;
    }
  }
  return 2048;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      return new OffscreenCanvas(w, h);
    } catch {
      /* fall through */
    }
  }
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

async function canvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))),
      type,
      quality,
    );
  });
}

async function renderFull(
  grid: AsciiGrid,
  bank: GlyphBank,
  palette: RenderPalette,
  finish: FinishEffects,
  width: number,
  height: number,
): Promise<OffscreenCanvas | HTMLCanvasElement> {
  await loadAsciiFont();
  const canvas = makeCanvas(width, height);
  const ctx = context2d(canvas);
  if (!ctx) throw new Error("Export canvas context unavailable");
  renderGridToContext({
    ctx,
    grid,
    bank,
    palette,
    width,
    height,
    finish,
  });
  return canvas;
}

/**
 * Tile render for devices that cannot allocate the full canvas.
 * Tiles are drawn at full glyph resolution then stitched if possible;
 * otherwise we return the largest safe image and a clear message.
 */
async function renderTiled(
  grid: AsciiGrid,
  bank: GlyphBank,
  palette: RenderPalette,
  finish: FinishEffects,
  width: number,
  height: number,
  maxDim: number,
  onProgress?: (ratio: number, label: string) => void,
): Promise<{ canvas: OffscreenCanvas | HTMLCanvasElement; limited: boolean; message?: string }> {
  if (width <= maxDim && height <= maxDim) {
    onProgress?.(0.4, "Rendering");
    const canvas = await renderFull(grid, bank, palette, finish, width, height);
    return { canvas, limited: false };
  }

  const scale = Math.min(maxDim / width, maxDim / height);
  const safeW = Math.max(1, Math.floor(width * scale));
  const safeH = Math.max(1, Math.floor(height * scale));
  const canStitch = width <= maxDim * 2 && height <= maxDim * 2;

  if (!canStitch || width * height > maxDim * maxDim) {
    onProgress?.(0.5, "Rendering at device limit");
    const canvas = await renderFull(grid, bank, palette, finish, safeW, safeH);
    return {
      canvas,
      limited: true,
      message: `This device caps canvases at ${maxDim}px. Exported at ${safeW}×${safeH} instead of ${width}×${height}. SVG export is unlimited.`,
    };
  }

  const tile = Math.min(2048, maxDim);
  const cols = Math.ceil(width / tile);
  const rows = Math.ceil(height / tile);
  const stitched = makeCanvas(width, height);
  const sctx = context2d(stitched);
  if (!sctx) {
    const canvas = await renderFull(grid, bank, palette, finish, safeW, safeH);
    return {
      canvas,
      limited: true,
      message: `Could not allocate ${width}×${height}. Exported at ${safeW}×${safeH}.`,
    };
  }

  const total = cols * rows;
  let done = 0;
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const tw = Math.min(tile, width - tx * tile);
      const th = Math.min(tile, height - ty * tile);
      const piece = makeCanvas(tw, th);
      const pctx = context2d(piece);
      if (!pctx) continue;
      pctx.save();
      pctx.translate(-tx * tile, -ty * tile);
      renderGridToContext({
        ctx: pctx,
        grid,
        bank,
        palette,
        width,
        height,
        finish,
      });
      pctx.restore();
      sctx.drawImage(piece as CanvasImageSource, tx * tile, ty * tile);
      done++;
      onProgress?.(0.2 + (done / total) * 0.6, `Tile ${done}/${total}`);
    }
  }
  return { canvas: stitched, limited: false };
}

export async function exportAscii(req: ExportRequest): Promise<ExportResult> {
  const finish = req.finish ?? DEFAULT_FINISH;
  const longEdge = longEdgeForPreset(req.preset, req.customLongEdge);
  const aspect = (req.grid.cols * req.grid.metrics.aspect) / Math.max(1, req.grid.rows);
  const landscape = aspect >= 1;
  const targetW = landscape
    ? longEdge
    : Math.max(1, Math.round(longEdge * aspect));
  const size = gridPixelSize(req.grid, targetW);
  req.onProgress?.(0.08, "Preparing");

  if (req.format === "txt") {
    const text = gridToText(req.grid);
    return {
      blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
      filename: timestampName("txt"),
      width: req.grid.cols,
      height: req.grid.rows,
      limited: false,
    };
  }
  if (req.format === "html") {
    const html = gridToHtml(req.grid, req.palette);
    return {
      blob: new Blob([html], { type: "text/html;charset=utf-8" }),
      filename: timestampName("html"),
      width: size.width,
      height: size.height,
      limited: false,
    };
  }
  if (req.format === "svg") {
    const svg = gridToSvg(req.grid, req.palette, size.width);
    return {
      blob: new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
      filename: timestampName("svg"),
      width: size.width,
      height: size.height,
      limited: false,
    };
  }

  const maxDim = detectMaxCanvasSize();
  const { canvas, limited, message } = await renderTiled(
    req.grid,
    req.bank,
    req.palette,
    finish,
    size.width,
    size.height,
    maxDim,
    req.onProgress,
  );
  req.onProgress?.(0.88, "Encoding");
  const mime = req.format === "jpg" ? "image/jpeg" : "image/png";
  const quality = req.format === "jpg" ? Math.max(0.5, Math.min(1, req.jpgQuality)) : undefined;
  const blob = await canvasToBlob(canvas, mime, quality);
  req.onProgress?.(1, "Done");
  return {
    blob,
    filename: timestampName(req.format === "jpg" ? "jpg" : "png"),
    width: canvas.width,
    height: canvas.height,
    limited,
    message,
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
