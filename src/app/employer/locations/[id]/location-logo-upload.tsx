"use client";

/**
 * Per-location logo upload — client wrapper around <ImageUpload> that
 * persists the public URL to dso_locations.logo_url via the
 * `setLocationLogoUrl` server action.
 *
 * Square shape mirrors the DSO-level logo (most practice logos crop
 * cleanly to a square, and the employer-list Avatar is square too).
 * When this is null, the Avatar primitive renders deterministic-color
 * initials from the practice name.
 */

import { useState, useTransition } from "react";
import { ImageUpload } from "@/components/image-upload/image-upload";
import { setLocationLogoUrl } from "../actions";

interface LocationLogoUploadProps {
  locationId: string;
  initialUrl: string | null;
}

export function LocationLogoUpload({
  locationId,
  initialUrl,
}: LocationLogoUploadProps) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [, startSaving] = useTransition();
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const persist = (next: string | null) => {
    startSaving(async () => {
      const result = await setLocationLogoUrl(locationId, next);
      if (result.ok) {
        setUrl(next);
        setSavedFlash(next ? "Practice logo saved." : "Logo removed.");
        setTimeout(() => setSavedFlash(null), 2500);
      } else {
        alert(result.error ?? "Couldn't save the logo.");
      }
    });
  };

  return (
    <div className="space-y-2">
      <ImageUpload
        value={url}
        pathPrefix={`location-logo/${locationId}`}
        shape="square"
        outputFormat="image/png"
        hint="Square aspect, transparent backgrounds welcome. PNG, JPG, or WebP up to 5MB. Falls back to colored initials when blank."
        buttonLabel={url ? "Change logo" : "Upload logo"}
        onUploaded={(publicUrl) => persist(publicUrl)}
        onRemove={() => persist(null)}
      />
      {savedFlash && (
        <p role="status" className="text-xs font-medium text-[#4D7A60]">
          {savedFlash}
        </p>
      )}
    </div>
  );
}
