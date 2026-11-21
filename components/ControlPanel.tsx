"use client";

import { useState } from "react";
import type { AsciiSettings, ColorMode, DitherMode, FinishEffects, RampPreset } from "@/lib/ascii-engine/types";
import type { BackgroundMode } from "@/lib/ascii-engine/types";

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-[11px] text-white/50">
        {props.label}
        <span className="tabular-nums text-white/70">
          {Number.isInteger(props.step) ? props.value.toFixed(0) : props.value.toFixed(2)}
        </span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="h-10 w-full accent-[var(--accent)] cursor-pointer"
      />
    </label>
  );
}

type TabKey = "density" | "type" | "color" | "process" | "finish" | "all";

export function ControlPanel(props: {
  settings: AsciiSettings;
  finish: FinishEffects;
  background: BackgroundMode;
  live: boolean;
  onSettings: (next: AsciiSettings) => void;
  onFinish: (next: FinishEffects) => void;
  onBackground: (b: BackgroundMode) => void;
}) {
  const [tab, setTab] = useState<TabKey>("density");
  const s = props.settings;
  const set = (patch: Partial<AsciiSettings>) => props.onSettings({ ...s, ...patch });
  const f = props.finish;
  const setF = (patch: Partial<FinishEffects>) => props.onFinish({ ...f, ...patch });

  const tabs: { id: TabKey; label: string }[] = [
    { id: "density", label: "Density" },
    { id: "type", label: "Type" },
    { id: "color", label: "Color" },
    ...(!props.live ? [{ id: "process" as TabKey, label: "Process" }] : []),
    { id: "finish", label: "Finish" },
    { id: "all", label: "All" },
  ];

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Category Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-white/8 -mx-1 px-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-full font-mono text-[11px] whitespace-nowrap transition-all active:scale-95 ${
              tab === t.id
                ? "bg-accent text-black font-semibold shadow-[0_0_12px_rgba(124,255,178,0.25)]"
                : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(tab === "all" || tab === "type") && (
        <section className="space-y-3">
          <h3 className="font-mono text-[11px] tracking-[0.18em] text-accent">Type</h3>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["classic", "Classic"],
                ["detailed", "Detailed"],
                ["blocks", "Blocks"],
                ["minimal", "Minimal"],
                ["binary", "Binary"],
                ["matrix", "Matrix"],
              ] as [RampPreset, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => set({ ramp: id, customRamp: "" })}
                aria-pressed={s.ramp === id && !s.customRamp}
                className={`min-h-11 rounded-sm border px-2 font-mono text-[12px] transition-all active:scale-98 ${
                  s.ramp === id && !s.customRamp
                    ? "border-accent bg-accent/15 text-accent font-medium shadow-[0_0_10px_rgba(124,255,178,0.15)]"
                    : "border-white/10 text-white/70 hover:border-white/25"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="block pt-1">
            <span className="mb-1 block text-[11px] text-white/50">Custom ramp</span>
            <input
              value={s.customRamp}
              onChange={(e) => set({ customRamp: e.target.value })}
              placeholder="Type characters dark → light"
              className="min-h-11 w-full rounded-sm border border-white/10 bg-black/40 px-3 font-mono text-[12px] outline-none focus:border-accent transition-colors"
            />
          </label>
        </section>
      )}

      {(tab === "all" || tab === "density") && (
        <section className="space-y-3">
          <h3 className="font-mono text-[11px] tracking-[0.18em] text-accent">Density & Adjustments</h3>
          <Slider
            label={props.live ? "Live columns" : "Studio columns"}
            value={s.columns}
            min={props.live ? 60 : 80}
            max={props.live ? 220 : 560}
            step={1}
            onChange={(v) => set({ columns: Math.round(v) })}
          />
          <Slider label="Contrast" value={s.contrast} min={0.5} max={1.8} step={0.01} onChange={(v) => set({ contrast: v })} />
          <Slider label="Brightness" value={s.brightness} min={-0.4} max={0.4} step={0.01} onChange={(v) => set({ brightness: v })} />
          <Slider label="Gamma" value={s.gamma} min={0.5} max={1.8} step={0.01} onChange={(v) => set({ gamma: v })} />
          <Slider label="Sharpness" value={s.sharpness} min={0} max={1.2} step={0.01} onChange={(v) => set({ sharpness: v })} />
          <Slider label="Edges" value={s.edgeStrength} min={0} max={1} step={0.01} onChange={(v) => set({ edgeStrength: v })} />
        </section>
      )}

      {(tab === "all" || tab === "color") && (
        <section className="space-y-3">
          <h3 className="font-mono text-[11px] tracking-[0.18em] text-accent">Color Palette</h3>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["mono", "White"],
                ["phosphor", "Phosphor"],
                ["amber", "Amber"],
                ["ice", "Ice"],
                ["full", "Full color"],
                ["duotone", "Duotone"],
                ["gradient", "Gradient"],
                ["custom", "Custom"],
              ] as [ColorMode, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => set({ colorMode: id })}
                className={`min-h-11 rounded-sm border px-2 text-[12px] transition-all active:scale-98 ${
                  s.colorMode === id
                    ? "border-accent bg-accent/15 text-accent font-medium shadow-[0_0_10px_rgba(124,255,178,0.15)]"
                    : "border-white/10 text-white/70 hover:border-white/25"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {s.colorMode === "custom" && (
            <label className="flex min-h-11 items-center justify-between border border-white/10 rounded-sm px-3 bg-black/40">
              <span className="text-white/70">Accent color</span>
              <input
                type="color"
                value={s.customAccent}
                onChange={(e) => set({ customAccent: e.target.value })}
                className="h-8 w-12 bg-transparent cursor-pointer rounded"
              />
            </label>
          )}
          {(s.colorMode === "duotone" || s.colorMode === "gradient") && (
            <div className="flex gap-2">
              <label className="flex-1 flex items-center justify-between border border-white/10 rounded-sm px-3 py-2 bg-black/40">
                <span className="text-white/70 text-xs">Low</span>
                <input type="color" value={s.duotoneLow} onChange={(e) => set({ duotoneLow: e.target.value })} className="h-7 w-10 cursor-pointer" />
              </label>
              <label className="flex-1 flex items-center justify-between border border-white/10 rounded-sm px-3 py-2 bg-black/40">
                <span className="text-white/70 text-xs">High</span>
                <input type="color" value={s.duotoneHigh} onChange={(e) => set({ duotoneHigh: e.target.value })} className="h-7 w-10 cursor-pointer" />
              </label>
            </div>
          )}
          <div className="pt-1">
            <span className="mb-1.5 block text-[11px] text-white/50">Background</span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["black", "Black"],
                  ["charcoal", "Charcoal"],
                  ["transparent", "Clear"],
                ] as [BackgroundMode, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => props.onBackground(id)}
                  className={`min-h-10 rounded-sm border text-[12px] transition-all active:scale-98 ${
                    props.background === id
                      ? "border-accent bg-accent/15 text-accent font-medium"
                      : "border-white/10 text-white/70 hover:border-white/25"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {!props.live && (tab === "all" || tab === "process") && (
        <section className="space-y-3">
          <h3 className="font-mono text-[11px] tracking-[0.18em] text-accent">Studio Process</h3>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["none", "No dither"],
                ["floyd-steinberg", "Floyd–Steinberg"],
                ["ordered", "Ordered"],
                ["blue-noise", "Blue noise"],
              ] as [DitherMode, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => set({ dither: id })}
                className={`min-h-11 rounded-sm border px-2 text-[12px] transition-all active:scale-98 ${
                  s.dither === id
                    ? "border-accent bg-accent/15 text-accent font-medium shadow-[0_0_10px_rgba(124,255,178,0.15)]"
                    : "border-white/10 text-white/70 hover:border-white/25"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-col divide-y divide-white/6 pt-1">
            <Toggle label="Invert" on={s.invert} onChange={(v) => set({ invert: v })} />
            <Toggle label="CLAHE contrast" on={s.clahe} onChange={(v) => set({ clahe: v })} />
            <Toggle label="Denoise" on={s.denoise} onChange={(v) => set({ denoise: v })} />
            <Toggle label="Auto levels" on={s.autoLevels} onChange={(v) => set({ autoLevels: v })} />
            <Toggle label="Face-aware detail" on={s.faceAware} onChange={(v) => set({ faceAware: v })} />
          </div>
        </section>
      )}

      {(tab === "all" || tab === "finish") && (
        <section className="space-y-3">
          <h3 className="font-mono text-[11px] tracking-[0.18em] text-accent">Finish & Effects</h3>
          <Slider label="Glow" value={f.glow} min={0} max={0.8} step={0.01} onChange={(v) => setF({ glow: v })} />
          <Slider label="Grain" value={f.grain} min={0} max={1} step={0.01} onChange={(v) => setF({ grain: v })} />
          <Slider label="Vignette" value={f.vignette} min={0} max={1} step={0.01} onChange={(v) => setF({ vignette: v })} />
          <Slider label="Scanlines" value={f.scanlines} min={0} max={1} step={0.01} onChange={(v) => setF({ scanlines: v })} />
          <div className="pt-1">
            <span className="mb-1.5 block text-[11px] text-white/50">Color Grade</span>
            <div className="grid grid-cols-2 gap-2">
              {(["none", "bleach", "nocturne", "print"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setF({ grade: g })}
                  className={`min-h-10 rounded-sm border text-[12px] capitalize transition-all active:scale-98 ${
                    f.grade === g
                      ? "border-accent bg-accent/15 text-accent font-medium shadow-[0_0_10px_rgba(124,255,178,0.15)]"
                      : "border-white/10 text-white/70 hover:border-white/25"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Toggle(props: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      onClick={() => props.onChange(!props.on)}
      className="flex min-h-11 items-center justify-between border-b border-white/6 text-left text-[13px]"
    >
      {props.label}
      <span className={`font-mono text-[11px] ${props.on ? "text-accent" : "text-white/30"}`}>
        {props.on ? "ON" : "OFF"}
      </span>
    </button>
  );
}
