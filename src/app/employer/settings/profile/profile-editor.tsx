"use client";

/**
 * ProfileEditor — client orchestrator for /employer/settings/profile (Phase 4.5.d).
 *
 * Renders 7 section cards (Identity / About / Brand visuals / Photo gallery /
 * Why join us / Culture & color / Contact CTA) and owns the per-section
 * dirty/saved state. Pattern mirrors /employer/jobs/[id]/edit (4.7.b).
 *
 * The Tiptap editor for the About section is loaded dynamically (next/dynamic
 * with ssr: false) — Tiptap chokes on SSR otherwise (immediatelyRender: false
 * is set inside it for the same reason).
 *
 * Photo gallery is its own component (photo-gallery.tsx) because the
 * add/caption/reorder/remove flow is heavy.
 */

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { ImageUpload } from "@/components/image-upload/image-upload";
import { JobDescriptionEditor } from "@/components/job-description-editor";
import { setDsoLogoUrl } from "../actions";
import {
  upsertSlug,
  upsertAbout,
  setDsoBannerUrl,
  upsertWhyJoinUs,
  upsertBrandAndCulture,
  upsertContactCta,
} from "./actions";
import {
  type ProfileData,
  type WhyJoinUsBlock,
  PROFILE_LIMITS,
} from "./profile-data";
import {
  CULTURE_CHIP_GROUPS,
  MAX_CULTURE_CHIPS,
} from "@/lib/dso-profile/culture-chips";
import { ProfilePhotoGallery } from "./photo-gallery";

/* ───────── Public origin (for slug preview) ───────── */

const PUBLIC_ORIGIN =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://dsohire.com";

/* ───────── Top-level component ───────── */

interface ProfileEditorProps {
  initial: ProfileData;
  canEdit: boolean;
}

export function ProfileEditor({ initial, canEdit }: ProfileEditorProps) {
  // Disable all section save buttons if the viewer can't edit. Each card
  // checks the prop locally so the "view-only" lock is consistent.
  return (
    <div className="space-y-5">
      <IdentitySection
        canEdit={canEdit}
        name={initial.name}
        initialSlug={initial.slug}
      />
      <AboutSection
        canEdit={canEdit}
        initialMission={initial.mission}
        initialDescription={initial.description}
      />
      <BrandVisualsSection
        canEdit={canEdit}
        initialLogoUrl={initial.logo_url}
        initialBannerUrl={initial.banner_url}
      />
      <ProfilePhotoGallery
        canEdit={canEdit}
        initialPhotos={initial.photos}
      />
      <WhyJoinUsSection canEdit={canEdit} initialBlocks={initial.why_join_us} />
      <CultureSection
        canEdit={canEdit}
        initialChips={initial.culture_chips}
        initialBrandColor={initial.brand_color}
      />
      <ContactCtaSection
        canEdit={canEdit}
        initialLabel={initial.contact_cta_label}
        initialUrl={initial.contact_cta_url}
      />
    </div>
  );
}

/* ───────── Shared: SectionShell + SaveBar ───────── */

function SectionShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--rule)] bg-white p-6 sm:p-8">
      <header className="mb-5">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1.5">
          {eyebrow}
        </div>
        <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-body leading-relaxed max-w-[600px]">
            {subtitle}
          </p>
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}

function SaveBar({
  dirty,
  saving,
  saved,
  error,
  onSave,
  saveLabel = "Save",
  disabled = false,
}: {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
  saveLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-4 border-t border-[var(--rule)] pt-4">
      <div className="min-w-0 flex-1 text-sm">
        {error && (
          <p className="text-red-700 inline-flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 shrink-0" />
            {error}
          </p>
        )}
        {!error && saved && (
          <p className="inline-flex items-center gap-1.5 text-heritage-deep">
            <CheckCircle2 className="size-3.5" />
            <span className="font-semibold">Saved.</span>
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || saving || disabled}
        className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-ivory transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Saving…
          </>
        ) : (
          saveLabel
        )}
      </button>
    </div>
  );
}

/* ───────── 1. Identity (slug edit) ───────── */

function IdentitySection({
  canEdit,
  name,
  initialSlug,
}: {
  canEdit: boolean;
  name: string;
  initialSlug: string;
}) {
  const [slug, setSlug] = useState(initialSlug);
  const [snapshot, setSnapshot] = useState(initialSlug);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dirty = slug !== snapshot;
  const slugLooksValid = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(slug);

  const submit = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await upsertSlug({ slug });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSnapshot(slug);
      setSaved(true);
      setConfirmOpen(false);
    });
  };

  const onSave = () => {
    if (!dirty) return;
    if (!slugLooksValid) {
      setError(
        "Use lowercase letters, numbers, and hyphens (3–60 chars, no leading/trailing hyphen)."
      );
      return;
    }
    setConfirmOpen(true);
  };

  return (
    <SectionShell
      eyebrow="01 — Identity"
      title="Public URL"
      subtitle="Your DSO's name is fixed at sign-up. The URL slug is editable; old URLs keep redirecting forever."
    >
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-ink">
            DSO name
          </label>
          <div className="rounded border border-[var(--rule)] bg-cream/50 px-3 py-2 text-sm text-slate-body">
            {name}
          </div>
        </div>

        <div>
          <label
            htmlFor="dso-slug"
            className="mb-1.5 block text-[12px] font-semibold text-ink"
          >
            URL slug
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-meta">
            <span className="font-mono">{PUBLIC_ORIGIN}/companies/</span>
            <input
              id="dso-slug"
              type="text"
              value={slug}
              disabled={!canEdit}
              onChange={(e) => {
                setSaved(false);
                setError(null);
                setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
              }}
              maxLength={60}
              className="flex-1 min-w-[180px] rounded border border-[var(--rule-strong)] bg-white px-3 py-2 font-mono text-sm text-ink focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-meta">
            3–60 characters, lowercase letters / numbers / hyphens.
          </p>
        </div>

        {confirmOpen && (
          <SlugChangeConfirm
            from={snapshot}
            to={slug}
            saving={pending}
            onConfirm={submit}
            onCancel={() => setConfirmOpen(false)}
          />
        )}

        <SaveBar
          dirty={dirty}
          saving={pending}
          saved={saved}
          error={error}
          onSave={onSave}
          saveLabel="Update slug"
          disabled={!canEdit}
        />
      </div>
    </SectionShell>
  );
}

function SlugChangeConfirm({
  from,
  to,
  saving,
  onConfirm,
  onCancel,
}: {
  from: string;
  to: string;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold mb-2 inline-flex items-center gap-1.5">
        <AlertTriangle className="size-3.5" />
        Confirm slug change
      </p>
      <p className="mb-3 leading-relaxed">
        You're moving from <code className="font-mono">/companies/{from}</code>{" "}
        to <code className="font-mono">/companies/{to}</code>. Old links keep
        working via a permanent redirect, but search engines and shared links
        may take a few days to fully reflect the change.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={saving}
          className="rounded-md bg-ink px-4 py-1.5 text-xs font-bold uppercase tracking-[1.5px] text-ivory hover:bg-ink-soft disabled:opacity-40"
        >
          {saving ? "Updating…" : "Yes, update"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-[var(--rule-strong)] bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-[1.5px] text-ink hover:bg-cream disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ───────── 2. About (mission + Tiptap description) ───────── */

function AboutSection({
  canEdit,
  initialMission,
  initialDescription,
}: {
  canEdit: boolean;
  initialMission: string | null;
  initialDescription: string | null;
}) {
  const [mission, setMission] = useState(initialMission ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [snapshot, setSnapshot] = useState({
    mission: initialMission ?? "",
    description: initialDescription ?? "",
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    mission !== snapshot.mission || description !== snapshot.description;

  const onSave = () => {
    setError(null);
    setSaved(false);
    if (mission.trim().length > PROFILE_LIMITS.MISSION_MAX) {
      setError(
        `Mission must be ${PROFILE_LIMITS.MISSION_MAX} characters or fewer.`
      );
      return;
    }
    startTransition(async () => {
      const result = await upsertAbout({
        mission: mission.trim() || null,
        description: description.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSnapshot({ mission, description });
      setSaved(true);
    });
  };

  const missionRemaining = PROFILE_LIMITS.MISSION_MAX - mission.length;

  return (
    <SectionShell
      eyebrow="02 — About"
      title="Your story in your own words"
      subtitle="Mission is the one-sentence positioning. Description is the long-form About page candidates land on after clicking your DSO name."
    >
      <div className="space-y-6">
        <div>
          <label
            htmlFor="dso-mission"
            className="mb-1.5 block text-[12px] font-semibold text-ink"
          >
            Mission / positioning
          </label>
          <textarea
            id="dso-mission"
            value={mission}
            disabled={!canEdit}
            onChange={(e) => {
              setSaved(false);
              setError(null);
              setMission(e.target.value);
            }}
            rows={2}
            maxLength={PROFILE_LIMITS.MISSION_MAX}
            placeholder="e.g. Doctor-led general dentistry across the Midwest, focused on quality over throughput."
            className="w-full rounded border border-[var(--rule-strong)] bg-white px-3 py-2 text-sm text-ink leading-relaxed focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta"
          />
          <p className="mt-1.5 text-xs text-slate-meta">
            {missionRemaining} characters remaining
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-ink">
            Description
          </label>
          <JobDescriptionEditor
            value={description}
            onChange={canEdit ? setDescription : undefined}
            placeholder="The longer story — your founding, your geography, what makes your operating model different, what it's like to work at one of your practices."
          />
          <p className="mt-1.5 text-xs text-slate-meta">
            Use H2 / H3 for section breaks. Lists, links, and blockquotes work too.
          </p>
        </div>

        <SaveBar
          dirty={dirty}
          saving={pending}
          saved={saved}
          error={error}
          onSave={onSave}
          saveLabel="Save About section"
          disabled={!canEdit}
        />
      </div>
    </SectionShell>
  );
}

/* ───────── 3. Brand visuals (logo + banner) ───────── */

function BrandVisualsSection({
  canEdit,
  initialLogoUrl,
  initialBannerUrl,
}: {
  canEdit: boolean;
  initialLogoUrl: string | null;
  initialBannerUrl: string | null;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [bannerUrl, setBannerUrl] = useState<string | null>(initialBannerUrl);
  const [, startSaving] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const persistLogo = (next: string | null) => {
    setError(null);
    startSaving(async () => {
      const result = await setDsoLogoUrl(next);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the logo.");
        return;
      }
      setLogoUrl(next);
      flashMessage(setFlash, next ? "Logo saved." : "Logo removed.");
    });
  };

  const persistBanner = (next: string | null) => {
    setError(null);
    startSaving(async () => {
      const result = await setDsoBannerUrl(next);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the banner.");
        return;
      }
      setBannerUrl(next);
      flashMessage(setFlash, next ? "Banner saved." : "Banner removed.");
    });
  };

  return (
    <SectionShell
      eyebrow="03 — Brand visuals"
      title="Logo and banner"
      subtitle="Logo shows in the header of every email and the avatar slot across the platform. Banner is the full-width image on your public profile."
    >
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-[180px_1fr]">
        <div>
          <h3 className="text-[12px] font-semibold text-ink mb-2">Logo</h3>
          <ImageUpload
            value={logoUrl}
            pathPrefix="dso-logo"
            shape="square"
            outputFormat="image/png"
            hint="Square. PNG / JPG / WebP, up to 5MB."
            buttonLabel={logoUrl ? "Change logo" : "Upload logo"}
            onUploaded={canEdit ? (u) => persistLogo(u) : () => {}}
            onRemove={canEdit ? () => persistLogo(null) : undefined}
          />
        </div>

        <div>
          <h3 className="text-[12px] font-semibold text-ink mb-2">Banner</h3>
          <ImageUpload
            value={bannerUrl}
            pathPrefix="dso-banner"
            shape="banner"
            outputFormat="image/jpeg"
            hint="Wide hero image (3:1). JPG / PNG / WebP up to 5MB."
            buttonLabel={bannerUrl ? "Change banner" : "Upload banner"}
            onUploaded={canEdit ? (u) => persistBanner(u) : () => {}}
            onRemove={canEdit ? () => persistBanner(null) : undefined}
          />
        </div>
      </div>

      {(flash || error) && (
        <div className="mt-5 border-t border-[var(--rule)] pt-3 text-sm">
          {error ? (
            <p className="text-red-700 inline-flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" />
              {error}
            </p>
          ) : (
            <p className="text-heritage-deep inline-flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="size-3.5" />
              {flash}
            </p>
          )}
        </div>
      )}
    </SectionShell>
  );
}

function flashMessage(
  set: (v: string | null) => void,
  msg: string,
  ms: number = 2500
) {
  set(msg);
  setTimeout(() => set(null), ms);
}

/* ───────── 5. Why Join Us blocks ───────── */

function WhyJoinUsSection({
  canEdit,
  initialBlocks,
}: {
  canEdit: boolean;
  initialBlocks: WhyJoinUsBlock[];
}) {
  const [blocks, setBlocks] = useState<WhyJoinUsBlock[]>(initialBlocks);
  const [snapshot, setSnapshot] = useState<WhyJoinUsBlock[]>(initialBlocks);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = !blocksEqual(blocks, snapshot);

  const update = (idx: number, patch: Partial<WhyJoinUsBlock>) => {
    setSaved(false);
    setError(null);
    setBlocks((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, ...patch } : b))
    );
  };

  const addBlock = () => {
    if (blocks.length >= PROFILE_LIMITS.WHY_BLOCKS_MAX) return;
    setSaved(false);
    setError(null);
    setBlocks((prev) => [...prev, { title: "", body: "" }]);
  };

  const removeBlock = (idx: number) => {
    setSaved(false);
    setError(null);
    setBlocks((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveBlock = (idx: number, dir: -1 | 1) => {
    setSaved(false);
    setError(null);
    setBlocks((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const onSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await upsertWhyJoinUs({ blocks });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The action drops empty rows, so re-snapshot from the cleaned
      // version of `blocks`.
      const cleaned = blocks
        .map((b) => ({ title: b.title.trim(), body: b.body.trim() }))
        .filter((b) => b.title || b.body);
      setBlocks(cleaned);
      setSnapshot(cleaned);
      setSaved(true);
    });
  };

  return (
    <SectionShell
      eyebrow="05 — Why join us"
      title="3–6 reasons your DSO stands out"
      subtitle="Short blocks that read like a talent-marketing pitch. Things like 'Mentorship that actually scales' or 'Quality dentistry, supported.'"
    >
      <div className="space-y-4">
        {blocks.length === 0 && (
          <div className="border border-dashed border-[var(--rule-strong)] bg-cream/40 px-5 py-8 text-center text-sm text-slate-meta">
            No blocks yet. Add 3–6 reasons candidates should pick your DSO over another.
          </div>
        )}

        {blocks.map((block, idx) => (
          <WhyJoinUsBlockEditor
            key={idx}
            index={idx}
            block={block}
            canEdit={canEdit}
            isFirst={idx === 0}
            isLast={idx === blocks.length - 1}
            onChange={(patch) => update(idx, patch)}
            onMove={(dir) => moveBlock(idx, dir)}
            onRemove={() => removeBlock(idx)}
          />
        ))}

        {canEdit && blocks.length < PROFILE_LIMITS.WHY_BLOCKS_MAX && (
          <button
            type="button"
            onClick={addBlock}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[var(--rule-strong)] bg-cream/30 px-4 py-2 text-[12px] font-semibold uppercase tracking-[1.5px] text-heritage-deep hover:bg-cream/60"
          >
            <Plus className="size-3.5" />
            Add block ({blocks.length}/{PROFILE_LIMITS.WHY_BLOCKS_MAX})
          </button>
        )}

        <SaveBar
          dirty={dirty}
          saving={pending}
          saved={saved}
          error={error}
          onSave={onSave}
          saveLabel="Save Why-join-us"
          disabled={!canEdit}
        />
      </div>
    </SectionShell>
  );
}

function WhyJoinUsBlockEditor({
  index,
  block,
  canEdit,
  isFirst,
  isLast,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  block: WhyJoinUsBlock;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<WhyJoinUsBlock>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-[var(--rule)] bg-cream/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta">
          Block {index + 1}
        </span>
        {canEdit && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Move up"
              onClick={() => onMove(-1)}
              disabled={isFirst}
              className="rounded p-1 text-slate-meta hover:bg-cream hover:text-ink disabled:opacity-30"
            >
              <ChevronUp className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Move down"
              onClick={() => onMove(1)}
              disabled={isLast}
              className="rounded p-1 text-slate-meta hover:bg-cream hover:text-ink disabled:opacity-30"
            >
              <ChevronDown className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Remove block"
              onClick={onRemove}
              className="rounded p-1 text-slate-meta hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <input
          type="text"
          value={block.title}
          disabled={!canEdit}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Title — e.g. Mentorship that actually scales"
          maxLength={PROFILE_LIMITS.WHY_BLOCK_TITLE_MAX}
          className="w-full rounded border border-[var(--rule-strong)] bg-white px-3 py-2 text-sm font-semibold text-ink focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta"
        />
        <textarea
          value={block.body}
          disabled={!canEdit}
          onChange={(e) => onChange({ body: e.target.value })}
          rows={3}
          maxLength={PROFILE_LIMITS.WHY_BLOCK_BODY_MAX}
          placeholder="2–3 sentences with specifics. What does it look like in practice?"
          className="w-full rounded border border-[var(--rule-strong)] bg-white px-3 py-2 text-sm text-ink leading-relaxed focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta"
        />
      </div>
    </div>
  );
}

function blocksEqual(a: WhyJoinUsBlock[], b: WhyJoinUsBlock[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].title !== b[i].title || a[i].body !== b[i].body) return false;
  }
  return true;
}

/* ───────── 6. Culture chips + brand color ───────── */

function CultureSection({
  canEdit,
  initialChips,
  initialBrandColor,
}: {
  canEdit: boolean;
  initialChips: string[];
  initialBrandColor: string | null;
}) {
  const [chips, setChips] = useState<Set<string>>(new Set(initialChips));
  const [brandColor, setBrandColor] = useState<string>(
    initialBrandColor ?? ""
  );
  const [snapshot, setSnapshot] = useState({
    chipKey: [...initialChips].sort().join("|"),
    color: initialBrandColor ?? "",
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const currentChipKey = [...chips].sort().join("|");
  const dirty =
    currentChipKey !== snapshot.chipKey || brandColor !== snapshot.color;

  const toggleChip = (chip: string) => {
    setSaved(false);
    setError(null);
    setChips((prev) => {
      const next = new Set(prev);
      if (next.has(chip)) {
        next.delete(chip);
      } else if (next.size < MAX_CULTURE_CHIPS) {
        next.add(chip);
      }
      return next;
    });
  };

  const onSave = () => {
    setError(null);
    setSaved(false);
    const colorOrNull = brandColor.trim() || null;
    if (colorOrNull && !/^#[0-9a-fA-F]{6}$/.test(colorOrNull)) {
      setError("Brand color must be a 6-digit hex like #14233F.");
      return;
    }
    startTransition(async () => {
      const result = await upsertBrandAndCulture({
        culture_chips: [...chips],
        brand_color: colorOrNull,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSnapshot({ chipKey: currentChipKey, color: brandColor });
      setSaved(true);
    });
  };

  return (
    <SectionShell
      eyebrow="06 — Brand & culture"
      title="Pick the chips that match — add an accent color"
      subtitle={`Up to ${MAX_CULTURE_CHIPS} chips. Brand color tints section eyebrows on your public profile (falls back to our default heritage green).`}
    >
      <div className="space-y-6">
        {/* Brand color */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-ink">
              Brand color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brandColor || "#4D7A60"}
                disabled={!canEdit}
                onChange={(e) => {
                  setSaved(false);
                  setError(null);
                  setBrandColor(e.target.value.toLowerCase());
                }}
                className="h-10 w-12 cursor-pointer rounded border border-[var(--rule-strong)] disabled:opacity-50"
              />
              <input
                type="text"
                value={brandColor}
                disabled={!canEdit}
                onChange={(e) => {
                  setSaved(false);
                  setError(null);
                  setBrandColor(e.target.value.toLowerCase());
                }}
                placeholder="#4D7A60"
                maxLength={7}
                className="w-28 rounded border border-[var(--rule-strong)] bg-white px-3 py-2 font-mono text-sm text-ink focus:border-heritage focus:outline-none disabled:bg-cream/40"
              />
              {brandColor && canEdit && (
                <button
                  type="button"
                  onClick={() => setBrandColor("")}
                  className="text-xs text-slate-meta hover:text-ink underline-offset-2 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Culture chips */}
        <div>
          <label className="mb-3 block text-[12px] font-semibold text-ink">
            Culture chips ({chips.size}/{MAX_CULTURE_CHIPS} selected)
          </label>
          <div className="space-y-4">
            {CULTURE_CHIP_GROUPS.map((group) => (
              <div key={group.id}>
                <div className="mb-2 text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
                  {group.label}
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.chips.map((chip) => {
                    const selected = chips.has(chip);
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => toggleChip(chip)}
                        disabled={!canEdit}
                        className={
                          "rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed " +
                          (selected
                            ? "border-ink bg-ink text-ivory hover:bg-ink-soft"
                            : "border-[var(--rule-strong)] bg-white text-slate-body hover:border-ink hover:text-ink")
                        }
                      >
                        {chip}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <SaveBar
          dirty={dirty}
          saving={pending}
          saved={saved}
          error={error}
          onSave={onSave}
          saveLabel="Save brand + culture"
          disabled={!canEdit}
        />
      </div>
    </SectionShell>
  );
}

/* ───────── 7. Contact CTA ───────── */

function ContactCtaSection({
  canEdit,
  initialLabel,
  initialUrl,
}: {
  canEdit: boolean;
  initialLabel: string | null;
  initialUrl: string | null;
}) {
  const [label, setLabel] = useState(initialLabel ?? "");
  const [url, setUrl] = useState(initialUrl ?? "");
  const [snapshot, setSnapshot] = useState({
    label: initialLabel ?? "",
    url: initialUrl ?? "",
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = label !== snapshot.label || url !== snapshot.url;

  const onSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await upsertContactCta({
        label: label.trim() || null,
        url: url.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSnapshot({ label, url });
      setSaved(true);
    });
  };

  return (
    <SectionShell
      eyebrow="07 — Contact CTA"
      title="One direct line on your public profile"
      subtitle="Optional. Adds a button below your About section so candidates can reach a real human if your roles don't fit them today."
    >
      <div className="space-y-5">
        <div>
          <label
            htmlFor="cta-label"
            className="mb-1.5 block text-[12px] font-semibold text-ink"
          >
            Button label
          </label>
          <input
            id="cta-label"
            type="text"
            value={label}
            disabled={!canEdit}
            onChange={(e) => {
              setSaved(false);
              setError(null);
              setLabel(e.target.value);
            }}
            maxLength={PROFILE_LIMITS.CTA_LABEL_MAX}
            placeholder="e.g. Talk to our recruiter"
            className="w-full rounded border border-[var(--rule-strong)] bg-white px-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta"
          />
        </div>

        <div>
          <label
            htmlFor="cta-url"
            className="mb-1.5 block text-[12px] font-semibold text-ink"
          >
            Destination URL
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-meta"
              aria-hidden="true"
            />
            <input
              id="cta-url"
              type="text"
              value={url}
              disabled={!canEdit}
              onChange={(e) => {
                setSaved(false);
                setError(null);
                setUrl(e.target.value);
              }}
              placeholder="mailto:careers@yourdso.com  ·  https://yourdso.com/careers"
              className="w-full rounded border border-[var(--rule-strong)] bg-white pl-9 pr-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-meta">
            Use <code className="font-mono">mailto:</code>,{" "}
            <code className="font-mono">https://</code>, or{" "}
            <code className="font-mono">tel:</code>.
          </p>
        </div>

        <SaveBar
          dirty={dirty}
          saving={pending}
          saved={saved}
          error={error}
          onSave={onSave}
          saveLabel="Save CTA"
          disabled={!canEdit}
        />
      </div>
    </SectionShell>
  );
}
