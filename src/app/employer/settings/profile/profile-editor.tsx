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
import { LocationAutocompleteField } from "@/components/ui/location-autocomplete-input";
import { JobDescriptionEditor } from "@/components/job-description-editor";
import { setDsoLogoUrl } from "../actions";
import {
  upsertSlug,
  updateDsoName,
  upsertAbout,
  setDsoBannerUrl,
  upsertWhyJoinUs,
  upsertBrandAndCulture,
  upsertContactCta,
  upsertCompanyDetails,
  upsertPracticeProfile,
} from "./actions";
import {
  type ProfileData,
  type WhyJoinUsBlock,
  PROFILE_LIMITS,
  PRACTICE_PACE_OPTIONS,
  AUTONOMY_LEVEL_OPTIONS,
  MENTORSHIP_OPTIONS,
  PRACTICE_FEEL_OPTIONS,
  PATIENT_POPULATION_OPTIONS,
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
        initialName={initial.name}
        initialSlug={initial.slug}
      />
      <CompanyDetailsSection
        canEdit={canEdit}
        initialWebsite={initial.website}
        initialCity={initial.headquarters_city}
        initialState={initial.headquarters_state}
        initialCandidateReplyTo={initial.candidate_reply_to_email}
        initialPracticeCount={initial.practice_count}
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
      <PracticeProfileSection
        canEdit={canEdit}
        initialPace={initial.practice_pace}
        initialAutonomy={initial.autonomy_level}
        initialMentorship={initial.mentorship_offered}
        initialFeel={initial.practice_feel}
        initialCeSupport={initial.ce_support}
        initialWorkLife={initial.work_life_balance}
        initialPatientPopulations={initial.patient_populations}
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

/* ───────── PracticeFit practice profile (v3 culture mirror) ───────── */

function PracticeProfileSection({
  canEdit,
  initialPace,
  initialAutonomy,
  initialMentorship,
  initialFeel,
  initialCeSupport,
  initialWorkLife,
  initialPatientPopulations,
}: {
  canEdit: boolean;
  initialPace: string | null;
  initialAutonomy: string | null;
  initialMentorship: string | null;
  initialFeel: string | null;
  initialCeSupport: number | null;
  initialWorkLife: number | null;
  initialPatientPopulations: string[];
}) {
  const [pace, setPace] = useState<string | null>(initialPace);
  const [autonomy, setAutonomy] = useState<string | null>(initialAutonomy);
  const [mentorship, setMentorship] = useState<string | null>(initialMentorship);
  const [feel, setFeel] = useState<string | null>(initialFeel);
  const [ce, setCe] = useState<number | null>(initialCeSupport);
  const [wlb, setWlb] = useState<number | null>(initialWorkLife);
  const [populations, setPopulations] = useState<string[]>(
    initialPatientPopulations
  );
  const [snapshot, setSnapshot] = useState({
    pace: initialPace,
    autonomy: initialAutonomy,
    mentorship: initialMentorship,
    feel: initialFeel,
    ce: initialCeSupport,
    wlb: initialWorkLife,
    populations: initialPatientPopulations,
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

  const dirty =
    pace !== snapshot.pace ||
    autonomy !== snapshot.autonomy ||
    mentorship !== snapshot.mentorship ||
    feel !== snapshot.feel ||
    ce !== snapshot.ce ||
    wlb !== snapshot.wlb ||
    !sameSet(populations, snapshot.populations);

  const togglePopulation = (value: string) =>
    setPopulations((cur) =>
      cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
    );

  const onSave = () => {
    if (!dirty) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await upsertPracticeProfile({
        practice_pace: pace,
        autonomy_level: autonomy,
        mentorship_offered: mentorship,
        practice_feel: feel,
        ce_support: ce,
        work_life_balance: wlb,
        patient_populations: populations,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSnapshot({ pace, autonomy, mentorship, feel, ce, wlb, populations });
      setSaved(true);
    });
  };

  return (
    <SectionShell
      eyebrow="PracticeFit"
      title="How your practice works"
      subtitle="This powers PracticeFit — it's matched against what candidates tell us they want in our assessment. Every field is optional, and a strong match here is one of the biggest reasons the right candidate picks you. Candidates never see these as a checklist; they only see where you line up."
    >
      <div className="space-y-6">
        <SelectRow
          label="Day-to-day pace"
          value={pace}
          options={PRACTICE_PACE_OPTIONS}
          disabled={!canEdit}
          onChange={setPace}
        />
        <SelectRow
          label="Autonomy your team has"
          value={autonomy}
          options={AUTONOMY_LEVEL_OPTIONS}
          disabled={!canEdit}
          onChange={setAutonomy}
        />
        <SelectRow
          label="Mentorship you offer"
          value={mentorship}
          options={MENTORSHIP_OPTIONS}
          disabled={!canEdit}
          onChange={setMentorship}
        />
        <SelectRow
          label="Practice feel"
          value={feel}
          options={PRACTICE_FEEL_OPTIONS}
          disabled={!canEdit}
          onChange={setFeel}
          help="Leave blank to let us estimate from your number of locations."
        />
        <ScaleRow
          label="CE & growth support"
          lowLabel="Minimal"
          highLabel="We invest heavily"
          value={ce}
          disabled={!canEdit}
          onChange={setCe}
        />
        <ScaleRow
          label="Work-life predictability"
          lowLabel="Fast-paced / variable"
          highLabel="Very predictable"
          value={wlb}
          disabled={!canEdit}
          onChange={setWlb}
        />
        <div>
          <label className="block text-sm font-semibold text-ink mb-1.5">
            Patient populations you serve
          </label>
          <p className="mb-2 text-[12px] text-slate-meta">
            Pick any that describe your patient base — we match these to the
            populations candidates tell us they most enjoy caring for.
          </p>
          <div className="flex flex-wrap gap-2">
            {PATIENT_POPULATION_OPTIONS.map((opt) => {
              const active = populations.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={!canEdit}
                  aria-pressed={active}
                  onClick={() => togglePopulation(opt.value)}
                  className={
                    "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-50 " +
                    (active
                      ? "border-heritage-deep bg-heritage-deep text-ivory"
                      : "border-[var(--rule)] text-slate-body hover:border-heritage-deep")
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        saving={pending}
        saved={saved}
        error={error}
        onSave={onSave}
        disabled={!canEdit}
        saveLabel="Save practice profile"
      />
    </SectionShell>
  );
}

function SelectRow({
  label,
  value,
  options,
  disabled,
  onChange,
  help,
}: {
  label: string;
  value: string | null;
  options: ReadonlyArray<{ value: string; label: string }>;
  disabled: boolean;
  onChange: (v: string | null) => void;
  help?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-ink mb-1.5">
        {label}
      </label>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value ? e.target.value : null)}
        className="w-full max-w-[520px] border border-[var(--rule)] bg-white px-3 py-2 text-[14px] text-ink focus:border-heritage focus:outline-none disabled:opacity-50"
      >
        <option value="">No preference / not set</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {help && <p className="mt-1 text-[12px] text-slate-meta">{help}</p>}
    </div>
  );
}

function ScaleRow({
  label,
  lowLabel,
  highLabel,
  value,
  disabled,
  onChange,
}: {
  label: string;
  lowLabel: string;
  highLabel: string;
  value: number | null;
  disabled: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-ink mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(active ? null : n)}
              aria-pressed={active}
              className={
                "h-9 w-9 border text-[13px] font-bold transition-colors disabled:opacity-50 " +
                (active
                  ? "border-heritage-deep bg-heritage-deep text-ivory"
                  : "border-[var(--rule)] bg-white text-slate-body hover:border-heritage-deep")
              }
            >
              {n}
            </button>
          );
        })}
        <span className="ml-2 text-[12px] text-slate-meta">
          {value == null ? "Not set" : value <= 2 ? lowLabel : value >= 4 ? highLabel : "In between"}
        </span>
      </div>
      <div className="mt-1 flex max-w-[260px] justify-between text-[11px] text-slate-meta">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

/* ───────── 1. Identity (slug edit) ───────── */

function IdentitySection({
  canEdit,
  initialName,
  initialSlug,
}: {
  canEdit: boolean;
  initialName: string;
  initialSlug: string;
}) {
  // ── DSO name (editable; owner/admin gated server-side) ──
  const [name, setName] = useState(initialName);
  const [nameSnapshot, setNameSnapshot] = useState(initialName);
  const [namePending, startNameTransition] = useTransition();
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const nameDirty = name.trim() !== nameSnapshot.trim();

  const onSaveName = () => {
    if (!nameDirty) return;
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (trimmed.length < 2) {
      setNameError("Enter your DSO's name (at least 2 characters).");
      return;
    }
    setNameError(null);
    setNameSaved(false);
    startNameTransition(async () => {
      const result = await updateDsoName({ name: trimmed });
      if (!result.ok) {
        setNameError(result.error);
        return;
      }
      setName(trimmed);
      setNameSnapshot(trimmed);
      setNameSaved(true);
    });
  };

  // ── Slug ──
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
      title="Name & public URL"
      subtitle="Your DSO's name shows on every candidate email, your careers page, and company listings. The URL slug is editable separately and old URLs keep redirecting forever."
    >
      <div className="space-y-5">
        <div>
          <label
            htmlFor="dso-name"
            className="mb-1.5 block text-[12px] font-semibold text-ink"
          >
            DSO name
          </label>
          <input
            id="dso-name"
            type="text"
            value={name}
            disabled={!canEdit}
            onChange={(e) => {
              setNameSaved(false);
              setNameError(null);
              setName(e.target.value);
            }}
            maxLength={100}
            className="w-full rounded border border-[var(--rule-strong)] bg-white px-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta"
          />
          <p className="mt-1.5 text-xs text-slate-meta">
            Fix typos or casing here — changes apply everywhere candidates see
            you. Doesn&apos;t change your URL slug below.
          </p>
          <div className="mt-3">
            <SaveBar
              dirty={nameDirty}
              saving={namePending}
              saved={nameSaved}
              error={nameError}
              onSave={onSaveName}
              saveLabel="Update name"
              disabled={!canEdit}
            />
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

/* ───────── 2. Company details (website + HQ + size) ───────── */

function CompanyDetailsSection({
  canEdit,
  initialWebsite,
  initialCity,
  initialState,
  initialCandidateReplyTo,
  initialPracticeCount,
}: {
  canEdit: boolean;
  initialWebsite: string | null;
  initialCity: string | null;
  initialState: string | null;
  initialCandidateReplyTo: string | null;
  initialPracticeCount: number | null;
}) {
  const [website, setWebsite] = useState(initialWebsite ?? "");
  const [city, setCity] = useState(initialCity ?? "");
  const [stateField, setStateField] = useState(initialState ?? "");
  const [candidateReplyTo, setCandidateReplyTo] = useState(
    initialCandidateReplyTo ?? ""
  );
  // Practice count is held as a string for clean typing; parsed on save.
  const [practiceCount, setPracticeCount] = useState(
    initialPracticeCount != null ? String(initialPracticeCount) : ""
  );
  const [snapshot, setSnapshot] = useState({
    website: initialWebsite ?? "",
    city: initialCity ?? "",
    state: initialState ?? "",
    candidateReplyTo: initialCandidateReplyTo ?? "",
    practiceCount: initialPracticeCount != null ? String(initialPracticeCount) : "",
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    website !== snapshot.website ||
    city !== snapshot.city ||
    stateField !== snapshot.state ||
    candidateReplyTo !== snapshot.candidateReplyTo ||
    practiceCount !== snapshot.practiceCount;

  const clearFlags = () => {
    setSaved(false);
    setError(null);
  };

  const onSave = () => {
    setError(null);
    setSaved(false);

    let parsedCount: number | null = null;
    const trimmedCount = practiceCount.trim();
    if (trimmedCount !== "") {
      const n = Number(trimmedCount);
      if (!Number.isInteger(n) || n < 0) {
        setError("Number of practices must be a whole number (0 or more).");
        return;
      }
      parsedCount = n;
    }

    startTransition(async () => {
      const result = await upsertCompanyDetails({
        website: website.trim() || null,
        headquarters_city: city.trim() || null,
        headquarters_state: stateField.trim() || null,
        candidate_reply_to_email: candidateReplyTo.trim() || null,
        practice_count: parsedCount,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The action normalizes the URL (adds https://) and coerces 0 → null,
      // so re-snapshot from what the user typed; a no-op diff is fine.
      setSnapshot({
        website,
        city,
        state: stateField,
        candidateReplyTo,
        practiceCount,
      });
      setSaved(true);
    });
  };

  return (
    <SectionShell
      eyebrow="02 — Company details"
      title="Website, headquarters, and size"
      subtitle="These show on your public profile's header — your website link, the city you're based in, and how many practices you run. All optional."
    >
      <div className="space-y-5">
        <div>
          <label
            htmlFor="dso-website"
            className="mb-1.5 block text-[12px] font-semibold text-ink"
          >
            Website
          </label>
          <input
            id="dso-website"
            type="text"
            value={website}
            disabled={!canEdit}
            onChange={(e) => {
              clearFlags();
              setWebsite(e.target.value);
            }}
            maxLength={PROFILE_LIMITS.WEBSITE_MAX}
            placeholder="yourdso.com"
            className="w-full rounded border border-[var(--rule-strong)] bg-white px-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta"
          />
          <p className="mt-1.5 text-xs text-slate-meta">
            We&apos;ll add <code className="font-mono">https://</code> for you if
            you leave it off.
          </p>
        </div>

        <div>
          <label
            htmlFor="dso-hq-city"
            className="mb-1.5 block text-[12px] font-semibold text-ink"
          >
            Headquarters city &amp; state
          </label>
          <LocationAutocompleteField
            id="dso-hq-city"
            defaultCity={city}
            defaultState={stateField}
            disabled={!canEdit}
            placeholder="e.g. Kansas City"
            onSelect={(c, s) => {
              clearFlags();
              setCity(c);
              setStateField(s);
            }}
          />
        </div>

        <div>
          <label
            htmlFor="dso-candidate-reply-to"
            className="mb-1.5 block text-[12px] font-semibold text-ink"
          >
            Candidate reply-to email
          </label>
          <input
            id="dso-candidate-reply-to"
            type="email"
            value={candidateReplyTo}
            disabled={!canEdit}
            onChange={(e) => {
              clearFlags();
              setCandidateReplyTo(e.target.value);
            }}
            maxLength={254}
            placeholder="e.g. careers@yourpractice.com"
            className="w-full rounded border border-[var(--rule-strong)] bg-white px-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta"
          />
          <p className="mt-1.5 text-[12px] text-slate-meta leading-relaxed">
            Where candidate replies to your automated emails land (application
            confirmations, stage updates, re-engagement). Leave blank to use the
            account owner&apos;s email.
          </p>
        </div>

        <div>
          <label
            htmlFor="dso-practice-count"
            className="mb-1.5 block text-[12px] font-semibold text-ink"
          >
            Number of practices
          </label>
          <input
            id="dso-practice-count"
            type="number"
            min={0}
            step={1}
            value={practiceCount}
            disabled={!canEdit}
            onChange={(e) => {
              clearFlags();
              setPracticeCount(e.target.value);
            }}
            placeholder="e.g. 12"
            className="w-40 rounded border border-[var(--rule-strong)] bg-white px-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta"
          />
          <p className="mt-1.5 text-xs text-slate-meta">
            Leave blank to hide. Shows as &ldquo;X practices&rdquo; on your
            profile.
          </p>
        </div>

        <SaveBar
          dirty={dirty}
          saving={pending}
          saved={saved}
          error={error}
          onSave={onSave}
          saveLabel="Save company details"
          disabled={!canEdit}
        />
      </div>
    </SectionShell>
  );
}

/* ───────── 3. About (mission + Tiptap description) ───────── */

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
      eyebrow="03 — About"
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

/* ───────── 4. Brand visuals (logo + banner) ───────── */

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
      eyebrow="04 — Brand visuals"
      title="Logo and banner"
      subtitle="Logo shows in the header of every email and the avatar slot across the platform. Banner is the full-width image on your public profile."
    >
      <div className="space-y-8">
        {/* Logo — small square preview */}
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-[12px] font-semibold text-ink">Logo</h3>
            <span className="text-[11px] text-slate-meta">
              Square · PNG, JPG, or WebP up to 5MB
            </span>
          </div>
          <ImageUpload
            value={logoUrl}
            pathPrefix="dso-logo"
            shape="square"
            outputFormat="image/png"
            hint="Transparent backgrounds welcome — recommend at least 400×400."
            buttonLabel={logoUrl ? "Change logo" : "Upload logo"}
            onUploaded={canEdit ? (u) => persistLogo(u) : () => {}}
            onRemove={canEdit ? () => persistLogo(null) : undefined}
          />
        </div>

        {/* Banner — full-width 3:1 hero */}
        <div className="border-t border-[var(--rule)] pt-6">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-[12px] font-semibold text-ink">Banner</h3>
            <span className="text-[11px] text-slate-meta">
              Wide 3:1 · JPG, PNG, or WebP up to 5MB
            </span>
          </div>
          <ImageUpload
            value={bannerUrl}
            pathPrefix="dso-banner"
            shape="banner"
            outputFormat="image/jpeg"
            hint="Recommend at least 1800×600. Avoid text near edges — narrow viewports crop horizontally."
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

/* ───────── 6. Why Join Us blocks ───────── */

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
      eyebrow="06 — Why join us"
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

/* ───────── 7. Culture chips + brand color ───────── */

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
      eyebrow="07 — Brand & culture"
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

/* ───────── 8. Contact CTA ───────── */

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
      eyebrow="08 — Contact CTA"
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
