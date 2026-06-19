"use client";

/**
 * ProfilePhotoGallery — manages 0-6 photos for the public DSO profile (Phase 4.5.d).
 *
 * Each photo: image + optional caption + sort_order. Operations are
 * auto-saving (like the DSO logo) — there's no explicit "save gallery"
 * button. The server actions revalidate /employer/settings/profile, and
 * we call router.refresh() so the parent server component re-fetches
 * with the new photo list.
 *
 * Reorder uses simple up/down arrows. dnd-kit is overkill for max-6 and
 * up/down is keyboard-native + screen-reader-friendly.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  Loader2,
  Trash2,
} from "lucide-react";
import { ImageUpload } from "@/components/image-upload/image-upload";
import {
  addPhoto,
  deletePhoto,
  reorderPhotos,
  updatePhotoCaption,
} from "./actions";
import { type ProfilePhoto, PROFILE_LIMITS } from "./profile-data";

interface ProfilePhotoGalleryProps {
  canEdit: boolean;
  initialPhotos: ProfilePhoto[];
}

export function ProfilePhotoGallery({
  canEdit,
  initialPhotos,
}: ProfilePhotoGalleryProps) {
  const router = useRouter();
  // Read photos directly from the prop — every mutation goes through a
  // server action that calls revalidatePath + router.refresh(), so the
  // parent re-renders us with fresh data. (No useState/useEffect dance.)
  const sorted = [...initialPhotos].sort((a, b) => a.sort_order - b.sort_order);
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flashMessage = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  };

  const onAddPhoto = (url: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await addPhoto({ storage_url: url, caption: null });
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      flashMessage("Photo added.");
      router.refresh();
    });
  };

  const onDeletePhoto = (photoId: string) => {
    if (busy) return;
    if (!confirm("Remove this photo from your public profile?")) return;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await deletePhoto({ photo_id: photoId });
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      flashMessage("Photo removed.");
      router.refresh();
    });
  };

  const onMovePhoto = (photoId: string, dir: -1 | 1) => {
    if (busy) return;
    const currentIds = sorted.map((p) => p.id);
    const idx = currentIds.indexOf(photoId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= currentIds.length) return;
    const next = [...currentIds];
    [next[idx], next[target]] = [next[target], next[idx]];

    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await reorderPhotos({ photo_ids: next });
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      flashMessage("Order saved.");
      router.refresh();
    });
  };

  const onSaveCaption = (photoId: string, caption: string) => {
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await updatePhotoCaption({
        photo_id: photoId,
        caption,
      });
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      flashMessage("Caption saved.");
      router.refresh();
    });
  };

  const remaining = PROFILE_LIMITS.PHOTOS_MAX - sorted.length;

  return (
    <section className="border border-[var(--rule)] bg-card p-6 sm:p-8">
      <header className="mb-5">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1.5">
          05 — Photo gallery
        </div>
        <h2 className="font-display text-lg font-bold text-ink">
          Up to {PROFILE_LIMITS.PHOTOS_MAX} photos of your practices
        </h2>
        <p className="mt-1 text-sm text-slate-body leading-relaxed max-w-[600px]">
          Real practice interiors, team photos, equipment shots. Skip stock
          photography — candidates can spot it instantly.
        </p>
      </header>

      <div className="space-y-4">
        {sorted.length === 0 && (
          <div className="border border-dashed border-[var(--rule-strong)] bg-cream/40 px-5 py-8 text-center text-sm text-slate-meta">
            No photos yet. Add up to {PROFILE_LIMITS.PHOTOS_MAX}.
          </div>
        )}

        {sorted.map((photo, idx) => (
          <PhotoRow
            key={photo.id}
            photo={photo}
            canEdit={canEdit}
            isFirst={idx === 0}
            isLast={idx === sorted.length - 1}
            isBusy={busy}
            onMove={(dir) => onMovePhoto(photo.id, dir)}
            onDelete={() => onDeletePhoto(photo.id)}
            onSaveCaption={(caption) => onSaveCaption(photo.id, caption)}
          />
        ))}

        {canEdit && remaining > 0 && (
          <div className="border border-dashed border-[var(--rule-strong)] bg-cream/30 p-4">
            <div className="mb-3 text-[12px] font-semibold text-ink">
              Add a photo ({remaining} {remaining === 1 ? "spot" : "spots"} left)
            </div>
            <ImageUpload
              value={null}
              pathPrefix="dso-photo"
              shape="square"
              outputFormat="image/jpeg"
              hint="Practice interior, team, or equipment. JPG / PNG / WebP up to 5MB."
              buttonLabel="Upload photo"
              onUploaded={(url) => onAddPhoto(url)}
              onRemove={() => {
                /* upload-then-remove in one breath: caller already
                   handled it server-side via onAddPhoto */
              }}
            />
          </div>
        )}

        {(flash || error || busy) && (
          <div className="border-t border-[var(--rule)] pt-3 text-sm">
            {error ? (
              <p className="text-danger inline-flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" />
                {error}
              </p>
            ) : busy ? (
              <p className="inline-flex items-center gap-1.5 text-slate-meta">
                <Loader2 className="size-3.5 animate-spin" />
                Saving…
              </p>
            ) : (
              flash && (
                <p className="inline-flex items-center gap-1.5 font-semibold text-heritage-deep">
                  <CheckCircle2 className="size-3.5" />
                  {flash}
                </p>
              )
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────── Per-photo row ───────── */

function PhotoRow({
  photo,
  canEdit,
  isFirst,
  isLast,
  isBusy,
  onMove,
  onDelete,
  onSaveCaption,
}: {
  photo: ProfilePhoto;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  isBusy: boolean;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onSaveCaption: (caption: string) => void;
}) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  const captionDirty = caption !== (photo.caption ?? "");

  return (
    <div className="grid grid-cols-[120px_1fr_auto] items-start gap-4 border border-[var(--rule)] bg-card p-3 sm:grid-cols-[160px_1fr_auto]">
      {/* Thumbnail */}
      <div className="aspect-square overflow-hidden bg-cream">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.storage_url}
          alt={photo.caption ?? "DSO photo"}
          className="h-full w-full object-cover"
        />
      </div>

      {/* Caption editor */}
      <div className="min-w-0">
        <label className="mb-1.5 block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
          Caption (optional)
        </label>
        <textarea
          value={caption}
          disabled={!canEdit}
          onChange={(e) => setCaption(e.target.value)}
          rows={2}
          maxLength={140}
          placeholder="e.g. Our flagship Indianapolis practice"
          className="w-full rounded border border-[var(--rule-strong)] bg-card px-3 py-2 text-sm text-ink leading-relaxed focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta"
        />
        {canEdit && captionDirty && (
          <button
            type="button"
            onClick={() => onSaveCaption(caption)}
            disabled={isBusy}
            className="mt-2 rounded-md bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            Save caption
          </button>
        )}
      </div>

      {/* Move + delete controls */}
      {canEdit && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-label="Move up"
            onClick={() => onMove(-1)}
            disabled={isFirst || isBusy}
            className="rounded p-1 text-slate-meta hover:bg-cream hover:text-ink disabled:opacity-30"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Move down"
            onClick={() => onMove(1)}
            disabled={isLast || isBusy}
            className="rounded p-1 text-slate-meta hover:bg-cream hover:text-ink disabled:opacity-30"
          >
            <ChevronDown className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Remove photo"
            onClick={onDelete}
            disabled={isBusy}
            className="mt-2 rounded p-1 text-slate-meta hover:bg-danger-bg hover:text-danger disabled:opacity-30"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
