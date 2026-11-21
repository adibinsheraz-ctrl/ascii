import type { FaceRect } from "./types";

type NativeFaceDetector = {
  detect: (image: ImageBitmapSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

export async function detectFaces(
  source: ImageBitmap | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<FaceRect[]> {
  const Detector = (globalThis as unknown as { FaceDetector?: new (opts: { fastMode: boolean }) => NativeFaceDetector }).FaceDetector;
  if (!Detector) return [];
  try {
    const detector = new Detector({ fastMode: true });
    const faces = await detector.detect(source);
    const w =
      "videoWidth" in source && source.videoWidth
        ? source.videoWidth
        : "naturalWidth" in source && source.naturalWidth
          ? source.naturalWidth
          : "width" in source
            ? Number(source.width)
            : 1;
    const h =
      "videoHeight" in source && source.videoHeight
        ? source.videoHeight
        : "naturalHeight" in source && source.naturalHeight
          ? source.naturalHeight
          : "height" in source
            ? Number(source.height)
            : 1;
    return faces.map((f) => ({
      x: f.boundingBox.x / w,
      y: f.boundingBox.y / h,
      width: f.boundingBox.width / w,
      height: f.boundingBox.height / h,
    }));
  } catch {
    return [];
  }
}
