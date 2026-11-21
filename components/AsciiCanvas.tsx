"use client";

import { useEffect, useRef } from "react";
import type { AsciiGrid, FinishEffects, GlyphBank, RenderPalette } from "@/lib/ascii-engine/types";
import { renderGridToContext } from "@/lib/ascii-engine/render";

export function AsciiCanvas(props: {
  grid: AsciiGrid | null;
  bank: GlyphBank | null;
  palette: RenderPalette;
  finish: FinishEffects;
  fast?: boolean;
  className?: string;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}) {
  const { grid, bank, palette, finish, fast, className, canvasRef } = props;
  const localRef = useRef<HTMLCanvasElement | null>(null);
  const ref = canvasRef ?? localRef;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const draw = () => {
      if (!grid || !bank) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const cssW = parent.clientWidth;
      const cssH = parent.clientHeight;
      if (cssW < 2 || cssH < 2) return;

      const gridAspect = (grid.cols * grid.metrics.aspect) / grid.rows;
      let drawW = cssW;
      let drawH = cssW / gridAspect;
      if (drawH > cssH) {
        drawH = cssH;
        drawW = cssH * gridAspect;
      }

      canvas.style.width = `${drawW}px`;
      canvas.style.height = `${drawH}px`;
      canvas.width = Math.max(1, Math.round(drawW * dpr));
      canvas.height = Math.max(1, Math.round(drawH * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderGridToContext({
        ctx,
        grid,
        bank,
        palette,
        width: canvas.width,
        height: canvas.height,
        finish,
        fast,
      });
    };

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(parent);
    return () => ro.disconnect();
  }, [grid, bank, palette, finish, fast, ref]);

  return (
    <canvas
      ref={ref}
      className={className ?? "max-h-full max-w-full"}
      role="img"
      aria-label="ASCII art preview"
    />
  );
}
