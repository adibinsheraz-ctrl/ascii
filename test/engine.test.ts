import test from "node:test";
import assert from "node:assert/strict";

import { srgbToLinear, linearToSrgb, linearLuma, parseHex } from "../lib/ascii-engine/color";
import { studioRows } from "../lib/ascii-engine/studio";
import { directionalChar } from "../lib/ascii-engine/sobel";
import { orderedThreshold, blueNoiseThreshold } from "../lib/ascii-engine/dither";
import { AdaptiveQualityController } from "../lib/ascii-engine/adaptive";
import type { DeviceProfile } from "../lib/ascii-engine/device";

test("color: srgbToLinear and linearToSrgb roundtrip accurately", () => {
  for (let c = 0; c <= 255; c += 15) {
    const lin = srgbToLinear(c);
    assert.ok(lin >= 0 && lin <= 1, `Linear value out of bounds: ${lin}`);
    const roundtrip = linearToSrgb(lin);
    assert.ok(Math.abs(roundtrip - c) <= 1, `Roundtrip mismatch: ${c} vs ${roundtrip}`);
  }
});

test("color: linearLuma adheres to Rec.709 coefficients", () => {
  // Pure white
  const white = linearLuma(1, 1, 1);
  assert.ok(Math.abs(white - 1.0) < 1e-4, "White luminance should be 1.0");

  // Pure black
  const black = linearLuma(0, 0, 0);
  assert.equal(black, 0, "Black luminance should be 0.0");

  // Component weights: 0.2126 R, 0.7152 G, 0.0722 B
  const red = linearLuma(1, 0, 0);
  assert.ok(Math.abs(red - 0.2126) < 1e-4, "Red weight mismatch");

  const green = linearLuma(0, 1, 0);
  assert.ok(Math.abs(green - 0.7152) < 1e-4, "Green weight mismatch");

  const blue = linearLuma(0, 0, 1);
  assert.ok(Math.abs(blue - 0.0722) < 1e-4, "Blue weight mismatch");
});

test("color: parseHex parses standard and shorthand hex strings", () => {
  assert.deepEqual(parseHex("#FFFFFF"), [255, 255, 255]);
  assert.deepEqual(parseHex("#000000"), [0, 0, 0]);
  assert.deepEqual(parseHex("#7CFFB2"), [124, 255, 178]);
  assert.deepEqual(parseHex("#FFF"), [255, 255, 255]);
  assert.deepEqual(parseHex("#000"), [0, 0, 0]);
});

test("studio: studioRows maintains physical aspect ratio", () => {
  const glyphAspect = 0.55; // width / height
  const cols = 200;

  // 1:1 Square image
  const sqRows = studioRows(1000, 1000, cols, glyphAspect);
  // rows = round(200 * (1000/1000) * 0.55) = 110
  assert.equal(sqRows, 110);
  const physicalAspect = (cols * glyphAspect) / sqRows;
  assert.ok(Math.abs(physicalAspect - 1.0) < 0.02, `Square physical aspect should be ~1.0: ${physicalAspect}`);

  // 16:9 Landscape image
  const landRows = studioRows(1920, 1080, cols, glyphAspect);
  // rows = round(200 * (1080/1920) * 0.55) = round(61.875) = 62
  assert.equal(landRows, 62);
  const landPhysicalAspect = (cols * glyphAspect) / landRows;
  const targetLandAspect = 1920 / 1080;
  assert.ok(Math.abs(landPhysicalAspect - targetLandAspect) < 0.05, "Landscape aspect mismatch");
});

test("sobel: directionalChar maps angles correctly", () => {
  // Gradient angle 0 (vertical edge, horizontal gradient) -> '|'
  assert.equal(directionalChar(0), "|");
  // Gradient angle pi/2 (horizontal edge, vertical gradient) -> '-'
  assert.equal(directionalChar(Math.PI / 2), "-");
  // Gradient angle -pi/4 -> '/'
  assert.equal(directionalChar(-Math.PI / 4), "/");
  // Gradient angle pi/4 -> '\'
  assert.equal(directionalChar(Math.PI / 4), "\\");
});

test("dither: ordered and blue noise thresholds are bounded", () => {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const o = orderedThreshold(x, y);
      assert.ok(o >= -0.5 && o <= 0.5, `Ordered threshold out of range: ${o}`);
      const b = blueNoiseThreshold(x, y);
      assert.ok(b >= -0.5 && b <= 0.5, `Blue noise threshold out of range: ${b}`);
    }
  }
});

test("adaptive: quality controller scales with hysteresis", () => {
  const mockProfile: DeviceProfile = {
    tier: "mid",
    hardwareConcurrency: 4,
    deviceMemory: 4,
    hasWebGL2: true,
    gpuRenderer: "test",
    maxTextureSize: 4096,
    benchmarkMs: 5,
    recommendedCols: 120,
    recommendedCamWidth: 960,
    recommendedCamHeight: 540,
  };

  const controller = new AdaptiveQualityController(mockProfile);
  assert.equal(controller.getRecommendedColumns(), 120);

  // Simulate heavy frames (> 45ms)
  let time = 1000;
  for (let i = 0; i < 30; i++) {
    time += 50; // 50ms per frame -> slow
    controller.recordFrame(time);
  }

  // After multiple slow frames, columns should have scaled down
  const downscaled = controller.getRecommendedColumns();
  assert.ok(downscaled < 120, `Columns should decrease under load: ${downscaled}`);

  // Simulate fast frames (< 20ms)
  for (let i = 0; i < 50; i++) {
    time += 15; // 15ms per frame -> fast
    controller.recordFrame(time);
  }

  // After fast frames, columns should scale back up with hysteresis
  const upscaled = controller.getRecommendedColumns();
  assert.ok(upscaled >= downscaled, `Columns should recover when headroom exists: ${upscaled}`);
});
