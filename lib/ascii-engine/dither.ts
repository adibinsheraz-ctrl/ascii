/** Ordered, Floyd–Steinberg, and blue-noise dithering on the cell luminance grid. */

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14,
  46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19,
  59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29,
  53, 21,
].map((v) => v / 64 - 0.5);

let blueNoise: Float32Array | null = null;

function buildBlueNoise(size = 64): Float32Array {
  const n = size * size;
  const values = new Float32Array(n);
  const occupied = new Uint8Array(n);
  const placed: number[] = [];
  const dist = (a: number, b: number) => {
    const ax = a % size;
    const ay = (a / size) | 0;
    const bx = b % size;
    const by = (b / size) | 0;
    let dx = Math.abs(ax - bx);
    let dy = Math.abs(ay - by);
    dx = Math.min(dx, size - dx);
    dy = Math.min(dy, size - dy);
    return dx * dx + dy * dy;
  };
  const first = ((size / 2) | 0) * size + ((size / 2) | 0);
  occupied[first] = 1;
  placed.push(first);
  values[first] = 0;
  for (let k = 1; k < n; k++) {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < n; i++) {
      if (occupied[i]) continue;
      let minD = 1e9;
      for (const p of placed) {
        const d = dist(i, p);
        if (d < minD) minD = d;
      }
      if (minD > bestScore) {
        bestScore = minD;
        best = i;
      }
    }
    occupied[best] = 1;
    placed.push(best);
    values[best] = k / n - 0.5;
  }
  return values;
}

export function getBlueNoise(): Float32Array {
  if (!blueNoise) blueNoise = buildBlueNoise(32);
  return blueNoise;
}

export function orderedThreshold(x: number, y: number): number {
  return BAYER8[(y & 7) * 8 + (x & 7)] * 0.12;
}

export function blueNoiseThreshold(x: number, y: number): number {
  const n = getBlueNoise();
  const size = 32;
  return n[(y & (size - 1)) * size + (x & (size - 1))] * 0.14;
}

export function floydSteinberg(
  luma: Float32Array,
  cols: number,
  rows: number,
  quantize: (value: number, x: number, y: number) => number,
): Float32Array {
  const buf = new Float32Array(luma.length);
  buf.set(luma);
  const out = new Float32Array(luma.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const old = buf[i];
      const q = quantize(old, x, y);
      out[i] = q;
      const err = old - q;
      if (x + 1 < cols) buf[i + 1] += err * (7 / 16);
      if (y + 1 < rows) {
        if (x > 0) buf[i + cols - 1] += err * (3 / 16);
        buf[i + cols] += err * (5 / 16);
        if (x + 1 < cols) buf[i + cols + 1] += err * (1 / 16);
      }
    }
  }
  return out;
}
