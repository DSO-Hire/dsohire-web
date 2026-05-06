/**
 * Browser-side canvas helpers used by <ImageUpload>.
 *
 * Two responsibilities:
 *   1. `cropToBlob()` — given a source image URL + a pixel crop region from
 *      react-easy-crop, render the cropped portion to an offscreen canvas,
 *      downscale to a max output width, and export as a JPEG blob ready
 *      to upload.
 *   2. `readFileAsDataURL()` — convenience wrapper around FileReader for
 *      previewing a freshly-dropped file.
 *
 * Browser-only — uses `Image`, `document`, and `<canvas>`. Never import
 * into a server file.
 */

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_MAX_OUTPUT_WIDTH = 1200;
const DEFAULT_JPEG_QUALITY = 0.9;

/**
 * Render the pixelCrop region of `imageSrc` to a canvas, downscaling so
 * the output is at most `maxOutputWidth` pixels wide. Returns a JPEG blob.
 *
 * Why JPEG: avatars + logos rarely need transparency, JPEG quality 0.9
 * runs ~3-5x smaller than equivalent PNG, and the Resend emails + public
 * pages render exactly the same. PNG output is available via
 * `outputFormat: 'image/png'` for surfaces that need transparency
 * (banners over a colored background, future logo treatments).
 */
export async function cropToBlob(
  imageSrc: string,
  pixelCrop: PixelCrop,
  options: {
    maxOutputWidth?: number;
    quality?: number;
    outputFormat?: "image/jpeg" | "image/png" | "image/webp";
  } = {}
): Promise<Blob> {
  const {
    maxOutputWidth = DEFAULT_MAX_OUTPUT_WIDTH,
    quality = DEFAULT_JPEG_QUALITY,
    outputFormat = "image/jpeg",
  } = options;

  const image = await loadImage(imageSrc);

  // Compute output dimensions — preserve aspect, never upscale.
  const scale = Math.min(1, maxOutputWidth / pixelCrop.width);
  const outputWidth = Math.round(pixelCrop.width * scale);
  const outputHeight = Math.round(pixelCrop.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Couldn't get 2D context — your browser may not support canvas.");
  }

  // High-quality resampling for the downscale step.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight
  );

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Couldn't render image to a blob."));
          return;
        }
        resolve(blob);
      },
      outputFormat,
      quality
    );
  });
}

/** FileReader → data URL, promisified. */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // crossOrigin only matters when src is a remote URL; data: URLs are fine.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the image."));
    img.src = src;
  });
}
