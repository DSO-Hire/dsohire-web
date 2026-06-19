"use client";

/**
 * Client wrapper that mounts <ImageUpload> for the candidate avatar
 * surface on /candidate/profile. Persists the public URL to
 * `candidates.avatar_url` via setCandidateAvatarUrl.
 *
 * Lives next to profile-form.tsx rather than inside it so the avatar
 * write is independent of the rest of the form state — a fresh photo
 * lands immediately, no Save button required.
 */

import { useState, useTransition } from "react";
import { ImageUpload } from "@/components/image-upload/image-upload";
import { setCandidateAvatarUrl } from "./actions";

export function CandidateAvatarUpload({
  initialUrl,
}: {
  initialUrl: string | null;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [, startSaving] = useTransition();
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const persist = (next: string | null) => {
    startSaving(async () => {
      const result = await setCandidateAvatarUrl(next);
      if (result.ok) {
        setUrl(next);
        setSavedFlash(next ? "Photo saved." : "Photo removed.");
        setTimeout(() => setSavedFlash(null), 2500);
      } else {
        // Could surface this with a real toast — for v1 the alert is fine.
        alert(result.error ?? "Couldn't save the photo.");
      }
    });
  };

  return (
    <div className="space-y-2">
      <ImageUpload
        value={url}
        pathPrefix="avatar"
        shape="circle"
        outputFormat="image/jpeg"
        hint="A headshot makes your profile feel real to employers. JPG, PNG, or WebP up to 5MB."
        onUploaded={(publicUrl) => persist(publicUrl)}
        onRemove={() => persist(null)}
      />
      {savedFlash && (
        <p
          role="status"
          className="text-xs font-medium text-heritage"
        >
          {savedFlash}
        </p>
      )}
    </div>
  );
}
