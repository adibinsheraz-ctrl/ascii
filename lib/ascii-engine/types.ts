/**
 * Shared types for the ASCII conversion engines.
 *
 * Studio and Live share one grid representation so the renderer and exporters
 * always work from characters, never from a tiny bitmap that would be upscaled.
 */

export const RAMPS = {
  classic: " .:-=+*#%@",
  detailed:
    " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: " ░▒▓█",
  minimal: " .oO@",
  binary: " █",
  matrix: " .:-=+*#%@ｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾙﾚﾛﾜﾝ",
} as const;

export type RampPreset = keyof typeof RAMPS;

export type ColorMode =
  | "mono"
  | "phosphor"
  | "amber"
  | "ice"
  | "full"
  | "duotone"
  | "gradient"
  | "custom";

export type BackgroundMode = "black" | "charcoal" | "transparent";

export type DitherMode = "none" | "floyd-steinberg" | "ordered" | "blue-noise";

export type EngineMode = "live" | "studio";

export type FaceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AsciiSettings = {
  columns: number;
  contrast: number;
  brightness: number;
  gamma: number;
  invert: boolean;
  sharpness: number;
  edgeStrength: number;
  dither: DitherMode;
  colorMode: ColorMode;
  customAccent: string;
  duotoneLow: string;
  duotoneHigh: string;
  ramp: RampPreset;
  customRamp: string;
  clahe: boolean;
  denoise: boolean;
  autoLevels: boolean;
  faceAware: boolean;
  invertBackground: boolean;
};

export type FinishEffects = {
  glow: number;
  grain: number;
  vignette: number;
  scanlines: number;
  grade: "none" | "bleach" | "nocturne" | "print";
};

export type GlyphMetrics = {
  cellWidth: number;
  cellHeight: number;
  /** glyph width / glyph height, typically ~0.55 for JetBrains Mono */
  aspect: number;
};

export type GlyphDescriptor = {
  char: string;
  mean: number;
  std: number;
  /** 4x8 region means, length 32 */
  regions: Float32Array;
  /** Fine 12x24 luminance patch, length 288 */
  patch: Float32Array;
  /** Dominant edge orientation in radians, or -1 if unstructured */
  orientation: number;
  edgeEnergy: number;
};

export type GlyphBank = {
  fontFamily: string;
  metrics: GlyphMetrics;
  glyphs: GlyphDescriptor[];
  /** Atlas canvas drawn with white glyphs on transparent */
  atlas: OffscreenCanvas | HTMLCanvasElement;
  atlasCols: number;
  atlasCellW: number;
  atlasCellH: number;
  /** Live LUT: 8^4 entries indexing best glyph for 2x2 region means */
  liveLut: Uint16Array;
  lutLevels: number;
};

export type AsciiCell = {
  glyphIndex: number;
  char: string;
  /** 0..1 perceived luminance used for coloring */
  luma: number;
  r: number;
  g: number;
  b: number;
};

export type AsciiGrid = {
  cols: number;
  rows: number;
  cells: AsciiCell[];
  metrics: GlyphMetrics;
  background: BackgroundMode;
};

export type RenderPalette = {
  colorMode: ColorMode;
  customAccent: string;
  duotoneLow: string;
  duotoneHigh: string;
  background: BackgroundMode;
};

export const DEFAULT_SETTINGS: AsciiSettings = {
  columns: 160,
  contrast: 1.20,
  brightness: 0.0,
  gamma: 0.92,
  invert: false,
  sharpness: 0.72,
  edgeStrength: 0.42,
  dither: "floyd-steinberg",
  colorMode: "mono",
  customAccent: "#7CFFB2",
  duotoneLow: "#2B0A4A",
  duotoneHigh: "#FF4D8D",
  ramp: "detailed",
  customRamp: "",
  clahe: true,
  denoise: true,
  autoLevels: true,
  faceAware: true,
  invertBackground: false,
};

export const LIVE_SETTINGS_OVERRIDE: Partial<AsciiSettings> = {
  columns: 140,
  contrast: 1.15,
  clahe: false,
  denoise: false,
  dither: "none",
  sharpness: 0.42,
  edgeStrength: 0.36,
};

export const DEFAULT_FINISH: FinishEffects = {
  glow: 0,
  grain: 0,
  vignette: 0,
  scanlines: 0,
  grade: "none",
};
