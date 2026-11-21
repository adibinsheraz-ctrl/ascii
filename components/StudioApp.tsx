"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AsciiCanvas } from "@/components/AsciiCanvas";
import { ControlPanel } from "@/components/ControlPanel";
import { DebugHUD } from "@/components/DebugHUD";
import { ExportSheet } from "@/components/ExportSheet";
import { Footer } from "@/components/Footer";
import { Landing } from "@/components/Landing";
import { useCamera } from "@/hooks/useCamera";
import { useClipboardImage } from "@/hooks/useClipboardImage";
import { haptic } from "@/hooks/useHaptics";
import { AdaptiveQualityController, type QualityState } from "@/lib/ascii-engine/adaptive";
import { profileDevice, type DeviceProfile } from "@/lib/ascii-engine/device";
import { detectFaces } from "@/lib/ascii-engine/faces";
import { createGlyphBank } from "@/lib/ascii-engine/glyphs";
import { imageDataFromSource, imageDataFromUrl } from "@/lib/ascii-engine/decode";
import { studioRows } from "@/lib/ascii-engine/studio";
import {
  DEFAULT_FINISH,
  DEFAULT_SETTINGS,
  LIVE_SETTINGS_OVERRIDE,
  type AsciiGrid,
  type AsciiSettings,
  type BackgroundMode,
  type FinishEffects,
  type GlyphBank,
  type RenderPalette,
} from "@/lib/ascii-engine/types";
import { WebGL2AsciiRenderer } from "@/lib/ascii-engine/webgl-live";
import { EngineClient } from "@/lib/workers/engine-client";

type View = "landing" | "camera" | "image";

export function StudioApp() {
  const [view, setView] = useState<View>("landing");
  const [settings, setSettings] = useState<AsciiSettings>(DEFAULT_SETTINGS);
  const [liveSettings, setLiveSettings] = useState<AsciiSettings>({
    ...DEFAULT_SETTINGS,
    ...LIVE_SETTINGS_OVERRIDE,
  });
  const [finish, setFinish] = useState<FinishEffects>(DEFAULT_FINISH);
  const [background, setBackground] = useState<BackgroundMode>("black");
  const [bank, setBank] = useState<GlyphBank | null>(null);
  const [grid, setGrid] = useState<AsciiGrid | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("Loading typeface");
  const [scanKey, setScanKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sourceRef = useRef<ImageData | null>(null);
  const engineRef = useRef(new EngineClient());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const webglRendererRef = useRef<WebGL2AsciiRenderer | null>(null);
  const profileRef = useRef<DeviceProfile | null>(null);
  const adaptiveRef = useRef<AdaptiveQualityController | null>(null);
  const [debugMode] = useState(
    () => typeof window !== "undefined" && window.location.search.includes("debug"),
  );
  const [qualityState, setQualityState] = useState<QualityState | null>(null);
  const [hudRows, setHudRows] = useState(0);
  const [camRes, setCamRes] = useState<{ width: number; height: number } | undefined>(undefined);
  const [sourceDim, setSourceDim] = useState<{ width: number; height: number } | null>(null);
  const [activeEngine, setActiveEngine] = useState<"WebGL2 (GPU)" | "Worker (CPU)">(
    () => (typeof window !== "undefined" && Boolean(window.WebGL2RenderingContext) ? "WebGL2 (GPU)" : "Worker (CPU)"),
  );

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const {
    videoRef,
    start: startStream,
    stop: stopStream,
    flip,
    mirror,
    setMirror,
    error: cameraError,
    ready: cameraReady,
  } = useCamera();
  const liveLoop = useRef(0);
  const capturing = useRef(false);
  const studioGen = useRef(0);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);

  const activeSettings = view === "camera" ? liveSettings : settings;
  const rampKey = `${activeSettings.ramp}::${activeSettings.customRamp}`;

  const palette: RenderPalette = useMemo(
    () => ({
      colorMode: activeSettings.colorMode,
      customAccent: activeSettings.customAccent,
      duotoneLow: activeSettings.duotoneLow,
      duotoneHigh: activeSettings.duotoneHigh,
      background,
    }),
    [activeSettings, background],
  );

  const liveSettingsRef = useRef(liveSettings);
  const finishRef = useRef(finish);
  const paletteRef = useRef(palette);
  const backgroundRef = useRef(background);

  useEffect(() => {
    liveSettingsRef.current = liveSettings;
  }, [liveSettings]);

  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  useEffect(() => {
    paletteRef.current = palette;
  }, [palette]);

  useEffect(() => {
    backgroundRef.current = background;
  }, [background]);

  useEffect(() => {
    let gone = false;
    (async () => {
      setStatus("Loading typeface");
      const next = await createGlyphBank(activeSettings.ramp, activeSettings.customRamp);
      if (gone) return;
      await engineRef.current.start(next);
      if (gone) return;
      setBank(next);
      if (webglRendererRef.current) {
        webglRendererRef.current.setGlyphBank(next);
      }
      setStatus("Ready");
      setLoadError(null);
    })().catch(() => {
      if (!gone) {
        setStatus("Engine failed");
        setLoadError("The conversion engine could not start. Reload the page.");
      }
    });
    return () => {
      gone = true;
    };
    // rampKey captures the ramp fields used to build the glyph bank
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rampKey]);

  useEffect(() => {
    if (view !== "camera") {
      webglRendererRef.current?.destroy();
      webglRendererRef.current = null;
      return;
    }
    const canvas = webglCanvasRef.current;
    if (!canvas) return;
    try {
      const renderer = new WebGL2AsciiRenderer(canvas);
      if (bank) renderer.setGlyphBank(bank);
      webglRendererRef.current = renderer;
    } catch {
      webglRendererRef.current = null;
      requestAnimationFrame(() => {
        setActiveEngine("Worker (CPU)");
      });
    }
    return () => {
      webglRendererRef.current?.destroy();
      webglRendererRef.current = null;
    };
  }, [view, bank]);

  useEffect(() => {
    const engine = engineRef.current;
    return () => engine.stop();
  }, []);

  const runStudio = useCallback(
    async (image: ImageData) => {
      if (!bank) return;
      const gen = ++studioGen.current;
      setBusy(true);
      setStatus("Studio render");
      setScanKey((k) => k + 1);
      try {
        const faces = settings.faceAware ? await detectFaces(await createImageBitmap(image)) : [];
        const next = await engineRef.current.studio(
          image,
          { ...settings, columns: Math.max(settings.columns, 160) },
          faces,
          background,
        );
        if (gen !== studioGen.current) return;
        setGrid(next);
        setStatus("Studio");
      } catch {
        if (gen !== studioGen.current) return;
        setStatus("Render failed");
      } finally {
        if (gen === studioGen.current) setBusy(false);
      }
    },
    [bank, settings, background],
  );

  const onFile = useCallback(
    async (file: File) => {
      setView("image");
      setLoadError(null);
      setStatus("Reading image");
      try {
        const image = await imageDataFromSource(file);
        sourceRef.current = image;
        setSourceDim({ width: image.width, height: image.height });
        await runStudio(image);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "That file could not be read as an image.");
        setBusy(false);
        setStatus("Read failed");
      }
    },
    [runStudio],
  );

  const onSample = useCallback(
    async (src: string) => {
      setView("image");
      setLoadError(null);
      setStatus("Loading sample");
      try {
        const image = await imageDataFromUrl(src);
        sourceRef.current = image;
        setSourceDim({ width: image.width, height: image.height });
        await runStudio(image);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "That sample could not be loaded.");
        setBusy(false);
        setStatus("Read failed");
      }
    },
    [runStudio],
  );

  useClipboardImage(onFile, view === "landing" || view === "image");

  useEffect(() => {
    if (view !== "image" || !sourceRef.current || !bank) return;
    const handle = window.setTimeout(() => {
      void runStudio(sourceRef.current!);
    }, 180);
    return () => window.clearTimeout(handle);
  }, [settings, background, view, runStudio, bank]);

  useEffect(() => {
    if (view !== "camera" || !cameraReady || !bank) return;
    const video = videoRef.current;
    if (!video) return;
    if (!scratchRef.current) scratchRef.current = document.createElement("canvas");
    const scratch = scratchRef.current;
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    let active = true;
    capturing.current = false;
    const rvfcVideo = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    };

    const tick = async () => {
      if (!active) return;
      if (!video.videoWidth) {
        liveLoop.current = requestAnimationFrame(() => void tick());
        return;
      }

      if (!adaptiveRef.current) {
        const prof = profileDevice();
        profileRef.current = prof;
        adaptiveRef.current = new AdaptiveQualityController(prof);
      }
      const qState = adaptiveRef.current.recordFrame(performance.now());
      if (debugMode) {
        setQualityState(qState);
        setCamRes((prev) =>
          prev?.width === video.videoWidth && prev?.height === video.videoHeight
            ? prev
            : { width: video.videoWidth, height: video.videoHeight },
        );
      }

      // Read user's liveSettings.columns directly so slider takes immediate effect!
      const cols = Math.max(30, Math.min(240, Math.round(liveSettingsRef.current.columns || 140)));
      const rows = studioRows(video.videoWidth, video.videoHeight, cols, bank.metrics.aspect);
      if (debugMode) setHudRows(rows);

      const webglRenderer = webglRendererRef.current;
      const webglCanvas = webglCanvasRef.current;

      if (webglRenderer && webglCanvas) {
        const parent = webglCanvas.parentElement;
        const cssW = parent?.clientWidth || 640;
        const cssH = parent?.clientHeight || 480;
        const gridAspect = (cols * bank.metrics.aspect) / rows;
        let drawW = cssW;
        let drawH = cssW / gridAspect;
        if (drawH > cssH) {
          drawH = cssH;
          drawW = cssH * gridAspect;
        }
        const dpr = Math.min(2.5, window.devicePixelRatio || 1);
        const targetW = Math.max(1, Math.round(drawW * dpr));
        const targetH = Math.max(1, Math.round(drawH * dpr));
        webglCanvas.style.width = `${drawW}px`;
        webglCanvas.style.height = `${drawH}px`;

        const curFinish = qState.allowGlow
          ? finishRef.current
          : { ...finishRef.current, glow: 0 };

        webglRenderer.render({
          video,
          cols,
          rows,
          mirror,
          settings: liveSettingsRef.current,
          palette: paletteRef.current,
          finish: curFinish,
          width: targetW,
          height: targetH,
        });

        if (active) setStatus("Live (GPU)");
      } else {
        if (capturing.current) {
          liveLoop.current = requestAnimationFrame(() => void tick());
          return;
        }
        capturing.current = true;
        const maxW = profileRef.current?.recommendedCamWidth ?? 960;
        const scale = Math.min(1, maxW / video.videoWidth);
        const w = Math.max(2, Math.round(video.videoWidth * scale));
        const h = Math.max(2, Math.round(video.videoHeight * scale));
        if (scratch.width !== w) scratch.width = w;
        if (scratch.height !== h) scratch.height = h;
        if (mirror) {
          ctx.save();
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, w, h);
          ctx.restore();
        } else {
          ctx.drawImage(video, 0, 0, w, h);
        }
        const frame = ctx.getImageData(0, 0, w, h);
        try {
          const next = await engineRef.current.live(
            frame,
            { ...liveSettingsRef.current, columns: cols },
            backgroundRef.current,
          );
          if (active) {
            setGrid(next);
            setStatus("Live (CPU)");
          }
        } catch {
          /* drop frame */
        }
        capturing.current = false;
      }

      if (!active) return;
      if (rvfcVideo.requestVideoFrameCallback) {
        liveLoop.current = rvfcVideo.requestVideoFrameCallback(() => void tick());
      } else {
        liveLoop.current = requestAnimationFrame(() => void tick());
      }
    };
    void tick();
    return () => {
      active = false;
      if (rvfcVideo.cancelVideoFrameCallback) {
        try {
          rvfcVideo.cancelVideoFrameCallback(liveLoop.current);
        } catch {
          cancelAnimationFrame(liveLoop.current);
        }
      } else {
        cancelAnimationFrame(liveLoop.current);
      }
    };
  }, [view, cameraReady, mirror, bank, videoRef, debugMode]);

  const snapshot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    haptic(18);
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    if (mirror) {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    const image = ctx.getImageData(0, 0, c.width, c.height);
    sourceRef.current = image;
    setSourceDim({ width: image.width, height: image.height });
    stopStream();
    setView("image");
    await runStudio(image);
  };

  const startCamera = async () => {
    setView("camera");
    setGrid(null);
    await startStream();
  };

  const toggleRecord = () => {
    const canvas =
      view === "camera" && activeEngine === "WebGL2 (GPU)" && webglCanvasRef.current
        ? webglCanvasRef.current
        : canvasRef.current;
    if (!canvas) return;
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    const stream = canvas.captureStream(30);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "";
    if (!mime) {
      setStatus("Recording is not supported here");
      return;
    }
    const rec = new MediaRecorder(stream, { mimeType: mime });
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ASCII_clip.webm";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    };
    rec.start();
    recorderRef.current = rec;
    setRecording(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*,.heic,.heif"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void onFile(f);
        e.target.value = "";
      }}
    />
  );

  if (view === "landing") {
    return (
      <>
        {fileInput}
        <Landing
          onCamera={() => void startCamera()}
          onUpload={() => fileRef.current?.click()}
          onFile={(f) => void onFile(f)}
          onSample={(src) => void onSample(src)}
        />
      </>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-foreground">
      {fileInput}

      {/* Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/8 bg-bg/95 px-4 py-2.5 backdrop-blur-md pt-[max(0.65rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              stopStream();
              setView("landing");
              setGrid(null);
            }}
            aria-label="Back to home"
            className="group flex items-center gap-1.5 rounded border border-white/12 bg-white/5 px-2.5 py-1.5 font-mono text-[11px] text-white/70 transition-all hover:border-accent/40 hover:bg-white/10 hover:text-white active:scale-95"
          >
            <svg
              className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5 text-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="font-semibold tracking-wider">Back</span>
          </button>

          <span className="font-mono text-[13px] tracking-[0.24em] font-semibold text-white/90">
            ASCII
          </span>

          {view === "image" && (
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-white/70 border border-white/10">
              STUDIO
            </span>
          )}
        </div>

        {/* Detailed Information in Header */}
        <div className="hidden md:flex items-center gap-2 font-mono text-[10px] text-white/45">
          {grid && (
            <span className="px-2 py-0.5 rounded bg-black/40 border border-white/8 text-accent font-medium">
              {grid.cols} × {grid.rows} chars
            </span>
          )}
          <span className="text-white/20">|</span>
          <span className="text-white/60">
            {status}
            {busy ? "…" : ""}
          </span>
          {sourceDim && (
            <>
              <span className="text-white/20">|</span>
              <span className="text-white/40">
                {sourceDim.width}×{sourceDim.height}px source
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {view === "camera" && (
            <>
              <IconButton label="Flip camera" onClick={flip}>
                Flip
              </IconButton>
              <IconButton
                label={mirror ? "Mirror on" : "Mirror off"}
                onClick={() => setMirror((m) => !m)}
                active={mirror}
              >
                Mirror
              </IconButton>
            </>
          )}
          {view === "image" && (
            <IconButton label="Upload another image" onClick={() => fileRef.current?.click()}>
              New
            </IconButton>
          )}
          <IconButton
            label="Tune settings"
            onClick={() => setPanelOpen((v) => !v)}
            active={panelOpen}
          >
            Settings
          </IconButton>
          <IconButton label="Export" onClick={() => setExportOpen(true)} primary>
            Export
          </IconButton>
        </div>
      </header>

      {loadError && (
        <div className="mx-4 mt-4 border border-white/10 bg-black/60 p-4 text-sm text-white/70" role="alert">
          {loadError}
        </div>
      )}

      {view === "camera" && cameraError && (
        <CameraError
          error={cameraError}
          onRetry={() => void startStream()}
          onBack={() => {
            stopStream();
            setView("landing");
          }}
        />
      )}

      {/* Main View Area */}
      <div id="main" className="relative flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Canvas & Camera Area (Fixed at top/center) */}
        <div
          className="relative flex flex-1 items-center justify-center overflow-hidden bg-black min-h-[50dvh]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void onFile(f);
          }}
        >
          {busy && !grid && <div className="absolute inset-0 skeleton" />}
          {busy && <div key={scanKey} className="convert-scan" />}
          <video ref={videoRef} className="pointer-events-none absolute h-0 w-0 opacity-0" playsInline muted autoPlay />
          {view === "camera" && activeEngine === "WebGL2 (GPU)" ? (
            <canvas
              ref={webglCanvasRef}
              className="max-h-[74dvh] w-full object-contain"
            />
          ) : (
            <AsciiCanvas
              grid={grid}
              bank={bank}
              palette={palette}
              finish={finish}
              fast={view === "camera"}
              canvasRef={canvasRef}
              className="max-h-[74dvh] w-full object-contain"
            />
          )}

          {debugMode && view === "camera" && (
            <DebugHUD
              state={qualityState}
              engine={activeEngine}
              camRes={camRes}
              rows={hudRows}
            />
          )}

          <p className="pointer-events-none absolute bottom-3 left-4 font-mono text-[10px] text-white/30 hidden md:block">
            100% private, nothing is uploaded
          </p>

          {/* Floating Camera Shutter & Bottom Controls (in Camera view) */}
          {view === "camera" && (
            <div className="absolute bottom-5 inset-x-0 z-20 flex items-center justify-center gap-6 px-4 pointer-events-auto">
              {/* Record Clip */}
              <button
                type="button"
                onClick={toggleRecord}
                className={`h-11 px-4 rounded-full border text-[11px] font-mono tracking-wider flex items-center gap-2 backdrop-blur-md transition-all active:scale-95 ${recording
                    ? "border-red-500 bg-red-500/20 text-red-400"
                    : "border-white/20 bg-black/60 text-white/80 hover:bg-black/80 hover:text-white"
                  }`}
                aria-label={recording ? "Stop recording clip" : "Record video clip"}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${recording ? "bg-red-500 animate-ping" : "bg-red-400"}`} />
                {recording ? "Stop" : "Rec"}
              </button>

              {/* Shutter / Snap Button */}
              <button
                type="button"
                onClick={() => void snapshot()}
                className="h-18 w-18 rounded-full border-4 border-white/80 bg-white/10 p-1 flex items-center justify-center hover:scale-105 active:scale-90 transition-all shadow-[0_0_30px_rgba(124,255,178,0.3)] group cursor-pointer"
                aria-label="Take snapshot"
              >
                <span className="h-full w-full rounded-full bg-accent transition-transform group-hover:scale-95 group-active:scale-85" />
              </button>

              {/* Quick Tune Button */}
              <button
                type="button"
                onClick={() => setPanelOpen((v) => !v)}
                className={`h-11 px-4 rounded-full border text-[11px] font-mono tracking-wider flex items-center gap-2 backdrop-blur-md transition-all active:scale-95 ${panelOpen
                    ? "border-accent bg-accent/25 text-accent font-semibold"
                    : "border-white/20 bg-black/60 text-white/80 hover:bg-black/80 hover:text-white"
                  }`}
                aria-label="Toggle sliders"
              >
                Tune
              </button>
            </div>
          )}
        </div>

        {/* Desktop Sliding Drawer (lg+) */}
        <aside
          className={`hidden lg:flex flex-col border-l border-white/8 bg-[#0c0c0c] transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${panelOpen ? "w-[360px] opacity-100" : "w-0 opacity-0 pointer-events-none"
            }`}
        >
          <div className="w-[360px] flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/8">
              <span className="font-mono text-xs tracking-wider text-accent font-medium">SETTINGS & TUNING</span>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="text-white/40 hover:text-white font-mono text-xs px-2 py-1 border border-white/10 rounded hover:border-white/25 transition-colors"
              >
                Collapse ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-12">
              <ControlPanel
                settings={activeSettings}
                finish={finish}
                background={background}
                live={view === "camera"}
                onSettings={view === "camera" ? setLiveSettings : setSettings}
                onFinish={setFinish}
                onBackground={setBackground}
              />
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile Sliding Bottom Sheet (< lg) */}
      <div
        className={`fixed inset-0 bg-black/60 z-30 lg:hidden transition-opacity duration-300 ${panelOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
        onClick={() => setPanelOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`fixed inset-x-0 bottom-0 z-40 flex flex-col bg-[#0e0e0e]/95 backdrop-blur-2xl border-t border-white/15 rounded-t-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.85)] transition-transform duration-300 ease-out lg:hidden max-h-[75dvh] ${panelOpen ? "translate-y-0" : "translate-y-full pointer-events-none"
          }`}
        role="dialog"
        aria-label="Settings and Tuning Drawer"
      >
        <div
          className="py-2.5 flex justify-center cursor-pointer active:opacity-60"
          onClick={() => setPanelOpen(false)}
        >
          <div className="h-1.5 w-12 rounded-full bg-white/25" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2.5 border-b border-white/8">
          <span className="font-mono text-xs tracking-wider text-accent font-medium">SETTINGS & TUNING</span>
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="text-white/50 hover:text-white p-1 font-mono text-xs"
          >
            ✕ Close
          </button>
        </div>
        <div className="overflow-y-auto p-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <ControlPanel
            settings={activeSettings}
            finish={finish}
            background={background}
            live={view === "camera"}
            onSettings={view === "camera" ? setLiveSettings : setSettings}
            onFinish={setFinish}
            onBackground={setBackground}
          />
        </div>
      </div>

      {/* Mobile bottom bar for image view */}
      {view === "image" && (
        <div className="flex gap-2 border-t border-white/8 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden bg-bg/90 backdrop-blur-md">
          <button
            type="button"
            className="min-h-11 flex-1 border border-white/15 font-mono text-[12px] bg-white/5 active:scale-98 transition-transform"
            onClick={() => setPanelOpen((v) => !v)}
          >
            {panelOpen ? "Hide settings" : "Tune settings"}
          </button>
          <button
            type="button"
            className="min-h-11 flex-1 bg-accent font-mono text-[12px] text-black font-semibold active:scale-98 transition-transform shadow-[0_0_12px_rgba(124,255,178,0.25)]"
            onClick={() => setExportOpen(true)}
          >
            Export
          </button>
        </div>
      )}

      <div className="hidden lg:block">
        <Footer />
      </div>

      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        grid={grid}
        bank={bank}
        palette={palette}
        finish={finish}
      />
    </div>
  );
}

function IconButton(props: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      className={`min-h-10 min-w-10 rounded-sm border px-3 font-mono text-[11px] tracking-wider transition-all active:scale-95 flex items-center justify-center ${props.primary
          ? "border-accent bg-accent text-black font-semibold shadow-[0_0_12px_rgba(124,255,178,0.25)]"
          : props.active
            ? "border-accent bg-accent/20 text-accent font-medium shadow-[0_0_8px_rgba(124,255,178,0.15)]"
            : "border-white/10 text-white/80 hover:border-white/25 hover:text-white"
        }`}
    >
      {props.children}
    </button>
  );
}

function CameraError(props: {
  error: NonNullable<ReturnType<typeof useCamera>["error"]>;
  onRetry: () => void;
  onBack: () => void;
}) {
  const copy = {
    denied: "Camera permission was denied. Enable it in the browser settings, then try again.",
    missing: "No camera was found on this device.",
    busy: "The camera is already in use by another app.",
    unknown: "The camera could not be started.",
  }[props.error];
  return (
    <div className="mx-4 mt-4 border border-white/10 bg-black/60 p-4 text-sm text-white/70">
      <p>{copy}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="min-h-11 bg-accent px-4 text-black" onClick={props.onRetry}>
          Try again
        </button>
        <button type="button" className="min-h-11 border border-white/15 px-4" onClick={props.onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

