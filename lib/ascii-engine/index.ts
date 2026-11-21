/**
 * ASCII conversion engine
 * ----------------------------------------------------------------------------
 * Two paths share one character-grid output:
 *
 * 1. Live  — LUT shape matching, auto-exposure, temporal hysteresis, 30fps+.
 * 2. Studio — full-res linear-light supersampling, CLAHE, unsharp, denoise,
 *             12×24 glyph shape matching, Sobel directional glyphs, dither.
 *
 * Rendering always draws the grid at the target resolution (fillText / atlas).
 * Export never upscales a preview bitmap.
 */

export * from "./types";
export * from "./color";
export * from "./glyphs";
export * from "./studio";
export * from "./live";
export * from "./render";
export * from "./export";
export * from "./faces";
export * from "./buffer";
export { imageDataFromSource, imageDataFromUrl, ImageDecodeError } from "./decode";
