/**
 * Adaptive Quality Controller.
 * Monitors real-time frame times with hysteresis to dynamically scale
 * grid density and disable heavy post-processing passes when frames lag.
 */

import type { DeviceProfile } from "./device";

export type QualityState = {
  currentCols: number;
  allowGlow: boolean;
  fps: number;
  avgFrameTime: number;
  tier: DeviceProfile["tier"];
  droppedFrames: number;
};

export class AdaptiveQualityController {
  private profile: DeviceProfile;
  private currentCols: number;
  private minCols: number;
  private maxCols: number;
  private targetFrameTime: number; // ms
  private frameTimes: number[] = [];
  private maxSamples = 20;
  private lastTime = 0;
  private slowCounter = 0;
  private fastCounter = 0;
  private allowGlow = true;
  private droppedFrames = 0;
  private fps = 60;
  private avgFrameTime = 16.6;

  constructor(profile: DeviceProfile) {
    this.profile = profile;
    this.currentCols = profile.recommendedCols;
    this.minCols = 60;
    this.maxCols = Math.max(profile.recommendedCols, 180);
    this.targetFrameTime = profile.tier === "high" ? 16.67 : 33.33;
    this.allowGlow = profile.tier !== "low";
  }

  recordFrame(now: number): QualityState {
    if (this.lastTime > 0) {
      const dt = now - this.lastTime;
      // Filter out huge pauses from backgrounding/tab switching
      if (dt > 0 && dt < 500) {
        this.frameTimes.push(dt);
        if (this.frameTimes.length > this.maxSamples) {
          this.frameTimes.shift();
        }

        const sum = this.frameTimes.reduce((a, b) => a + b, 0);
        this.avgFrameTime = sum / this.frameTimes.length;
        this.fps = this.avgFrameTime > 0 ? 1000 / this.avgFrameTime : 30;

        this.checkAdaptation();
      } else if (dt >= 500) {
        this.droppedFrames++;
      }
    }
    this.lastTime = now;

    return {
      currentCols: this.currentCols,
      allowGlow: this.allowGlow,
      fps: Number(this.fps.toFixed(1)),
      avgFrameTime: Number(this.avgFrameTime.toFixed(1)),
      tier: this.profile.tier,
      droppedFrames: this.droppedFrames,
    };
  }

  private checkAdaptation(): void {
    const thresholdHigh = this.targetFrameTime * 1.25;
    const thresholdLow = this.targetFrameTime * 0.75;

    if (this.avgFrameTime > thresholdHigh) {
      this.slowCounter++;
      this.fastCounter = 0;
      // 3 consecutive checks under load -> step down
      if (this.slowCounter >= 3) {
        this.slowCounter = 0;
        if (this.allowGlow) {
          this.allowGlow = false;
        } else if (this.currentCols > this.minCols) {
          this.currentCols = Math.max(this.minCols, this.currentCols - 16);
        }
      }
    } else if (this.avgFrameTime < thresholdLow) {
      this.fastCounter++;
      this.slowCounter = 0;
      // 8 consecutive checks with headroom -> step up (hysteresis)
      if (this.fastCounter >= 8) {
        this.fastCounter = 0;
        if (this.currentCols < this.maxCols) {
          this.currentCols = Math.min(this.maxCols, this.currentCols + 12);
        } else if (!this.allowGlow && this.profile.tier !== "low") {
          this.allowGlow = true;
        }
      }
    } else {
      this.slowCounter = Math.max(0, this.slowCounter - 1);
      this.fastCounter = Math.max(0, this.fastCounter - 1);
    }
  }

  getRecommendedColumns(): number {
    return this.currentCols;
  }

  isGlowAllowed(): boolean {
    return this.allowGlow;
  }

  reset(): void {
    this.frameTimes = [];
    this.lastTime = 0;
    this.slowCounter = 0;
    this.fastCounter = 0;
  }
}
