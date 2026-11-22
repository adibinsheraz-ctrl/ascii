"use client";

import { Footer } from "./Footer";

export function Landing(props: {
  onCamera: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] bg-[#080808]">
      <div className="scanlines pointer-events-none fixed inset-0 opacity-15" aria-hidden />

      {/* Top Bar with Instagram and Gmail icons */}
      <header className="mx-auto flex w-full max-w-3xl items-center justify-end py-2">
        <div className="flex items-center gap-2.5">
          <a
            href="https://instagram.com/adibinsheraz"
            target="_blank"
            rel="noreferrer"
            aria-label="Instagram"
            title="Instagram (@adibinsheraz)"
            className="flex items-center justify-center rounded-full p-2 transition-all duration-200 hover:scale-110 bg-white/5 border border-white/10 hover:border-accent/40 hover:bg-white/10 opacity-80 hover:opacity-100"
          >
            <img src="/instagram.png" alt="Instagram" className="h-4 w-4 object-contain" />
          </a>
          <a
            href="mailto:adi.binsheraz@gmail.com"
            aria-label="Gmail"
            title="Gmail (adi.binsheraz@gmail.com)"
            className="flex items-center justify-center rounded-full p-2 transition-all duration-200 hover:scale-110 bg-white/5 border border-white/10 hover:border-accent/40 hover:bg-white/10 opacity-80 hover:opacity-100"
          >
            <img src="/gmail.png" alt="Gmail" className="h-4 w-4 object-contain" />
          </a>
        </div>
      </header>

      <main id="main" className="fade-in mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center py-8">
        {/* Wordmark */}
        <h1 className="wordmark text-[22vw] leading-[0.78] sm:text-[7.5rem] select-none tracking-tight">
          ASCII
        </h1>

        <p className="mt-6 max-w-lg text-pretty text-[17px] leading-relaxed text-white/80 font-normal">
          Open the camera to turn live video into print-sharp ASCII typography in real time.
        </p>

        {/* Primary Action Button */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={props.onCamera}
            className="btn-primary flex-1 sm:flex-initial sm:min-w-[240px]"
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
        </div>

        {/* Feature Highlights Ribbon */}
        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-white/8 pt-6">
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
      </main>

      <Footer />
    </div>
  );
}
