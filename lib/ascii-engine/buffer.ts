import { linearLuma, linearToSrgb, srgbToLinear } from "./color";

export type LinearImage = {
  width: number;
  height: number;
  /** Linear R, G, B, Y packed as 4 floats per pixel */
  data: Float32Array;
};

export function imageDataToLinear(image: ImageData): LinearImage {
  const { width, height, data } = image;
  const out = new Float32Array(width * height * 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 4) {
    const r = srgbToLinear(data[i]);
    const g = srgbToLinear(data[i + 1]);
    const b = srgbToLinear(data[i + 2]);
    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
    out[p + 3] = linearLuma(r, g, b);
  }
  return { width, height, data: out };
}

export function linearToImageData(img: LinearImage): ImageData {
  const { width, height, data } = img;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 4) {
    out[p] = linearToSrgb(data[i]);
    out[p + 1] = linearToSrgb(data[i + 1]);
    out[p + 2] = linearToSrgb(data[i + 2]);
    out[p + 3] = 255;
  }
  return new ImageData(out, width, height);
}

export function cloneLinear(img: LinearImage): LinearImage {
  return {
    width: img.width,
    height: img.height,
    data: new Float32Array(img.data),
  };
}

export function getY(img: LinearImage, x: number, y: number): number {
  const xx = Math.max(0, Math.min(img.width - 1, x));
  const yy = Math.max(0, Math.min(img.height - 1, y));
  return img.data[(yy * img.width + xx) * 4 + 3];
}

export function setY(img: LinearImage, x: number, y: number, v: number): void {
  img.data[(y * img.width + x) * 4 + 3] = v;
}
