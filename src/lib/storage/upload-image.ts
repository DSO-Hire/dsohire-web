"use server";

/**
 * Server action — upload a cropped image blob to the `public-images` bucket.
 *
 * Used by `<ImageUpload>` (Phase 4.1.a). The component renders the
 * cropped region to a JPEG/PNG/WebP blob client-side, posts it as
 * FormData, and we write it to Supabase Storage at:
 *
 *   {auth.uid()}/{pathPrefix}-{timestamp}.{ext}
 *
 * Bucket RLS (shipped in 20260506000001_phase_4_1_foundation.sql) only
 * allows writes to a folder matching `auth.uid()`, so even if a malicious
 * client sends a crafted pathPrefix, they can't write outside their own
 * directory.
 *
 * Persistence of the resulting URL (e.g., into `candidates.avatar_url`
 * or `dsos.logo_url`) is the consumer's job — we just hand back the
 * public URL and let the parent surface decide what to do with it.
 *
 * Cap: 5MB (storage bucket also enforces this; we double-check here so
 * the error message is friendlier than the bucket's native one).
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

const BUCKET = "public-images";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const VALID_PATH_PREFIX = /^[a-z0-9_-]{1,32}$/;

export type UploadImageResult =
  | { ok: true; url: string; path: string }
  | {
      ok: false;
      error: string;
      errorCode:
        | "not_signed_in"
        | "no_file"
        | "invalid_path_prefix"
        | "file_too_large"
        | "unsupported_mime"
        | "storage_failed";
    };

export async function uploadImageAction(
  formData: FormData
): Promise<UploadImageResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      errorCode: "not_signed_in",
      error: "Please sign in to upload an image.",
    };
  }

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      errorCode: "no_file",
      error: "No image received.",
    };
  }

  // Path prefix is a per-consumer namespace (e.g., 'avatar', 'dso-logo')
  // so we can co-locate multiple images per uploader without collision.
  // Constrained to a safe character set so we never have to escape it
  // when building the storage key.
  const rawPathPrefix = String(formData.get("pathPrefix") ?? "image");
  if (!VALID_PATH_PREFIX.test(rawPathPrefix)) {
    return {
      ok: false,
      errorCode: "invalid_path_prefix",
      error: "Invalid upload target.",
    };
  }

  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      errorCode: "file_too_large",
      error: `That image is ${(file.size / 1_048_576).toFixed(1)}MB; the limit is ${MAX_BYTES / 1_048_576}MB.`,
    };
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return {
      ok: false,
      errorCode: "unsupported_mime",
      error: "Please upload a JPG, PNG, or WebP image.",
    };
  }

  const ext = mimeToExtension(file.type);
  // Path: {auth.uid()}/{pathPrefix}-{timestamp}.{ext}
  // The first folder MUST be auth.uid() to satisfy bucket RLS.
  const path = `${user.id}/${rawPathPrefix}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "31536000", // 1 year — bust by changing the path
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    console.error("[storage/upload-image] upload failed", uploadError);
    return {
      ok: false,
      errorCode: "storage_failed",
      error: "Couldn't save the image. Try again in a moment.",
    };
  }

  const { data: publicUrl } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return { ok: true, url: publicUrl.publicUrl, path };
}

function mimeToExtension(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "img";
}
