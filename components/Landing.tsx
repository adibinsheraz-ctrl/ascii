"use client";

import { Footer } from "./Footer";

const SAMPLES = [
  { id: "portrait", label: "Portrait", src: "/samples/portrait.jpg", tag: "Studio HD", spec: "3:4 · Sharp" },
  { id: "low-light", label: "Cyberpunk", src: "/samples/low-light.jpg", tag: "Atmosphere", spec: "3:2 · Glow" },
  { id: "high-contrast", label: "High Contrast", src: "/samples/high-contrast.jpg", tag: "Monochrome", spec: "3:2 · Deep" },
  { id: "landscape", label: "Architecture", src: "/samples/landscape.jpg", tag: "Ultra Wide", spec: "16:10 · Line" },
] as const;

export function Landing(props: {
  onCamera: () => void;
  onUpload?: () => void;
  onFile?: (file: File) => void;
  onSample?: (src: string) => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col px-5 pt-[max(2rem,env(safe-area-inset-top))] bg-[#080808]">
      <div className="scanlines pointer-events-none fixed inset-0 opacity-15" aria-hidden />

      <main id="main" className="fade-in mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center py-8">
        {/* Top Eyebrow Badge */}
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          <p className="font-mono text-[11px] tracking-[0.28em] text-accent font-medium uppercase">
            on device privacy
          </p>
        </div>

        {/* Wordmark */}
        <h1 className="wordmark mt-4 text-[22vw] leading-[0.78] sm:text-[7.5rem] select-none tracking-tight">
          ASCII
        </h1>

        <p className="mt-6 max-w-lg text-pretty text-[17px] leading-relaxed text-white/80 font-normal">
          Open the camera to turn live video into print-sharp ASCII type. 100% private and processed in real time on-device.
        </p>

        {/* Primary Action Buttons */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={props.onCamera}
            className="btn-primary flex-1 sm:flex-initial sm:min-w-[220px]"
          >
            <svg
              className="h-4 w-4 transition-transform group-hover:scale-110"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            <span>Open Camera</span>
          </button>

          {props.onSample && (
            <button
              type="button"
              onClick={() => props.onSample?.("/samples/portrait.jpg")}
              className="btn-secondary sm:w-auto"
            >
              <span>Try Sample</span>
            </button>
          )}
        </div>

        {/* Curated Sample Gallery for Instant Quality Proof */}
        {props.onSample && (
          <div className="mt-8 border-t border-white/8 pt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[11px] tracking-[0.2em] text-white/50 uppercase font-medium">
                Instant Quality Samples
              </span>
              <span className="font-mono text-[10px] text-accent/80 font-medium">Click to load Studio</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => props.onSample?.(s.src)}
                  className="group relative flex flex-col justify-between rounded-md border border-white/10 bg-white/[0.02] p-3.5 text-left transition-all hover:border-accent/50 hover:bg-white/[0.05] active:scale-95"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-accent/90 font-medium">
                        {s.tag}
                      </span>
                      <span className="font-mono text-[9px] text-white/30">
                        {s.spec}
                      </span>
                    </div>
                    <span className="mt-2 block font-mono text-[13px] font-semibold text-white group-hover:text-accent transition-colors">
                      {s.label}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-1 font-mono text-[10px] text-white/40 group-hover:text-white transition-colors">
                    <span>Convert</span>
                    <span className="transition-transform group-hover:translate-x-0.5">→</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Feature Highlights Ribbon */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-white/6 pt-5">
          <div className="font-mono text-[10px] text-white/40">
            <span className="block text-white/70 font-medium">JETBRAINS MONO</span>
            Real glyph metrics
          </div>
          <div className="font-mono text-[10px] text-white/40">
            <span className="block text-white/70 font-medium">SHAPE MATCHING</span>
            Euclidean patch SSD
          </div>
          <div className="font-mono text-[10px] text-white/40">
            <span className="block text-white/70 font-medium">WEBGL2 GPU ACCEL</span>
            Zero CPU readback
          </div>
          <div className="font-mono text-[10px] text-white/40">
            <span className="block text-white/70 font-medium">UP TO 8K EXPORT</span>
            No bitmap upscaling
          </div>
        </div>

        <p className="mt-6 max-w-md text-[12px] leading-relaxed text-white/35 font-mono">
          100% private. Converted locally in browser memory. Photos never leave this device.
        </p>
      </main>

      <Footer />
    </div>
  );
}
