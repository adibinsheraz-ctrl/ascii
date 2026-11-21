import type { GlyphBank, GlyphDescriptor } from "./types";

export type SerializedGlyph = {
  char: string;
  mean: number;
  std: number;
  regions: number[];
  patch: number[];
  orientation: number;
  edgeEnergy: number;
};

export type SerializedBank = {
  fontFamily: string;
  metrics: GlyphBank["metrics"];
  glyphs: SerializedGlyph[];
  atlasCols: number;
  atlasCellW: number;
  atlasCellH: number;
  liveLut: number[];
  lutLevels: number;
};

export function serializeBank(bank: GlyphBank): SerializedBank {
  return {
    fontFamily: bank.fontFamily,
    metrics: bank.metrics,
    glyphs: bank.glyphs.map((g) => ({
      char: g.char,
      mean: g.mean,
      std: g.std,
      regions: Array.from(g.regions),
      patch: Array.from(g.patch),
      orientation: g.orientation,
      edgeEnergy: g.edgeEnergy,
    })),
    atlasCols: bank.atlasCols,
    atlasCellW: bank.atlasCellW,
    atlasCellH: bank.atlasCellH,
    liveLut: Array.from(bank.liveLut),
    lutLevels: bank.lutLevels,
  };
}

export function deserializeBank(
  data: SerializedBank,
  atlas: OffscreenCanvas | HTMLCanvasElement,
): GlyphBank {
  const glyphs: GlyphDescriptor[] = data.glyphs.map((g) => ({
    char: g.char,
    mean: g.mean,
    std: g.std,
    regions: Float32Array.from(g.regions),
    patch: Float32Array.from(g.patch),
    orientation: g.orientation,
    edgeEnergy: g.edgeEnergy,
  }));
  return {
    fontFamily: data.fontFamily,
    metrics: data.metrics,
    glyphs,
    atlas,
    atlasCols: data.atlasCols,
    atlasCellW: data.atlasCellW,
    atlasCellH: data.atlasCellH,
    liveLut: Uint16Array.from(data.liveLut),
    lutLevels: data.lutLevels,
  };
}

export async function atlasToBitmap(bank: GlyphBank): Promise<ImageBitmap> {
  return createImageBitmap(bank.atlas);
}

export function bitmapToAtlas(bitmap: ImageBitmap): OffscreenCanvas {
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D unavailable in worker");
  ctx.drawImage(bitmap, 0, 0);
  return c;
}
