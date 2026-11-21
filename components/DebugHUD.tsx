"use client";

import type { QualityState } from "@/lib/ascii-engine/adaptive";

export function DebugHUD(props: {
  state: QualityState | null;
  engine: "WebGL2 (GPU)" | "Worker (CPU)";
  camRes?: { width: number; height: number };
  rows?: number;
}) {
  const { state, engine, camRes, rows } = props;
  if (!state) return null;

  return (
    <div
      className="pointer-events-none absolute top-3 left-3 z-50 rounded bg-black/80 p-2.5 font-mono text-[11px] leading-tight text-accent border border-accent/30 shadow-lg backdrop-blur-md"
      role="status"
      aria-label="Engine Performance HUD"
    >
      <div className="font-bold text-white mb-1">⚡ ASCII ENGINE HUD</div>
      <div>FPS: <span className="font-semibold text-white">{state.fps}</span></div>
      <div>Frame time: <span className="text-white">{state.avgFrameTime} ms</span></div>
      <div>Engine: <span className="text-white">{engine}</span></div>
      <div>Device Tier: <span className="uppercase text-white">{state.tier}</span></div>
      <div>Grid: <span className="text-white">{state.currentCols} cols × {rows || "--"} rows</span></div>
      {camRes && (
        <div>Camera: <span className="text-white">{camRes.width}×{camRes.height}</span></div>
      )}
      <div>Glow allowed: <span className="text-white">{state.allowGlow ? "Yes" : "No (Throttled)"}</span></div>
      {state.droppedFrames > 0 && (
        <div className="text-amber-400">Drops: {state.droppedFrames}</div>
      )}
    </div>
  );
}
