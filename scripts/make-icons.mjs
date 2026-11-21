import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function glyph(x, y, s) {
  const bg = [10, 10, 10, 255];
  const fg = [124, 255, 178, 255];
  const t = 0.08 * s;
  const inset = 0.22 * s;
  if (x < t || y < t || x >= s - t || y >= s - t) return [18, 28, 22, 255];
  const nx = (x - s / 2) / s;
  const ny = (y - s / 2) / s;
  const bar = Math.abs(nx) < 0.08 && ny > -0.28 && ny < 0.32;
  const cap = ny < -0.18 && ny > -0.32 && Math.abs(nx) < 0.22;
  const serif = ny > 0.28 && ny < 0.36 && Math.abs(nx) < 0.18;
  if (bar || cap || serif) return fg;
  if (x > inset && x < s - inset && y > inset && y < s - inset && (x + y) % 7 === 0) {
    return [40, 70, 52, 255];
  }
  return bg;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
writeFileSync(join(dir, "icon-192.png"), png(192, glyph));
writeFileSync(join(dir, "icon-512.png"), png(512, glyph));
console.log("wrote icons");
