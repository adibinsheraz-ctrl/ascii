"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CompareSlider } from "@/components/CompareSlider";
import { Footer } from "@/components/Footer";
import { imageDataFromUrl } from "@/lib/ascii-engine/decode";
import { createGlyphBank } from "@/lib/ascii-engine/glyphs";
import { renderGridToContext } from "@/lib/ascii-engine/render";
import {
  DEFAULT_FINISH,
  DEFAULT_SETTINGS,
  LIVE_SETTINGS_OVERRIDE,
  type AsciiGrid,
  type GlyphBank,
} from "@/lib/ascii-engine/types";
import { EngineClient } from "@/lib/workers/engine-client";

const SAMPLES = [
  { id: "portrait", src: "/samples/portrait.jpg", label: "Portrait", aspect: "aspect-[3/4]" },
  { id: "landscape", src: "/samples/landscape.jpg", label: "Landscape", aspect: "aspect-[16/10]" },
  { id: "low-light", src: "/samples/low-light.jpg", label: "Low light", aspect: "aspect-[3/2]" },
  { id: "high-contrast", src: "/samples/high-contrast.jpg", label: "High contrast", aspect: "aspect-[3/2]" },
] as const;

function downscale(image: ImageData, maxW: number): ImageData {
  if (image.width <= maxW) return image;
  const scale = maxW / image.width;
  const w = Math.round(image.width * scale);
  const h = Math.round(image.height * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return image;
  const src = document.createElement("canvas");
  src.width = image.width;
  src.height = image.height;
  src.getContext("2d")?.putImageData(image, 0, 0);
  ctx.drawImage(src, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function gridToUrl(grid: AsciiGrid, bank: GlyphBank, longEdge: number): string {
  const aspect = (grid.cols * grid.metrics.aspect) / grid.rows;
  const width = aspect >= 1 ? longEdge : Math.round(longEdge * aspect);
  const height = Math.max(1, Math.round(width / aspect));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  renderGridToContext({
    ctx,
    grid,
    bank,
    palette: {
      colorMode: "mono",
      customAccent: "#7CFFB2",
      duotoneLow: "#2B0A4A",
      duotoneHigh: "#FF4D8D",
      background: "black",
    },
    width,
    height,
    finish: DEFAULT_FINISH,
  });
  return canvas.toDataURL("image/png");
}

export function EngineLab() {
  const [bank, setBank] = useState<GlyphBank | null>(null);
  const [active, setActive] = useState<(typeof SAMPLES)[number]["id"]>("portrait");
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [studioUrl, setStudioUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading font");
  const [ms, setMs] = useState<{ live: number; studio: number } | null>(null);
  const engineRef = useRef(new EngineClient());

  const sample = useMemo(() => SAMPLES.find((s) => s.id === active) ?? SAMPLES[0], [active]);

  useEffect(() => {
    let gone = false;
    (async () => {
      const b = await createGlyphBank("detailed", "");
      if (gone) return;
      await engineRef.current.start(b);
      if (gone) return;
      setBank(b);
    })();
    const engine = engineRef.current;
    return () => {
      gone = true;
      engine.stop();
    };
  }, []);

  useEffect(() => {
    if (!bank) return;
    let gone = false;
    (async () => {
      setStatus(`Reading ${sample.label}`);
      setLiveUrl(null);
      setStudioUrl(null);
      const image = await imageDataFromUrl(sample.src);
      if (gone) return;

      setStatus("Live engine");
      const t0 = performance.now();
      const liveGrid = await engineRef.current.live(
        downscale(image, 960),
        { ...DEFAULT_SETTINGS, ...LIVE_SETTINGS_OVERRIDE, columns: 120 },
        "black",
      );
      const liveMs = performance.now() - t0;
      if (gone) return;
      setLiveUrl(gridToUrl(liveGrid, bank, 1400));

      setStatus("Studio engine (full resolution)");
      const t1 = performance.now();
      const studioGrid = await engineRef.current.studio(
        image,
        { ...DEFAULT_SETTINGS, columns: 320, dither: "floyd-steinberg" },
        [],
        "black",
      );
      const studioMs = performance.now() - t1;
      if (gone) return;
      setStudioUrl(gridToUrl(studioGrid, bank, 1800));
      setMs({ live: liveMs, studio: studioMs });
      setStatus("Ready");
    })().catch(() => {
      if (!gone) setStatus("Engine failed");
    });
    return () => {
      gone = true;
    };
  }, [bank, sample]);

  return (
    <div className="min-h-dvh bg-bg px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <main id="main" className="mx-auto max-w-5xl pb-10">
        <p className="font-mono text-[11px] tracking-[0.24em] text-accent/80">/dev/test</p>
        <h1 className="mt-2 font-mono text-3xl tracking-tight">Engine lab</h1>
        <p className="mt-2 max-w-xl text-sm text-white/55">
          Live on the right uses the fast LUT path at camera resolution. Studio on the left re-renders
          from the full photograph with shape matching, CLAHE, unsharp, Sobel edges, and dithering.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={`min-h-11 border px-4 font-mono text-[12px] ${
                active === s.id ? "border-accent text-accent" : "border-white/12 text-white/60"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-4 font-mono text-[11px] text-white/40">{status}</p>
        {ms && (
          <p className="font-mono text-[11px] text-white/40">
            Live {ms.live.toFixed(0)} ms · Studio {ms.studio.toFixed(0)} ms
          </p>
        )}
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div>
            {liveUrl && studioUrl ? (
              <CompareSlider
                before={liveUrl}
                after={studioUrl}
                beforeLabel="Live"
                afterLabel="Studio"
                className={sample.aspect}
              />
            ) : (
              <div className={`skeleton w-full ${sample.aspect}`} />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 content-start">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sample.src} alt={`Original ${sample.label}`} className="w-full border border-white/10" />
              <figcaption className="mt-1 font-mono text-[10px] text-white/40">Original</figcaption>
            </figure>
            {studioUrl && (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={studioUrl} alt="Studio ASCII" className="w-full border border-white/10" />
                <figcaption className="mt-1 font-mono text-[10px] text-white/40">Studio</figcaption>
              </figure>
            )}
            {liveUrl && (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={liveUrl} alt="Live ASCII" className="w-full border border-white/10" />
                <figcaption className="mt-1 font-mono text-[10px] text-white/40">Live</figcaption>
              </figure>
            )}
          </div>
        </div>
        <p className="mt-8 text-[13px] text-white/45">
          Check: no banding in skies, faces stay sharp, aspect is not stretched, glyphs stay crisp when
          you zoom. Studio should clearly beat Live on edges and shading.
        </p>
      </main>
      <Footer />
    </div>
  );
}
