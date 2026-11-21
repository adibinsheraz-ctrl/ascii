"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  downloadBlob,
  exportAscii,
  type ExportFormat,
  type ExportPreset,
} from "@/lib/ascii-engine/export";
import { gridToText } from "@/lib/ascii-engine/render";
import type { AsciiGrid, FinishEffects, GlyphBank, RenderPalette } from "@/lib/ascii-engine/types";

export function ExportSheet(props: {
  open: boolean;
  onClose: () => void;
  grid: AsciiGrid | null;
  bank: GlyphBank | null;
  palette: RenderPalette;
  finish: FinishEffects;
}) {
  const { open, onClose, grid, bank, palette, finish } = props;
  const [preset, setPreset] = useState<ExportPreset>("4k");
  const [format, setFormat] = useState<ExportFormat>("png");
  const [custom, setCustom] = useState(2560);
  const [jpg, setJpg] = useState(0.92);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [canShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  if (!open) return null;

  const run = async () => {
    if (!grid || !bank) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await exportAscii({
        grid,
        bank,
        palette,
        finish,
        preset,
        customLongEdge: custom,
        format,
        jpgQuality: jpg,
        onProgress: (r, l) => {
          setProgress(r);
          setLabel(l);
        },
      });
      downloadBlob(result.blob, result.filename);
      if (result.message) setNote(result.message);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const copyText = async () => {
    if (!grid) return;
    await navigator.clipboard.writeText(gridToText(grid));
    setNote("ASCII text copied.");
  };

  const share = async () => {
    if (!grid || !bank || !navigator.share) return;
    const result = await exportAscii({
      grid,
      bank,
      palette,
      finish,
      preset: "hd",
      format: "png",
      jpgQuality: 0.92,
    });
    const file = new File([result.blob], result.filename, { type: result.blob.type });
    await navigator.share({ files: [file], title: "ASCII" });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 md:items-center"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        className="w-full max-w-lg rounded-sm border border-white/10 bg-[#0e0e0e] p-5 shadow-[0_0_80px_rgba(124,255,178,0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="font-mono text-sm tracking-[0.2em] text-accent">
            Export
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="min-h-11 min-w-11 text-white/60"
            onClick={props.onClose}
            aria-label="Close export"
          >
            Close
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Size">
          {(["hd", "4k", "8k", "custom"] as ExportPreset[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={preset === p}
              onClick={() => setPreset(p)}
              className={`min-h-11 rounded-sm border text-[12px] uppercase ${
                preset === p ? "border-accent text-accent" : "border-white/10"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <label className="mt-3 block text-[12px] text-white/50">
            Long edge (px)
            <input
              type="number"
              min={256}
              max={16000}
              value={custom}
              onChange={(e) => setCustom(Number(e.target.value))}
              className="mt-1 min-h-11 w-full border border-white/10 bg-black px-3"
            />
          </label>
        )}
        <div className="mt-3 grid grid-cols-5 gap-2" role="group" aria-label="Format">
          {(["png", "jpg", "svg", "txt", "html"] as ExportFormat[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={format === f}
              onClick={() => setFormat(f)}
              className={`min-h-11 rounded-sm border text-[11px] uppercase ${
                format === f ? "border-accent text-accent" : "border-white/10"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {format === "jpg" && (
          <label className="mt-3 block text-[12px] text-white/50">
            JPEG quality {jpg.toFixed(2)}
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.01}
              value={jpg}
              onChange={(e) => setJpg(Number(e.target.value))}
              className="h-11 w-full accent-[var(--accent)]"
            />
          </label>
        )}
        {busy && (
          <div className="mt-4">
            <div className="h-1 overflow-hidden bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="mt-2 font-mono text-[11px] text-white/50">{label}</p>
          </div>
        )}
        {note && (
          <p className="mt-3 text-[12px] text-amber-200/80" role="status">
            {note}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !props.grid}
            onClick={() => void run()}
            className="min-h-11 flex-1 bg-accent px-4 font-mono text-[12px] tracking-wider text-black disabled:opacity-40"
          >
            Download
          </button>
          <button type="button" onClick={() => void copyText()} className="min-h-11 border border-white/15 px-4 text-[12px]">
            Copy text
          </button>
          {canShare && (
            <button type="button" onClick={() => void share()} className="min-h-11 border border-white/15 px-4 text-[12px]">
              Share
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
