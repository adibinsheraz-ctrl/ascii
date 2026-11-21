import type { LinearImage } from "./buffer";

export type EdgeField = {
  mag: Float32Array;
  angle: Float32Array;
  width: number;
  height: number;
};

export function sobel(img: LinearImage): EdgeField {
  const { width: w, height: h, data } = img;
  const mag = new Float32Array(w * h);
  const angle = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (yy: number, xx: number) => data[(yy * w + xx) * 4 + 3];
      const gx =
        -i(y - 1, x - 1) +
        i(y - 1, x + 1) -
        2 * i(y, x - 1) +
        2 * i(y, x + 1) -
        i(y + 1, x - 1) +
        i(y + 1, x + 1);
      const gy =
        -i(y - 1, x - 1) -
        2 * i(y - 1, x) -
        i(y - 1, x + 1) +
        i(y + 1, x - 1) +
        2 * i(y + 1, x) +
        i(y + 1, x + 1);
      const m = Math.hypot(gx, gy);
      mag[y * w + x] = m;
      angle[y * w + x] = Math.atan2(gy, gx);
    }
  }
  return { mag, angle, width: w, height: h };
}

/** Map edge angle to a line glyph that follows the contour. */
export const DIRECTIONAL_GLYPHS = ["-", "/", "|", "\\", "_"] as const;

export function directionalChar(angle: number): (typeof DIRECTIONAL_GLYPHS)[number] {
  // Sobel angle is gradient direction (normal to the edge). Rotate 90° for tangent.
  let deg = ((angle + Math.PI / 2) * 180) / Math.PI;
  deg = ((deg % 180) + 180) % 180;
  if (deg < 22.5 || deg >= 157.5) return "-";
  if (deg < 67.5) return "/";
  if (deg < 112.5) return "|";
  return "\\";
}

export function cellEdge(
  field: EdgeField,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { mag: number; angle: number } {
  const xA = Math.max(0, Math.floor(x0));
  const yA = Math.max(0, Math.floor(y0));
  const xB = Math.min(field.width, Math.ceil(x1));
  const yB = Math.min(field.height, Math.ceil(y1));
  let magSum = 0;
  let gx = 0;
  let gy = 0;
  let n = 0;
  for (let y = yA; y < yB; y++) {
    for (let x = xA; x < xB; x++) {
      const m = field.mag[y * field.width + x];
      const a = field.angle[y * field.width + x];
      magSum += m;
      gx += Math.cos(a) * m;
      gy += Math.sin(a) * m;
      n++;
    }
  }
  if (n === 0) return { mag: 0, angle: 0 };
  return { mag: magSum / n, angle: Math.atan2(gy, gx) };
}
