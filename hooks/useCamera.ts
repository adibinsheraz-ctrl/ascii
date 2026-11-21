"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { profileDevice } from "@/lib/ascii-engine/device";

export type CameraError = "denied" | "missing" | "busy" | "unknown" | null;

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<"user" | "environment">("user");
  const wantLive = useRef(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [mirror, setMirror] = useState(true);
  const [error, setError] = useState<CameraError>(null);
  const [ready, setReady] = useState(false);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setReady(false);
  }, []);

  const start = useCallback(async (nextFacing: "user" | "environment" = facingRef.current) => {
    wantLive.current = true;
    stopTracks();
    setError(null);
    const profile = profileDevice();
    const tryConstraints = async (constraints: MediaStreamConstraints) => {
      return navigator.mediaDevices.getUserMedia(constraints);
    };
    try {
      let stream: MediaStream;
      try {
        stream = await tryConstraints({
          audio: false,
          video: {
            facingMode: { ideal: nextFacing },
            width: { ideal: profile.recommendedCamWidth },
            height: { ideal: profile.recommendedCamHeight },
            frameRate: { ideal: profile.tier === "high" ? 60 : 30 },
          },
        });
      } catch {
        try {
          stream = await tryConstraints({
            audio: false,
            video: { facingMode: nextFacing },
          });
        } catch {
          stream = await tryConstraints({
            audio: false,
            video: true,
          });
        }
      }
      if (!wantLive.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          /* ignore play interruption */
        }
      }
      facingRef.current = nextFacing;
      setFacing(nextFacing);
      setMirror(nextFacing === "user");
      setReady(true);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") setError("denied");
      else if (name === "NotFoundError" || name === "DevicesNotFoundError") setError("missing");
      else if (name === "NotReadableError" || name === "TrackStartError") setError("busy");
      else setError("unknown");
    }
  }, [stopTracks]);

  const stop = useCallback(() => {
    wantLive.current = false;
    stopTracks();
  }, [stopTracks]);

  const flip = useCallback(() => {
    const next = facingRef.current === "user" ? "environment" : "user";
    void start(next);
  }, [start]);

  useEffect(() => {
    const onHide = () => {
      if (document.hidden) {
        stopTracks();
      } else if (wantLive.current) {
        void start(facingRef.current);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      wantLive.current = false;
      stopTracks();
    };
  }, [start, stopTracks]);

  return { videoRef, start, stop, flip, facing, mirror, setMirror, error, ready };
}
