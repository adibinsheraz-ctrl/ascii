/** Decode uploads (JPG/PNG/WEBP/HEIC) at full resolution with EXIF orientation. */

export class ImageDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageDecodeError";
  }
}

function contextFromSize(w: number, h: number): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (ctx) return ctx;
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new ImageDecodeError("Could not read image pixels");
  return ctx;
}

async function bitmapFromBlob(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    return createImageBitmap(blob);
  }
}

function looksLikeHeic(blob: Blob): boolean {
  const type = blob.type.toLowerCase();
  const name = (blob as File).name ?? "";
  return type.includes("heic") || type.includes("heif") || /\.hei[cf]$/i.test(name);
}

async function heicToBlob(blob: Blob): Promise<Blob> {
  try {
    const convert = (await import("heic2any")).default;
    const out = await convert({ blob, toType: "image/jpeg", quality: 0.95 });
    return Array.isArray(out) ? out[0] : out;
  } catch {
    throw new ImageDecodeError(
      "This HEIC photo could not be converted in this browser. Save it as JPG or PNG and try again.",
    );
  }
}

export async function imageDataFromSource(
  source: Blob | File | ImageBitmap | HTMLImageElement | HTMLCanvasElement | ImageData,
): Promise<ImageData> {
  if (source instanceof ImageData) return source;

  if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
    const ctx = source.getContext("2d");
    if (!ctx) throw new ImageDecodeError("Canvas has no 2D context");
    return ctx.getImageData(0, 0, source.width, source.height);
  }

  let bitmap: ImageBitmap;
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    bitmap = source;
  } else if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    bitmap = await createImageBitmap(source);
  } else {
    const blob = source as Blob;
    const isHeic = looksLikeHeic(blob);
    try {
      if (isHeic) {
        bitmap = await bitmapFromBlob(await heicToBlob(blob));
      } else {
        bitmap = await bitmapFromBlob(blob);
      }
    } catch (err) {
      if (err instanceof ImageDecodeError) throw err;
      if (!isHeic) {
        try {
          bitmap = await bitmapFromBlob(await heicToBlob(blob));
        } catch {
          throw new ImageDecodeError("That file could not be read as an image. Use JPG, PNG, WEBP, or HEIC.");
        }
      } else {
        throw new ImageDecodeError(
          "This HEIC photo could not be converted in this browser. Save it as JPG or PNG and try again.",
        );
      }
    }
  }

  if (bitmap.width < 2 || bitmap.height < 2) {
    bitmap.close?.();
    throw new ImageDecodeError("The image is too small to convert.");
  }

  const ctx = contextFromSize(bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close?.();
  return data;
}

export async function imageDataFromUrl(url: string): Promise<ImageData> {
  const res = await fetch(url);
  if (!res.ok) throw new ImageDecodeError("Could not load the sample image.");
  const blob = await res.blob();
  return imageDataFromSource(blob);
}
