# ASCII

A private, on-device web app that turns a live camera or a still photo into print-sharp ASCII art. Nothing is uploaded.

**Agents / Antigravity:** read [`PROJECT.md`](./PROJECT.md) first. It is the full project record, architecture, and TODO list.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |

Sample photos live in `public/samples/`. The quality lab is at `/dev/test`.

## How the engine works

Conversion never maps brightness to a character and stops there. The pipeline is a **character grid**: each cell is a glyph plus color. Preview and export draw that grid at the target pixel size (HD, 4K, 8K). A small preview bitmap is never stretched.

### Live (camera)

- Downscales the frame for speed (about 960px wide), then shape-matches with a **2×2 luminance LUT**.
- Auto exposure and contrast for bad lighting.
- Temporal smoothing plus hysteresis so glyphs do not flicker between frames.
- Target: 30fps+ on a mid-range phone, via a Web Worker.

### Studio (snapshot and upload)

Runs from the **full-resolution** source:

1. Linear-light conversion (Rec. 709 luma, sRGB gamma).
2. Auto levels, optional edge-preserving denoise, CLAHE, unsharp mask.
3. Face-aware contrast if the browser exposes `FaceDetector`.
4. Sobel edges; strong contours can lock to `/ \ \| _ -`.
5. Each cell is supersampled (12×24 patch, 4×8 regions) and matched to pre-rasterized glyphs.
6. Optional Floyd–Steinberg, ordered, or blue-noise dither.

Cell height follows the real metrics of JetBrains Mono so the picture is not stretched.

### Rendering and export

Glyphs are drawn with `fillText` / a glyph atlas at the export size. Large canvases are tiled; if the device hits a canvas cap (common on iOS), the file is limited to the safe size and the UI says so. SVG export has no pixel cap.

Formats: PNG, JPEG, SVG, TXT, HTML. File names: `ASCII_YYYYMMDD_HHMMSS.ext`.

## Privacy

Images and video are decoded and converted in the browser (main thread + worker). There is no upload API.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, Web Workers, OffscreenCanvas, JetBrains Mono.
