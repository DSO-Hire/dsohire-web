"use client";

/**
 * <ImageUpload> — reusable image upload primitive (Phase 4.1.a).
 *
 * Three states the component cycles through:
 *   1. idle     — shows current image (or empty placeholder), with a
 *                 drop zone overlay and a "Browse files" button.
 *   2. cropping — react-easy-crop overlay with drag + zoom; user
 *                 confirms or cancels.
 *   3. saving   — spinner on the confirm button while we POST the
 *                 cropped blob to `uploadImageAction`.
 *
 * Props let the consumer pick:
 *   • `pathPrefix`   — folder namespace inside the user's storage path
 *                      (e.g., "avatar", "dso-logo", "dso-banner").
 *   • `shape`        — visual treatment of the preview ("circle" |
 *                      "square" | "banner"); also drives the crop
 *                      shape (round mask for circle, rect otherwise).
 *   • `aspect`       — crop aspect ratio number; defaults to match shape.
 *   • `outputFormat` — "image/jpeg" | "image/png" | "image/webp".
 *                      Default JPEG for photos; choose PNG/WebP if the
 *                      surface needs alpha (logos with transparency).
 *   • `onUploaded`   — called with the final public URL once storage
 *                      write succeeds. Persistence to a DB row is the
 *                      caller's responsibility.
 *
 * Used by candidate avatars, teammate avatars, DSO logos, DSO banners,
 * and future DSO-profile photos.
 */

import { useCallback, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Camera, ImageIcon, Loader2, X } from "lucide-react";
import { uploadImageAction } from "@/lib/storage/upload-image";
import { cropToBlob, readFileAsDataURL } from "./canvas-crop";

export type ImageUploadShape = "circle" | "square" | "banner";

export interface ImageUploadProps {
  /** Current image URL, if any. Rendered in the idle state preview. */
  value: string | null;
  /** Folder namespace under the user's storage prefix (e.g. "avatar"). */
  pathPrefix: string;
  /** Visual treatment of the preview + crop overlay. */
  shape?: ImageUploadShape;
  /** Override the default aspect for the chosen `shape`. */
  aspect?: number;
  /** Output blob format. Default JPEG. */
  outputFormat?: "image/jpeg" | "image/png" | "image/webp";
  /** Hint copy under the drop zone. */
  hint?: string;
  /** Display label on the trigger button (defaults to "Change photo"). */
  buttonLabel?: string;
  /** Called with the final public URL after upload succeeds. */
  onUploaded: (url: string) => void;
  /** Optional clear handler — surfaces a "Remove" link in idle state. */
  onRemove?: () => void;
}

const SHAPE_DEFAULTS: Record<
  ImageUploadShape,
  { aspect: number; cropShape: "round" | "rect"; previewClass: string; sizeClass: string }
> = {
  circle: {
    aspect: 1,
    cropShape: "round",
    previewClass: "rounded-full",
    sizeClass: "size-32",
  },
  square: {
    aspect: 1,
    cropShape: "rect",
    previewClass: "rounded-md",
    sizeClass: "size-32",
  },
  banner: {
    aspect: 3 / 1,
    cropShape: "rect",
    previewClass: "rounded-md",
    // Banner is wider than tall — the preview reflects the aspect.
    sizeClass: "h-28 w-full",
  },
};

const ACCEPT_ATTR = "image/jpeg,image/png,image/webp";

export function ImageUpload({
  value,
  pathPrefix,
  shape = "circle",
  aspect: aspectOverride,
  outputFormat = "image/jpeg",
  hint = "JPG, PNG, or WebP up to 5MB.",
  buttonLabel,
  onUploaded,
  onRemove,
}: ImageUploadProps) {
  const shapeConfig = SHAPE_DEFAULTS[shape];
  const aspect = aspectOverride ?? shapeConfig.aspect;

  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "saving">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File pick ──────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setError(null);

    if (!ACCEPT_ATTR.split(",").includes(file.type)) {
      setError("Please pick a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(
        `That image is ${(file.size / 1_048_576).toFixed(1)}MB; the limit is 5MB.`
      );
      return;
    }

    try {
      const dataUrl = await readFileAsDataURL(file);
      setSourceUrl(dataUrl);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } catch {
      setError("Couldn't read that file. Try a different image.");
    }
  }, []);

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so re-picking the same file re-triggers change.
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ── Crop confirm ───────────────────────────────────────────────────

  const onCropComplete = useCallback(
    (_area: Area, areaPixels: Area) => {
      setCroppedAreaPixels(areaPixels);
    },
    []
  );

  const cancelCrop = () => {
    setSourceUrl(null);
    setCroppedAreaPixels(null);
    setError(null);
  };

  const confirmCrop = async () => {
    if (!sourceUrl || !croppedAreaPixels) return;
    setBusy("saving");
    setError(null);

    try {
      const blob = await cropToBlob(sourceUrl, croppedAreaPixels, {
        outputFormat,
      });

      const ext =
        outputFormat === "image/png"
          ? "png"
          : outputFormat === "image/webp"
            ? "webp"
            : "jpg";
      const file = new File([blob], `${pathPrefix}.${ext}`, {
        type: outputFormat,
      });
      const formData = new FormData();
      formData.append("image", file);
      formData.append("pathPrefix", pathPrefix);

      const result = await uploadImageAction(formData);

      if (!result.ok) {
        setError(result.error);
        setBusy("idle");
        return;
      }

      onUploaded(result.url);
      // Reset to idle with new image showing.
      setSourceUrl(null);
      setCroppedAreaPixels(null);
      setBusy("idle");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't upload the image."
      );
      setBusy("idle");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────

  // Cropping state takes over the surface so the drag interaction has room.
  if (sourceUrl) {
    return (
      <div className="space-y-4">
        <div className="relative h-80 w-full overflow-hidden rounded-md bg-slate-900">
          <Cropper
            image={sourceUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={shapeConfig.cropShape}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex-1 text-xs text-muted-foreground">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="mt-1 block w-full"
              aria-label="Zoom"
              disabled={busy === "saving"}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={cancelCrop}
            disabled={busy === "saving"}
            className="text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmCrop}
            disabled={busy === "saving"}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy === "saving" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Uploading…
              </>
            ) : (
              "Save photo"
            )}
          </button>
        </div>
      </div>
    );
  }

  // Idle state — preview + drop zone + browse trigger.
  //
  // Banner shape stacks vertically (preview on top, controls + hint below)
  // because banner's natural aspect (3:1) wants the full container width;
  // a horizontal flex would push the button + hint past the right edge.
  // Circle and square keep the original horizontal layout (compact preview
  // on the left, controls beside it).
  const isBanner = shape === "banner";

  const PreviewBox = (
    <div
      className={`relative flex items-center justify-center overflow-hidden border border-border bg-muted ${shapeConfig.sizeClass} ${shapeConfig.previewClass} ${isBanner ? "" : "shrink-0"}`}
      aria-label={value ? "Current image preview" : "No image set"}
    >
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          className={`h-full w-full object-cover ${shapeConfig.previewClass}`}
        />
      ) : (
        <ImageIcon className="size-7 text-meta-foreground" aria-hidden="true" />
      )}
    </div>
  );

  const UploadButton = (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      className="inline-flex w-fit shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
    >
      <Camera className="size-4" />
      {buttonLabel ?? (value ? "Change photo" : "Upload photo")}
    </button>
  );

  const RemoveButton =
    value && onRemove ? (
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-danger"
      >
        <X className="size-3.5" />
        Remove
      </button>
    ) : null;

  const HintText = (
    <p className="text-xs text-muted-foreground">
      {hint} You can also drop a file anywhere on this row.
    </p>
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={onDrop}
      className="space-y-3"
    >
      {isBanner ? (
        // Banner layout: preview on top, controls + hint below.
        <>
          {PreviewBox}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {UploadButton}
            {RemoveButton}
            {/* Full-width on mobile so it drops below the buttons instead of
                squeezing into a thin one-word-per-line column. */}
            <p className="w-full text-xs text-muted-foreground sm:w-auto sm:min-w-0 sm:flex-1">
              {hint} You can also drop a file anywhere on this row.
            </p>
          </div>
        </>
      ) : (
        // Default layout: on mobile the preview stacks above full-width
        // controls + hint (so the hint isn't squeezed into a thin column);
        // sm+ keeps the compact preview-on-the-left layout.
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:gap-5">
          {PreviewBox}
          <div className="flex flex-1 flex-col gap-2">
            {UploadButton}
            {RemoveButton}
            {HintText}
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_ATTR}
        onChange={onFileInputChange}
        className="sr-only"
        aria-label="Choose image file"
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
