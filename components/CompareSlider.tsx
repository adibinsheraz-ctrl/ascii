"use client";

import { useRef, useState } from "react";

export function CompareSlider(props: {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  className?: string;
}) {
  const [pos, setPos] = useState(54);
  const track = useRef<HTMLDivElement | null>(null);

  const setFromEvent = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = (clientX - r.left) / r.width;
    setPos(Math.max(2, Math.min(98, t * 100)));
  };

  return (
    <div
      ref={track}
      className={`relative w-full overflow-hidden border border-white/10 bg-black select-none ${
        props.className ?? "aspect-[3/4]"
      }`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setFromEvent(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons) setFromEvent(e.clientX);
      }}
    >
      {/* data: URLs from the engine; next/image is not appropriate here */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={props.before} alt={props.beforeLabel} className="absolute inset-0 h-full w-full object-contain" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={props.after} alt={props.afterLabel} className="absolute inset-0 h-full w-full object-contain" />
      </div>
      <div className="absolute inset-y-0 w-px bg-accent" style={{ left: `${pos}%` }} />
      <div
        role="slider"
        aria-label="Compare live and studio"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        tabIndex={0}
        className="absolute top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent bg-black/80"
        style={{ left: `${pos}%` }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPos((p) => Math.max(2, p - 3));
          if (e.key === "ArrowRight") setPos((p) => Math.min(98, p + 3));
        }}
      />
      <p className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 font-mono text-[10px] text-white/70">
        {props.afterLabel}
      </p>
      <p className="absolute right-2 bottom-2 bg-black/60 px-2 py-1 font-mono text-[10px] text-white/70">
        {props.beforeLabel}
      </p>
    </div>
  );
}
