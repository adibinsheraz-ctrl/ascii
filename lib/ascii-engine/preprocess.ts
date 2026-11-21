/**
 * Studio pre-process: auto levels, CLAHE, unsharp mask, edge-preserving denoise.
 * All filters run on linear luminance so midtones stay photographic.
 */

import type { LinearImage } from "./buffer";
import { getY } from "./buffer";
import type { FaceRect } from "./types";

export function autoLevels(img: LinearImage, lowPct = 0.012, highPct = 0.988): void {
  const n = img.width * img.height;
  const hist = new Uint32Array(1024);
  for (let i = 0; i < n; i++) {
    const y = Math.max(0, Math.min(1, img.data[i * 4 + 3]));
    hist[(y * 1023) | 0]++;
  }
  const loCount = n * lowPct;
  const hiCount = n * highPct;
  let acc = 0;
  let lo = 0;
  let hi = 1;
  for (let b = 0; b < 1024; b++) {
    acc += hist[b];
    if (acc >= loCount && lo === 0) lo = b / 1023;
    if (acc >= hiCount) {
      hi = b / 1023;
      break;
    }
  }
  const span = Math.max(1e-4, hi - lo);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const y = (img.data[p + 3] - lo) / span;
    const ny = Math.max(0, Math.min(1, y));
    const old = img.data[p + 3] || 1e-6;
    const s = ny / old;
    img.data[p] *= s;
    img.data[p + 1] *= s;
    img.data[p + 2] *= s;
    img.data[p + 3] = ny;
  }
}

function gaussianKernel(radius: number): Float32Array {
  const sigma = Math.max(0.4, radius);
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(r * 2 + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

function blurY(img: LinearImage, radius: number): Float32Array {
  const { width: w, height: h, data } = img;
  const k = gaussianKernel(radius);
  const r = (k.length - 1) >> 1;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const xx = Math.max(0, Math.min(w - 1, x + i));
        acc += data[(y * w + xx) * 4 + 3] * k[i + r];
      }
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const yy = Math.max(0, Math.min(h - 1, y + i));
        acc += tmp[yy * w + x] * k[i + r];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

export function unsharpMask(img: LinearImage, amount: number, radius = 1.15): void {
  if (amount <= 0) return;
  const { width: w, height: h, data } = img;
  const blurred = blurY(img, radius);
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const y = data[p + 3];
    const ny = Math.max(0, Math.min(1, y + (y - blurred[i]) * amount));
    const old = y || 1e-6;
    const s = ny / old;
    data[p] *= s;
    data[p + 1] *= s;
    data[p + 2] *= s;
    data[p + 3] = ny;
  }
}

/**
 * Fast bilateral-ish denoise: 5x5 spatial, range sigma on luminance.
 * Keeps jawlines and hair edges instead of averaging them away.
 */
export function edgePreserveDenoise(img: LinearImage, spatial = 1.6, range = 0.08): void {
  const { width: w, height: h, data } = img;
  const src = new Float32Array(data);
  const radius = 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const center = src[(y * w + x) * 4 + 3];
      let wsum = 0;
      let ysum = 0;
      let rsum = 0;
      let gsum = 0;
      let bsum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = (yy * w + xx) * 4;
          const ny = src[q + 3];
          const ds = dx * dx + dy * dy;
          const dr = ny - center;
          const ww =
            Math.exp(-ds / (2 * spatial * spatial)) *
            Math.exp(-(dr * dr) / (2 * range * range));
          wsum += ww;
          ysum += ny * ww;
          rsum += src[q] * ww;
          gsum += src[q + 1] * ww;
          bsum += src[q + 2] * ww;
        }
      }
      const p = (y * w + x) * 4;
      data[p] = rsum / wsum;
      data[p + 1] = gsum / wsum;
      data[p + 2] = bsum / wsum;
      data[p + 3] = ysum / wsum;
    }
  }
}

/**
 * Contrast Limited Adaptive Histogram Equalization on linear Y,
 * bilinearly interpolating 8x8 tiles so faces don't posterize.
 */
export function clahe(img: LinearImage, tilesX = 8, tilesY = 8, clipLimit = 2.4): void {
  const { width: w, height: h, data } = img;
  const tileW = Math.max(8, Math.floor(w / tilesX));
  const tileH = Math.max(8, Math.floor(h / tilesY));
  const nx = Math.max(1, Math.ceil(w / tileW));
  const ny = Math.max(1, Math.ceil(h / tileH));
  const bins = 256;
  const cdfs: Float32Array[] = [];

  for (let ty = 0; ty < ny; ty++) {
    for (let tx = 0; tx < nx; tx++) {
      const x0 = tx * tileW;
      const y0 = ty * tileH;
      const x1 = Math.min(w, x0 + tileW);
      const y1 = Math.min(h, y0 + tileH);
      const hist = new Float32Array(bins);
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const yv = Math.max(0, Math.min(1, data[(y * w + x) * 4 + 3]));
          hist[(yv * (bins - 1)) | 0]++;
          count++;
        }
      }
      const clip = (clipLimit * count) / bins;
      let excess = 0;
      for (let i = 0; i < bins; i++) {
        if (hist[i] > clip) {
          excess += hist[i] - clip;
          hist[i] = clip;
        }
      }
      const redis = excess / bins;
      for (let i = 0; i < bins; i++) hist[i] += redis;
      const cdf = new Float32Array(bins);
      let acc = 0;
      for (let i = 0; i < bins; i++) {
        acc += hist[i];
        cdf[i] = acc / count;
      }
      cdfs.push(cdf);
    }
  }

  const sampleCdf = (tx: number, ty: number, bin: number) => {
    const cx = Math.max(0, Math.min(nx - 1, tx));
    const cy = Math.max(0, Math.min(ny - 1, ty));
    return cdfs[cy * nx + cx][bin];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const yv = Math.max(0, Math.min(1, data[p + 3]));
      const bin = (yv * (bins - 1)) | 0;
      const gx = x / tileW - 0.5;
      const gy = y / tileH - 0.5;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const dx = gx - x0;
      const dy = gy - y0;
      const v00 = sampleCdf(x0, y0, bin);
      const v10 = sampleCdf(x0 + 1, y0, bin);
      const v01 = sampleCdf(x0, y0 + 1, bin);
      const v11 = sampleCdf(x0 + 1, y0 + 1, bin);
      const mapped =
        v00 * (1 - dx) * (1 - dy) +
        v10 * dx * (1 - dy) +
        v01 * (1 - dx) * dy +
        v11 * dx * dy;
      const nyv = 0.4 * yv + 0.6 * mapped;
      const old = yv || 1e-6;
      const s = nyv / old;
      data[p] *= s;
      data[p + 1] *= s;
      data[p + 2] *= s;
      data[p + 3] = nyv;
    }
  }
}

export function applyTone(
  img: LinearImage,
  contrast: number,
  brightness: number,
  gamma: number,
  invert: boolean,
): void {
  const n = img.width * img.height;
  const g = Math.max(0.2, Math.min(3, gamma));
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    let y = img.data[p + 3];
    y = (y - 0.5) * contrast + 0.5 + brightness;
    y = Math.max(0, Math.min(1, y));
    y = y ** g;
    if (invert) y = 1 - y;
    const old = img.data[p + 3] || 1e-6;
    const s = y / old;
    img.data[p] *= s;
    img.data[p + 1] *= s;
    img.data[p + 2] *= s;
    img.data[p + 3] = y;
  }
}

export function faceWeightMap(
  width: number,
  height: number,
  faces: FaceRect[],
): Float32Array {
  const map = new Float32Array(width * height);
  if (faces.length === 0) {
    const cx = width * 0.5;
    const cy = height * 0.38;
    const rx = width * 0.28;
    const ry = height * 0.32;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        const d = nx * nx + ny * ny;
        map[y * width + x] = Math.max(0, 1 - d);
      }
    }
    return map;
  }
  for (const f of faces) {
    const x0 = Math.max(0, Math.floor(f.x * width));
    const y0 = Math.max(0, Math.floor(f.y * height));
    const x1 = Math.min(width, Math.ceil((f.x + f.width) * width));
    const y1 = Math.min(height, Math.ceil((f.y + f.height) * height));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = Math.max(8, (x1 - x0) * 0.65);
    const ry = Math.max(8, (y1 - y0) * 0.7);
    for (let y = Math.max(0, y0 - ry); y < Math.min(height, y1 + ry); y++) {
      for (let x = Math.max(0, x0 - rx); x < Math.min(width, x1 + rx); x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        const d = nx * nx + ny * ny;
        const v = Math.max(0, 1 - d);
        const i = y * width + x;
        if (v > map[i]) map[i] = v;
      }
    }
  }
  return map;
}

export function boostFaces(img: LinearImage, weights: Float32Array, amount = 0.35): void {
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const w = weights[i];
    if (w <= 0.02) continue;
    const p = i * 4;
    const y = img.data[p + 3];
    const ny = Math.max(0, Math.min(1, (y - 0.5) * (1 + amount * w) + 0.5));
    const old = y || 1e-6;
    const s = ny / old;
    img.data[p] *= s;
    img.data[p + 1] *= s;
    img.data[p + 2] *= s;
    img.data[p + 3] = ny;
  }
}

export function sampleBilinearY(img: LinearImage, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const dx = x - x0;
  const dy = y - y0;
  const v00 = getY(img, x0, y0);
  const v10 = getY(img, x0 + 1, y0);
  const v01 = getY(img, x0, y0 + 1);
  const v11 = getY(img, x0 + 1, y0 + 1);
  return v00 * (1 - dx) * (1 - dy) + v10 * dx * (1 - dy) + v01 * (1 - dx) * dy + v11 * dx * dy;
}
