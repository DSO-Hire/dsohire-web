"use client";

/**
 * DSO logo upload — client wrapper around <ImageUpload> that persists
 * the public URL to dsos.logo_url via setDsoLogoUrl.
 *
 * Square shape at v1 — most DSO logos look right in a square crop,
 * and the existing /companies/[slug] surface renders them in a square
 * tile. Phase 4.5.c can introduce a banner-shape variant if needed.
 */

import { useState, useTransition } from "react";
import { ImageUpload } from "@/components/image-upload/image-upload";
import { setDsoLogoUrl } from "./actions";

export function DsoLogoUpload({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [, startSaving] = useTransition();
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const persist = (next: string | null) => {
    startSaving(async () => {
      const result = await setDsoLogoUrl(next);
      if (result.ok) {
        setUrl(next);
        setSavedFlash(next ? "Logo saved." : "Logo removed.");
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
        pathPrefix="dso-logo"
        shape="square"
        outputFormat="image/png"
        hint="Square aspect, transparent backgrounds welcome. PNG, JPG, or WebP up to 5MB."
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
