# ASCII — project record for the next agent

**Read this file first.** It is the source of truth for what this repo is, how it is built, what is already done, and what is still open. If you are Antigravity (or any other agent), do not rediscover the architecture from scratch. Implement against this document and the code it points to.

Last updated: 2026-11-21.

---

## One-sentence product

**ASCII** is a production web app: open a live camera or upload a photo, convert it to print-sharp ASCII art entirely on-device, export HD / 4K / 8K. Nothing is uploaded.

Designer / developer credit (must stay in the footer on every page):

- Designed and developed by **Adi Binsheraz**
- Instagram: [@adibinsheraz](https://instagram.com/adibinsheraz)
- Email: [adi.binsheraz@gmail.com](mailto:adi.binsheraz@gmail.com)
- © 2026 ASCII. All rights reserved.

---

## Non-negotiable rules (do not trade these away)

1. **Output quality is the product.** UI, speed, and features exist to serve the ASCII image. If a choice trades quality for convenience, choose quality — except Live mode, which is allowed to be faster.
2. **Two engines, one grid.** Live = fast, 30fps+, good. Studio = snapshot/upload only, full-resolution source, slowest/best algorithms. Live preview must never cap export quality.
3. **Never upscale a small bitmap.** Render and export from the character grid at the target pixel size.
4. **100% private.** No image/video leaves the device. There is no upload API. Keep the “100% private, nothing is uploaded” note in the UI.
5. **Client-side only:** Next.js App Router + TypeScript + Tailwind. Conversion in Web Workers + OffscreenCanvas.
6. **Strict TypeScript:** no `any`, no leftover TODOs/placeholders in shipping UI.
7. **Next.js in this repo is not the Next.js from training data.** Read `AGENTS.md` and `node_modules/next/dist/docs/` before changing Next APIs. Do not delete the managed `AGENTS.md` block; `next dev` will put it back.

---

## How to run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm start
npm run lint
```

Quality lab (Live vs Studio on sample photos): **http://localhost:3000/dev/test**

Sample images: `public/samples/{portrait,landscape,low-light,high-contrast}.jpg`

PWA icons can be regenerated with:

```bash
node scripts/make-icons.mjs
```

---

## Stack

| Piece | Version / choice |
| --- | --- |
| Next.js | 16.4.6, App Router, `cacheComponents` + `partialPrefetching` on in `next.config.ts` |
| React | 19.3 |
| Tailwind | 4.3 (`@import "tailwindcss"` in `app/globals.css`) |
| TypeScript | 5, path alias `@/*` → repo root |
| Font (art) | JetBrains Mono, `public/fonts/JetBrainsMono-Regular.woff2`, family name `JetBrains Mono ASCII` |
| Font (UI) | Geist + Geist Mono via `next/font` |
| HEIC | optional `heic2any` (dynamic import in `lib/ascii-engine/decode.ts`) |
| Workers | `workers/studio.worker.ts` via `new Worker(new URL(..., import.meta.url))` |

No backend. No database. No env secrets required.

---

## Folder map

```
app/
  layout.tsx              # metadata, PWA, skip link, fonts, dark body
  page.tsx                # <StudioApp />
  globals.css             # tokens, scanlines, skeleton, reduced motion
  robots.ts
  dev/test/page.tsx       # engine lab route → EngineLab

components/
  StudioApp.tsx           # landing ↔ camera ↔ image, worker, live loop, snapshot, record
  Landing.tsx             # wordmark, Open Camera, Upload, drop zone
  AsciiCanvas.tsx         # draws AsciiGrid at container size * dpr
  ControlPanel.tsx        # ramps, density, color, dither, finish
  ExportSheet.tsx         # HD/4K/8K/custom, png/jpg/svg/txt/html, share, copy
  Footer.tsx              # Adi Binsheraz credit (do not change copy)
  EngineLab.tsx           # /dev/test: samples + Live vs Studio slider
  CompareSlider.tsx
  ServiceWorkerRegister.tsx  # production only

hooks/
  useCamera.ts            # getUserMedia HD, flip, mirror, hide/stop, errors
  useClipboardImage.ts    # paste image
  useHaptics.ts           # navigator.vibrate on snapshot

lib/ascii-engine/         # standalone converter (the core product)
  index.ts                # public exports
  types.ts                # AsciiGrid, settings, ramps, palettes
  color.ts                # sRGB ↔ linear, Rec.709 luma, palettes
  buffer.ts               # LinearImage (R,G,B,Y)
  glyphs.ts               # rasterize ramp, 12×24 patches, live LUT
  match.ts                # Studio shape matching + dither targets
  studio.ts               # full Studio pipeline
  live.ts                 # LUT + temporal hysteresis
  preprocess.ts           # auto levels, CLAHE, unsharp, denoise, faces
  sobel.ts                # edges → / \ | _ -
  dither.ts               # Floyd–Steinberg, Bayer, blue noise
  faces.ts                # optional FaceDetector
  decode.ts               # file/bitmap/HEIC + EXIF orientation
  render.ts               # grid → canvas / SVG / HTML / TXT
  export.ts               # tiled HD–8K export, canvas size fallback
  serialize.ts            # glyph bank over the worker boundary

lib/workers/engine-client.ts
workers/studio.worker.ts

public/
  fonts/JetBrainsMono-Regular.woff2
  samples/*.jpg
  manifest.webmanifest
  sw.js
  favicon.svg, og.svg, icon-192.png, icon-512.png

scripts/make-icons.mjs
PROJECT.md                # this file
README.md                 # user-facing setup + engine explanation
AGENTS.md                 # Next.js managed agent rules
heic2any.d.ts
```

---

## Architecture (read this before editing the engine)

### Shared output: `AsciiGrid`

Both engines emit:

- `cols`, `rows`
- `cells[]`: `{ glyphIndex, char, luma, r, g, b }`
- `metrics.aspect` from real JetBrains Mono cell width/height
- `background`: `black` | `charcoal` | `transparent`

Renderer and exporters **only** consume this grid. Preview size does not matter for export.

### Live vs Studio

| | Live | Studio |
| --- | --- | --- |
| When | Camera loop | Upload, paste, drop, snapshot |
| Source | Frame downscaled to ~960px wide | Full-resolution `ImageData` |
| Columns default | 132 (cap ~240) | 280 (user up to 560, code cap 720) |
| Matching | 2×2 region LUT (`liveLut`) | 4×8 regions, then 12×24 patch on top 8 candidates |
| Extra | Auto exposure, luma mix 0.38, hysteresis 0.045 | CLAHE, unsharp, denoise (if ≤2MP), auto levels, Sobel, dither, face weights |
| Thread | Worker (`convertLive`) | Worker (`convertStudio`) |
| Glyph bank | Same bank, rebuilt when ramp/customRamp changes | Same |

Row count formula (`studioRows` in `studio.ts`):

```
rows = round(columns * (imageHeight / imageWidth) * glyphAspect)
```

`glyphAspect` is `cellWidth / cellHeight` (~0.55). This is what prevents stretched faces.

### Worker protocol

`EngineClient.start(bank)` serializes the glyph bank + atlas `ImageBitmap`, posts `init`. Then:

- `{ type: "live"|"studio", id, pixels, width, height, settings, faces, background }`
- Pixel buffer is transferred (copied first with `slice()` so the original `ImageData` stays usable).
- Reply: `{ type: "grid", id, grid, mode }` or `{ type: "error", id, error }`.

`StudioApp` uses a generation counter so stale Studio jobs do not overwrite a newer render.

### Rendering

`renderGridToContext` in `render.ts`:

- Fills background (or clears for transparent).
- Uniform palettes (mono / phosphor / amber / ice / custom): draw whole lines with `fillText` + horizontal scale to cell width.
- Full color / duotone / gradient: per-cell `fillText`, or atlas blit in **fast** live mode when cells are tiny.
- `textRendering = geometricPrecision` (hinting off as much as canvas allows).
- Finish (off by default except light glow ~0.18): glow, grain, vignette, scanlines, grade.

Export (`export.ts`):

- Presets: HD 1920, 4K 3840, 8K 7680 on the **long edge**, plus Custom.
- Detects max canvas size; tiles when needed; if the device cannot allocate, exports the largest safe size **and shows a message**. Never silent upscale.
- Names: `ASCII_YYYYMMDD_HHMMSS.{png|jpg|svg|txt|html}`.

---

## UI flow

1. **Landing** (`view === "landing"`): ASCII wordmark, Open Camera, Upload Image, drop/paste. File `<input>` is always mounted (including on landing — that was a bug; do not nest it only in the studio view).
2. **Camera**: hidden `<video>`, ASCII canvas, Flip / Mirror / Snap / Rec, live controls. Errors: denied / missing / busy / unknown.
3. **Image (Studio)**: after upload or Snap. Settings debounce 180ms then full Studio re-render.
4. **Export sheet**: overlay dialog.
5. **Controls**: side panel on desktop (`lg:w-[340px]`), bottom sheet toggle on mobile.

Design tokens (`app/globals.css`):

- Background `#0a0a0a`, ink `#ece8df`, accent `#7cffb2`
- Mobile-first, `min-h-11` touch targets, `env(safe-area-inset-*)`, `dvh`, no horizontal scroll
- Dark only. Reduced motion: animations off.

---

## Defaults (do not “simplify” these without a quality reason)

From `DEFAULT_SETTINGS` / `DEFAULT_FINISH` / `LIVE_SETTINGS_OVERRIDE` in `lib/ascii-engine/types.ts`:

- Studio columns 160, contrast 1.20, brightness 0.00, gamma 0.92, sharpness 0.72, edges 0.42
- Dither Floyd–Steinberg, ramp **detailed**, CLAHE / denoise / auto levels / face-aware **on**
- Live columns 140, contrast 1.15, sharpness 0.42, edges 0.36, live columns slider reactive in real time
- Glow 0.00 (pure, ultra-crisp typography without muddying blur); grain/vignette/scanlines 0; grade none
- Canvas DPR cap: 3 for ultra-crisp display on HiDPI / Retina screens
- Export default preset: 4K (3840px long edge) PNG

Ramps: classic, detailed (70), blocks, minimal, binary, matrix, plus custom string.

Color modes: mono, phosphor, amber, ice, full (source color + saturation boost), duotone, gradient, custom accent.

---

## What is already implemented

Treat these as **done** unless you find a real bug:

- [x] Standalone Studio + Live engines under `/lib/ascii-engine`
- [x] Shape matching (not brightness-only), glyph atlas, live LUT
- [x] Linear-light path, CLAHE, unsharp, denoise, auto levels, Sobel directional glyphs, dither
- [x] Face-aware weighting when `FaceDetector` exists; portrait-shaped fallback map otherwise
- [x] Worker client + `studio.worker.ts` with startPromise awaiting
- [x] Landing, camera, upload, drag-drop, clipboard paste, safe HEIC attempt, EXIF via `createImageBitmap({ imageOrientation: "from-image" })`
- [x] Front/back camera, mirror, snapshot → Studio, MediaRecorder clip from output canvas, native shutter button at bottom, camera fixed at top
- [x] Control panel with categorized tabs (Density, Type, Color, Process, Finish) and sliding drawer (slide-up bottom sheet on mobile, collapsible sliding side drawer on desktop)
- [x] Export HD/4K/8K/custom, PNG/JPG/SVG/TXT/HTML, copy text, Web Share, progress, canvas-limit message, exact long-edge aspect calculation
- [x] `/dev/test` comparison lab on four samples with adaptive aspect ratio
- [x] Footer credit, privacy copy, PWA manifest + `sw.js` (registered in **production** only)
- [x] SEO metadata, metadataBase, robots, favicon/og, openGraph + twitter dynamic PNG generation, dark theme CSS
- [x] Clean TypeScript (`tsc --noEmit`) and ESLint (`eslint .`) with zero errors and zero warnings
- [x] Next.js 16 build passing with 100% static generation
- [x] README engine explanation

---

## Open TODOs / remaining work

Priority is still **output quality first**, then proof, then polish.

### P0 — quality (do this before new features)

- [x] **Verify Studio on all four samples** at `/dev/test`. Studio clearly beats Live: sharp eyes/jaw/hair, no stretch, no banding, no muddy shadows, no blown highlights, no blurry glyphs.
- [x] Tune `match.ts` / `preprocess.ts` / `DEFAULT_SETTINGS`: sample cell boundary check fixed to prevent black zeros; low-contrast noise suppression added (`contrastFactor`); targetMean routed into `scoreGlyph` for dithered accuracy.
- [x] Confirm cell aspect on landscape vs portrait (verified: physical rendered aspect equals source image aspect).
- [x] Confirm export PNG at 4K/8K is drawn from the grid (fixed aspect calculation in `export.ts` so long edge is respected on both portrait and landscape).

### P1 — correctness / hygiene

- [x] Finish a clean `npx tsc --noEmit` and `npx eslint .`: zero errors, zero warnings.
- [x] `npm run build` passes on Next 16.
- [x] Worker + Turbopack: verified `new Worker(new URL("../../workers/studio.worker.ts", import.meta.url))` works in `next dev` and production build.
- [x] Glyph bank rebuild: `engine.start()` tracked with `startPromise` and awaited before `setBank`, so jobs do not hit a terminated worker.
- [x] Live loop: reuse scratch canvas (`scratchRef.current`); no per-frame allocation.
- [x] `heic2any` dynamic import with friendly error handling wrapped in `ImageDecodeError` without duplicate calls.

### P2 — product completeness from the original brief

- [ ] **Lighthouse 95+** Performance / A11y / Best Practices / SEO on mobile.
- [ ] First load < 2s on 4G.
- [ ] Real device pass: iOS Safari, Chrome Android, desktop Chrome, Firefox, Edge. Watch iOS canvas limits on 8K.
- [x] Keyboard + visible focus + screen reader pass on landing, camera errors, export dialog, sliders.
- [x] PWA installability on Android/iOS (icons 192/512 exist; SW only in production).
- [x] OG image: PNG generated dynamically via `next/og` (`/opengraph-image` & `/twitter-image`).
- [x] Recording: WebM supported with fallback message for unsupported browsers.
- [x] Camera: resume after tab hidden (`useCamera` visibilitychange listener restarts if `wantLive`).
- [x] Long-edge presets: HD (1920), 4K (3840), 8K (7680), and Custom long-edge.

### P3 — do not do unless asked

- [ ] Do not add a server, accounts, analytics that upload frames, or watermark.
- [ ] Do not replace JetBrains Mono without re-measuring glyph aspect and rebuilding the atlas.
- [ ] Do not drive the live preview from a tiny bitmap that export then stretches.
- [ ] Do not commit `.env` secrets (there should be none).
- [ ] Do not rewrite Next App Router to Pages Router.
- [ ] Do not remove `AGENTS.md` Next.js agent block.

---

## Known pitfalls

- **Landing upload** must use a file input that is rendered even when `view === "landing"`.
- **Worker `start()`** terminates the previous worker. Always `await start()` then `setBank`.
- **Studio on huge photos** is slow on purpose. Denoise is skipped above 2MP (`studio.ts`). Matching is coarse-then-fine (regions, then 12×24 on 8 candidates) so it can finish.
- **Service worker** in `public/sw.js` would stale-cache `next dev` — registration is production-only.
- **React 19 / eslint `react-hooks/refs`**: do not pass a hook return object that *contains* a ref into JSX; destructure `videoRef`, `ready`, `error`, etc. (see `StudioApp.tsx`).
- **OffscreenCanvas `getContext("2d")`** is typed as a union; cast through a small `context2d()` helper (`render.ts`, `export.ts`).
- Font must load (`loadAsciiFont`) before first atlas/render or glyphs are missing.

---

## How to continue (suggested order)

1. Run `npm run dev`, open `/` and `/dev/test`.
2. Inspect Studio vs Live on `portrait.jpg`. If Studio is not clearly better, tune the engine — not the landing page.
3. Fix any `tsc` / `eslint` / `next build` failures.
4. Exercise camera (permission denied, no camera, snapshot → Studio → 4K PNG).
5. Only then polish layout, Lighthouse, and extra effects.

When you change the engine, update **this file’s “What is already implemented” / TODOs** so the next agent does not redo finished work.

---

## Quick file → job index

| If you need to change… | Start here |
| --- | --- |
| Character matching quality | `lib/ascii-engine/match.ts`, `glyphs.ts` |
| Photo preprocess | `lib/ascii-engine/preprocess.ts`, `studio.ts` |
| Live flicker / FPS | `lib/ascii-engine/live.ts`, `StudioApp.tsx` live `useEffect` |
| Colors / palettes | `lib/ascii-engine/color.ts`, `types.ts` |
| Sharp export | `lib/ascii-engine/render.ts`, `export.ts` |
| Camera UX | `hooks/useCamera.ts`, `StudioApp.tsx` |
| Look and feel | `app/globals.css`, `components/Landing.tsx`, `ControlPanel.tsx` |
| Engine comparison | `components/EngineLab.tsx`, `app/dev/test/page.tsx` |
