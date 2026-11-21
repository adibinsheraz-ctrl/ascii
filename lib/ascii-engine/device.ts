/**
 * Device profiling and tier classification.
 * Classifies devices into "high", "mid", and "low" to automatically configure
 * camera resolution, live grid columns, and shader passes.
 */

export type DeviceTier = "high" | "mid" | "low";

export type DeviceProfile = {
  tier: DeviceTier;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  hasWebGL2: boolean;
  gpuRenderer: string;
  maxTextureSize: number;
  benchmarkMs: number;
  recommendedCols: number;
  recommendedCamWidth: number;
  recommendedCamHeight: number;
};

const STORAGE_KEY = "ascii_device_profile_v1";

function probeWebGL(): { hasWebGL2: boolean; renderer: string; maxTextureSize: number } {
  if (typeof document === "undefined") {
    return { hasWebGL2: false, renderer: "unknown", maxTextureSize: 2048 };
  }
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) {
      return { hasWebGL2: false, renderer: "none", maxTextureSize: 2048 };
    }
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "" : "";
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    return { hasWebGL2: true, renderer: String(renderer), maxTextureSize };
  } catch {
    return { hasWebGL2: false, renderer: "error", maxTextureSize: 2048 };
  }
}

/** Quick 2-3ms CPU/memory benchmark to detect weak execution environments */
function runMicroBenchmark(): number {
  const start = performance.now();
  let acc = 0;
  const n = 50000;
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    arr[i] = Math.sin(i * 0.01) * Math.cos(i * 0.02);
  }
  for (let i = 0; i < n; i++) {
    acc += arr[i] * 0.5;
  }
  const end = performance.now();
  // Prevent dead code elimination
  if (acc === 42.123456) console.log(acc);
  return end - start;
}

export function profileDevice(): DeviceProfile {
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as DeviceProfile;
        if (parsed && parsed.tier && parsed.recommendedCols) {
          return parsed;
        }
      }
    } catch {
      // localStorage may fail in private mode
    }
  }

  const nav = typeof navigator !== "undefined" ? navigator : null;
  const hardwareConcurrency = nav?.hardwareConcurrency ?? 4;
  const navMemory = nav && "deviceMemory" in nav ? (nav as { deviceMemory?: number }).deviceMemory ?? null : null;

  const { hasWebGL2, renderer, maxTextureSize } = probeWebGL();
  const benchmarkMs = typeof performance !== "undefined" ? runMicroBenchmark() : 10;

  // GPU heuristic
  const lowGpuRegex = /mali-400|mali-450|adreno\s*3|adreno\s*504|adreno\s*505|powervr|intel\s*hd\s*graphics\s*3000/i;
  const isWeakGpu = lowGpuRegex.test(renderer);

  let tier: DeviceTier = "mid";

  // Tier classification logic
  if (
    !hasWebGL2 ||
    isWeakGpu ||
    (navMemory !== null && navMemory <= 3) ||
    hardwareConcurrency <= 3 ||
    benchmarkMs > 15
  ) {
    tier = "low";
  } else if (
    hasWebGL2 &&
    (navMemory === null || navMemory >= 6) &&
    hardwareConcurrency >= 6 &&
    benchmarkMs < 4 &&
    !isWeakGpu
  ) {
    tier = "high";
  } else {
    tier = "mid";
  }

  const profile: DeviceProfile = {
    tier,
    hardwareConcurrency,
    deviceMemory: navMemory,
    hasWebGL2,
    gpuRenderer: renderer,
    maxTextureSize,
    benchmarkMs: Number(benchmarkMs.toFixed(2)),
    recommendedCols: tier === "high" ? 160 : tier === "mid" ? 120 : 80,
    recommendedCamWidth: tier === "high" ? 1280 : 960,
    recommendedCamHeight: tier === "high" ? 720 : 540,
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      /* ignore */
    }
  }

  return profile;
}
