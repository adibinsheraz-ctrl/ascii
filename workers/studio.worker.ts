/// <reference lib="webworker" />

import { convertStudio } from "@/lib/ascii-engine/studio";
import { convertLive, createLiveState } from "@/lib/ascii-engine/live";
import { bitmapToAtlas, deserializeBank, type SerializedBank } from "@/lib/ascii-engine/serialize";
import type { AsciiGrid, AsciiSettings, FaceRect, GlyphBank } from "@/lib/ascii-engine/types";

type InMsg =
  | {
      type: "init";
      bank: SerializedBank;
      atlas: ImageBitmap;
    }
  | {
      type: "studio";
      id: number;
      pixels: ArrayBuffer;
      width: number;
      height: number;
      settings: AsciiSettings;
      faces: FaceRect[];
      background: AsciiGrid["background"];
    }
  | {
      type: "live";
      id: number;
      pixels: ArrayBuffer;
      width: number;
      height: number;
      settings: AsciiSettings;
      background: AsciiGrid["background"];
    };

let bank: GlyphBank | null = null;
const liveState = createLiveState();

self.onmessage = (event: MessageEvent<InMsg>) => {
  const msg = event.data;
  try {
    if (msg.type === "init") {
      bank = deserializeBank(msg.bank, bitmapToAtlas(msg.atlas));
      msg.atlas.close();
      self.postMessage({ type: "ready" });
      return;
    }
    if (!bank) {
      const id = "id" in msg ? msg.id : undefined;
      self.postMessage({ type: "error", id, error: "Glyph bank not ready" });
      return;
    }
    const image = new ImageData(new Uint8ClampedArray(msg.pixels), msg.width, msg.height);
    if (msg.type === "studio") {
      const grid = convertStudio(image, bank, msg.settings, msg.faces, msg.background);
      self.postMessage({ type: "grid", id: msg.id, grid, mode: "studio" });
      return;
    }
    const grid = convertLive(image, bank, msg.settings, liveState, msg.background);
    self.postMessage({ type: "grid", id: msg.id, grid, mode: "live" });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Conversion failed";
    const id = "id" in event.data ? event.data.id : undefined;
    self.postMessage({ type: "error", id, error });
  }
};
