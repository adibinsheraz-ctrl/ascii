import { atlasToBitmap, serializeBank } from "@/lib/ascii-engine/serialize";
import type { AsciiGrid, AsciiSettings, FaceRect, GlyphBank } from "@/lib/ascii-engine/types";

type GridMessage = {
  type: "grid";
  id: number;
  grid: AsciiGrid;
  mode: "studio" | "live";
};

type Pending = {
  resolve: (grid: AsciiGrid) => void;
  reject: (err: Error) => void;
};

export class EngineClient {
  private worker: Worker | null = null;
  private ready = false;
  private queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  private id = 1;
  private pending = new Map<number, Pending>();
  private latestStudio = 0;
  private latestLive = 0;
  private startPromise: Promise<void> | null = null;

  async start(bank: GlyphBank): Promise<void> {
    this.stop();
    const p = (async () => {
      this.worker = new Worker(new URL("../../workers/studio.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (
        event: MessageEvent<GridMessage | { type: "ready" } | { type: "error"; id?: number; error: string }>,
      ) => {
        const data = event.data;
        if (data.type === "ready") {
          this.ready = true;
          this.queue.splice(0).forEach((fn) => fn.resolve());
          return;
        }
        if (data.type === "error") {
          const err = new Error(data.error);
          if (data.id != null && this.pending.has(data.id)) {
            this.pending.get(data.id)?.reject(err);
            this.pending.delete(data.id);
          }
          return;
        }
        const job = this.pending.get(data.id);
        if (!job) return;
        this.pending.delete(data.id);
        job.resolve(data.grid);
      };
      this.worker.onerror = () => {
        this.failAll(new Error("Engine worker crashed"));
      };
      const atlas = await atlasToBitmap(bank);
      this.worker.postMessage({ type: "init", bank: serializeBank(bank), atlas }, [atlas]);
      if (!this.ready) {
        await new Promise<void>((resolve, reject) => this.queue.push({ resolve, reject }));
      }
    })();
    this.startPromise = p;
    await p;
  }

  private failAll(err: Error): void {
    for (const job of this.pending.values()) job.reject(err);
    this.pending.clear();
    this.queue.splice(0).forEach((fn) => fn.reject(err));
  }

  private async send(
    type: "studio" | "live",
    image: ImageData,
    settings: AsciiSettings,
    faces: FaceRect[],
    background: AsciiGrid["background"],
  ): Promise<AsciiGrid> {
    if (this.startPromise && !this.ready) {
      try {
        await this.startPromise;
      } catch {
        /* let subsequent check handle missing worker */
      }
    }
    if (!this.worker || !this.ready) return Promise.reject(new Error("Engine worker is not running"));
    const id = this.id++;
    if (type === "studio") this.latestStudio = id;
    else this.latestLive = id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const pixels = image.data.buffer.slice(0);
      this.worker?.postMessage(
        {
          type,
          id,
          pixels,
          width: image.width,
          height: image.height,
          settings,
          faces,
          background,
        },
        [pixels],
      );
    });
  }

  studio(
    image: ImageData,
    settings: AsciiSettings,
    faces: FaceRect[],
    background: AsciiGrid["background"],
  ): Promise<AsciiGrid> {
    return this.send("studio", image, settings, faces, background);
  }

  live(
    image: ImageData,
    settings: AsciiSettings,
    background: AsciiGrid["background"],
  ): Promise<AsciiGrid> {
    return this.send("live", image, settings, [], background);
  }

  stop(): void {
    this.startPromise = null;
    this.failAll(new Error("Engine stopped"));
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }
}
