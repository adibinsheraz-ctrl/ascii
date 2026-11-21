/**
 * Studio engine — the highest quality path.
 * Always starts from the full-resolution source. Live preview never
 * downscales this pipeline.
 */

import { imageDataToLinear } from "./buffer";
import { matchGrid } from "./match";
import {
  applyTone,
  autoLevels,
  boostFaces,
  clahe,
  edgePreserveDenoise,
  faceWeightMap,
  unsharpMask,
} from "./preprocess";
import { sobel } from "./sobel";
import type {
  AsciiGrid,
  AsciiSettings,
  BackgroundMode,
  FaceRect,
  GlyphBank,
} from "./types";

export function studioRows(imageWidth: number, imageHeight: number, columns: number, aspect: number): number {
  const imgAspect = imageHeight / Math.max(1, imageWidth);
  return Math.max(8, Math.round(columns * imgAspect * aspect));
}

export function convertStudio(
  source: ImageData,
  bank: GlyphBank,
  settings: AsciiSettings,
  faces: FaceRect[] = [],
  background: BackgroundMode = "black",
): AsciiGrid {
  const img = imageDataToLinear(source);

  if (settings.autoLevels) autoLevels(img);
  if (settings.denoise && img.width * img.height <= 2_000_000) {
    edgePreserveDenoise(img, 1.35, 0.07);
  }
  if (settings.clahe) clahe(img, 8, 8, 1.85);
  if (settings.sharpness > 0) unsharpMask(img, settings.sharpness, 1.1);
  applyTone(img, settings.contrast, settings.brightness, settings.gamma, settings.invert);

  let weights: Float32Array | undefined;
  if (settings.faceAware) {
    weights = faceWeightMap(img.width, img.height, faces);
    boostFaces(img, weights, 0.32);
    unsharpMask(img, 0.18, 0.85);
  }

  const edge = settings.edgeStrength > 0.01 ? sobel(img) : null;
  const cols = Math.max(24, Math.min(720, Math.round(settings.columns)));
  const rows = studioRows(img.width, img.height, cols, bank.metrics.aspect);

  const cells = matchGrid({
    img,
    bank,
    cols,
    rows,
    edge,
    edgeStrength: settings.edgeStrength,
    dither: settings.dither,
    faceWeights: weights,
  });

  return {
    cols,
    rows,
    cells,
    metrics: bank.metrics,
    background,
  };
}
