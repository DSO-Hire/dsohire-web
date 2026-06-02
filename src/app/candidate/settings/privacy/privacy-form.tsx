"use client";

/**
 * Privacy & Visibility tab UI (Phase 4.3.d).
 *
 * Five sub-sections, each writes to its own server action so a save in
 * one section doesn't require submitting the rest:
 *   1. Profile visibility (3-state radio + resume + contact toggles)
 *   2. Hide from current employer (master toggle bulk-flips work history)
 *   3. Block list (DSO typeahead + chip list, capped 100)
 *   4. Practice Fit consent (3-state)
 *   5. View-as-DSO link + Data sharing summary (informational)
 *
 * All copy is privacy-positive — never implies the candidate has done
 * something wrong by being open. Defaults skew safe.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  X,
  Search,
  AlertCircle,
  Sparkles,
  Save,
  ExternalLink,
} from "lucide-react";
import {
  updateVisibility,
  setHideFromCurrentEmployer,
  updatePracticeFitConsent,
  addBlockedEmployer,
  removeBlockedEmployer,
  searchDsosForBlock,
  type BlockedEmployer,
  type DsoSearchResult,
  type VisibilityInput,
} from "./actions";
import { CV_VISIBILITY_OPTIONS } from "@/lib/candidate/canonical-lists";

// ─────────────────────────────────────────────────────────────────────
// Static config
// ─────────────────────────────────────────────────────────────────────

const RESUME_VISIBILITY_OPTIONS: ReadonlyArray<{
  value: VisibilityInput["resume_visibility"];
  label: string;
  description: string;
}> = [
  {
    value: "after_apply",
    label: "After I apply (recommended)",
    description: "Employers see your resume only on jobs you've applied to.",
  },
  {
    value: "verified_dso_only",
    label: "DSO Hire employer members",
    description: "Any signed-in DSO Hire employer member can download your resume.",
  },
  {
    value: "public",
    label: "Public",
    description:
      "Anyone with a link to your profile can download your resume. Not recommended for working hygienists.",
  },
  {
    value: "hidden",
    label: "Hidden",
    description: "Resume only sent when you explicitly attach it to an application.",
  },
];

const CONTACT_VISIBILITY_OPTIONS: ReadonlyArray<{
  value: VisibilityInput["contact_info_visibility"];
  label: string;
  description: string;
}> = [
  {
    value: "after_apply",
    label: "After I apply (recommended)",
    description: "Email + phone shown only to DSOs you've applied to.",
  },
  {
    value: "always",
    label: "Always",
    description:
      "Email + phone visible to any DSO Hire employer member who finds your profile.",
  },
];

const PRACTICE_FIT_OPTIONS: ReadonlyArray<{
  value: "off" | "results_only" | "full";
  label: string;
  description: string;
}> = [
  {
    value: "off",
    label: "Off (default)",
    description: "Don't compute a Practice Fit score for me.",
  },
  {
    value: "results_only",
    label: "Results only",
    description:
      "Compute a fit score, but only show it on the jobs I apply to — no public score on my profile.",
  },
  {
    value: "full",
    label: "Full",
    description:
      "Compute + display my Practice Fit score on my profile so DSOs can find me by fit.",
  },
];

// ─────────────────────────────────────────────────────────────────────
// Form
// ─────────────────────────────────────────────────────────────────────

export interface PrivacyFormProps {
  initial: {
    cv_visibility: VisibilityInput["cv_visibility"];
    resume_visibility: VisibilityInput["resume_visibility"];
    contact_info_visibility: VisibilityInput["contact_info_visibility"];
    practice_fit_consent: "off" | "results_only" | "full";
    has_current_employer: boolean;
    hide_from_current_employer: boolean;
  };
  blocked: BlockedEmployer[];
}

export function PrivacyForm({ initial, blocked }: PrivacyFormProps) {
  return (
    <div className="space-y-6">
      <ProfileVisibilitySection initial={initial} />
      <CurrentEmployerSection
        hasCurrent={initial.has_current_employer}
        initialEnabled={initial.hide_from_current_employer}
      />
      <BlockListSection blocked={blocked} />
      <PracticeFitSection initial={initial.practice_fit_consent} />
      <ViewAsDsoCard />
      <DataSharingCard />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 1 — Profile visibility (CV + resume + contact)
// ─────────────────────────────────────────────────────────────────────

function ProfileVisibilitySection({
  initial,
}: {
  initial: PrivacyFormProps["initial"];
}) {
  const [cvVisibility, setCvVisibility] = useState(initial.cv_visibility);
  const [resumeVisibility, setResumeVisibility] = useState(
    initial.resume_visibility
  );
  const [contactVisibility, setContactVisibility] = useState(
    initial.contact_info_visibility
  );
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const dirty =
    cvVisibility !== initial.cv_visibility ||
    resumeVisibility !== initial.resume_visibility ||
    contactVisibility !== initial.contact_info_visibility;

  const onSave = () => {
    setError(null);
    setSavedFlash(null);
    setSaving(true);
    startSaving(async () => {
      const result = await updateVisibility({
        cv_visibility: cvVisibility,
        resume_visibility: resumeVisibility,
        contact_info_visibility: contactVisibility,
      });
      setSaving(false);
      if (!result.ok) return setError(result.error);
      setSavedFlash("Saved.");
      window.setTimeout(() => setSavedFlash(null), 2500);
    });
  };

  return (
    <SectionCard
      icon={<Eye className="size-5 text-[#4D7A60]" />}
      title="Profile visibility"
      description="Three independent toggles — your profile, your resume, and your contact info."
    >
      <RadioGroup
        legend="Profile status"
        value={cvVisibility}
        onChange={setCvVisibility}
        options={CV_VISIBILITY_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
          description: o.description,
        }))}
      />
      <RadioGroup
        legend="Resume visibility"
        value={resumeVisibility}
        onChange={setResumeVisibility}
        options={RESUME_VISIBILITY_OPTIONS}
      />
      <RadioGroup
        legend="Contact info visibility"
        value={contactVisibility}
        onChange={setContactVisibility}
        options={CONTACT_VISIBILITY_OPTIONS}
      />
      <SaveBar
        dirty={dirty}
        saving={saving}
        error={error}
        savedFlash={savedFlash}
        onSave={onSave}
      />
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 2 — Hide from current employer
// ─────────────────────────────────────────────────────────────────────

function CurrentEmployerSection({
  hasCurrent,
  initialEnabled,
}: {
  hasCurrent: boolean;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const onToggle = (next: boolean) => {
    setError(null);
    setSavedFlash(null);
    setSaving(true);
    startSaving(async () => {
      const result = await setHideFromCurrentEmployer(next);
      setSaving(false);
      if (!result.ok) return setError(result.error);
      setEnabled(next);
      setSavedFlash(next ? "Hidden from current employer." : "No longer hiding.");
      window.setTimeout(() => setSavedFlash(null), 2500);
    });
  };

  return (
    <SectionCard
      icon={<EyeOff className="size-5 text-[#4D7A60]" />}
      title="Hide from current employer"
      description={
        hasCurrent
          ? "We auto-block any DSO listed as a current employer on your work history. Toggle this off if you're comfortable having them see your profile."
          : "Mark a work-history entry as 'I currently work here' to enable this. Until then, there's nothing to hide from."
      }
    >
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={!hasCurrent || saving}
          className="mt-0.5 size-4 rounded border-slate-300"
        />
        <span className="flex-1 text-sm">
          <span className="block font-medium text-[#14233F]">
            Hide my profile from my current employer
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {hasCurrent
              ? "Recommended. Working hygienists tell us this is the #1 reason they hesitate to sign up."
              : "Add a current role on your profile first."}
          </span>
        </span>
      </label>
      {error && <InlineError message={error} />}
      {savedFlash && <InlineFlash message={savedFlash} />}
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 3 — Block list
// ─────────────────────────────────────────────────────────────────────

function BlockListSection({ blocked }: { blocked: BlockedEmployer[] }) {
  const [items, setItems] = useState<BlockedEmployer[]>(blocked);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DsoSearchResult[]>([]);
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = (next: string) => {
    setQuery(next);
    if (next.trim().length < 2) {
      setResults([]);
      return;
    }
    startWork(async () => {
      const r = await searchDsosForBlock(next);
      if (r.ok) setResults(r.results);
    });
  };

  const onAdd = (dso: DsoSearchResult) => {
    setError(null);
    if (items.some((i) => i.dso_id === dso.id)) {
      setQuery("");
      setResults([]);
      return;
    }
    setBusy(true);
    startWork(async () => {
      const r = await addBlockedEmployer(dso.id);
      setBusy(false);
      if (!r.ok) return setError(r.error);
      // Optimistic insertion — server doesn't return the new row, so we
      // synthesize from the search result.
      setItems((prev) => [
        ...prev,
        {
          id: `pending-${dso.id}`,
          dso_id: dso.id,
          dso_name: dso.name,
          dso_slug: dso.slug,
          reason_optional: null,
          created_at: new Date().toISOString(),
        },
      ]);
      setQuery("");
      setResults([]);
    });
  };

  const onRemove = (id: string) => {
    setError(null);
    setBusy(true);
    startWork(async () => {
      const r = await removeBlockedEmployer(id);
      setBusy(false);
      if (!r.ok) return setError(r.error);
      setItems((prev) => prev.filter((i) => i.id !== id));
    });
  };

  return (
    <SectionCard
      icon={<Lock className="size-5 text-[#4D7A60]" />}
      title={`Blocked DSOs${items.length > 0 ? ` (${items.length})` : ""}`}
      description="DSOs you don't want to surface to or be surfaced by. Up to 100. Practice-level only at launch — corporate-parent rollup ships in a follow-up."
    >
      <div className="relative">
        <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-within:border-[#4D7A60] focus-within:ring-1 focus-within:ring-[#4D7A60]">
          <Search className="size-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Search a DSO by name…"
            className="flex-1 outline-none placeholder:text-slate-400"
            disabled={items.length >= 100}
          />
        </div>
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl">
            <ul className="max-h-64">
              {results.map((dso) => (
                <li key={dso.id}>
                  <button
                    type="button"
                    onClick={() => onAdd(dso)}
                    disabled={busy}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[#F7F4ED] disabled:opacity-50"
                  >
                    <span>
                      <span className="block font-medium text-[#14233F]">
                        {dso.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {[
                          dso.headquarters_city,
                          dso.headquarters_state,
                        ]
                          .filter(Boolean)
                          .join(", ") || "Location not set"}
                        {dso.practice_count
                          ? ` · ${dso.practice_count} practices`
                          : ""}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-[#4D7A60]">
                      Block
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm italic text-slate-500">
          No DSOs blocked yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-800">
                {item.dso_name}
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  disabled={busy || item.id.startsWith("pending-")}
                  className="text-slate-500 hover:text-red-700 disabled:opacity-30"
                  aria-label={`Remove ${item.dso_name} from block list`}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {items.length >= 100 && (
        <p className="mt-3 text-xs text-amber-700">
          Block list is at the 100-DSO cap. Remove one to add another.
        </p>
      )}
      {error && <InlineError message={error} />}
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 4 — Practice Fit consent
// ─────────────────────────────────────────────────────────────────────

function PracticeFitSection({
  initial,
}: {
  initial: "off" | "results_only" | "full";
}) {
  const [consent, setConsent] = useState(initial);
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const dirty = consent !== initial;

  const onSave = () => {
    setError(null);
    setSavedFlash(null);
    setSaving(true);
    startSaving(async () => {
      const result = await updatePracticeFitConsent(consent);
      setSaving(false);
      if (!result.ok) return setError(result.error);
      setSavedFlash("Saved.");
      window.setTimeout(() => setSavedFlash(null), 2500);
    });
  };

  return (
    <SectionCard
      icon={<ShieldCheck className="size-5 text-[#4D7A60]" />}
      title="Practice Fit consent"
      description="Practice Fit is our proprietary matching algorithm — it scores how well you fit each role on must-haves and preferences. Off by default; turn it on so DSOs can find you by fit."
    >
      <RadioGroup
        legend="Compute and display"
        value={consent}
        onChange={setConsent}
        options={PRACTICE_FIT_OPTIONS}
      />
      <SaveBar
        dirty={dirty}
        saving={saving}
        error={error}
        savedFlash={savedFlash}
        onSave={onSave}
      />
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 5 — View-as-DSO + Data sharing
// ─────────────────────────────────────────────────────────────────────

function ViewAsDsoCard() {
  return (
    <SectionCard
      icon={<Eye className="size-5 text-[#4D7A60]" />}
      title="View as a DSO"
      description="See exactly what an employer sees before they get any of your contact info or full name."
    >
      <Link
        href="/candidate/profile?as=dso"
        className="inline-flex items-center gap-2 rounded-md border border-[#4D7A60]/40 bg-[#F7F4ED] px-4 py-2 text-sm font-medium text-[#14233F] hover:border-[#4D7A60]"
      >
        <ExternalLink className="size-4 text-[#4D7A60]" />
        Open my profile in DSO view
      </Link>
      <p className="mt-2 text-xs text-slate-500">
        Coming soon — preview rendering ships in a follow-up. The link is
        live so you can bookmark it now.
      </p>
    </SectionCard>
  );
}

function DataSharingCard() {
  return (
    <section className="border border-[#4D7A60]/30 bg-[#F7F4ED] p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#4D7A60]" />
        <div>
          <h2 className="font-display text-base font-bold text-[#14233F]">
            What we share — and what we don&apos;t
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>
              <strong>We never sell candidate data.</strong> Not to data
              brokers, not to staffing agencies, not to anyone outside the
              DSOs you choose to interact with.
            </li>
            <li>
              We never collect Social Security numbers, dates of birth, or
              DEA registration. Even if your resume contains them, our
              parser ignores them.
            </li>
            <li>
              DSO Hire employer members can find your profile per your
              visibility settings above. Unauthenticated visitors and
              search engines never see your name + contact unless you
              explicitly publish a public profile.
            </li>
            <li>
              You can download a copy of your data or delete your account
              from the{" "}
              <Link
                href="/candidate/settings/data"
                className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
              >
                Data &amp; Account
              </Link>{" "}
              tab at any time.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--rule)] bg-white p-6 sm:p-8">
      <header className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#4D7A60]/10">
          {icon}
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-[#14233F]">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">{description}</p>
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function RadioGroup<T extends string>({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string;
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{
    value: T;
    label: string;
    description: string;
  }>;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-800">
        {legend}
      </legend>
      <div className="space-y-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`block cursor-pointer rounded-md border p-3 text-sm transition ${
              value === opt.value
                ? "border-[#4D7A60] bg-[#4D7A60]/10"
                : "border-slate-300 bg-white hover:border-slate-400"
            }`}
          >
            <input
              type="radio"
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <span className="block font-medium text-[#14233F]">
              {opt.label}
            </span>
            <span className="mt-0.5 block text-xs text-slate-600">
              {opt.description}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SaveBar({
  dirty,
  saving,
  error,
  savedFlash,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  savedFlash: string | null;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 pt-4">
      <div className="text-xs">
        {error ? (
          <span className="inline-flex items-center gap-1 text-red-700">
            <AlertCircle className="size-3.5" /> {error}
          </span>
        ) : savedFlash ? (
          <span className="inline-flex items-center gap-1 text-[#4D7A60]">
            <Sparkles className="size-3.5" /> {savedFlash}
          </span>
        ) : dirty ? (
          <span className="text-slate-600">Unsaved changes</span>
        ) : (
          <span className="text-slate-400">Saved.</span>
        )}
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || saving}
        className="inline-flex items-center gap-1.5 rounded-md bg-[#14233F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0d172b] disabled:opacity-50"
      >
        {saving ? "Saving…" : (
          <>
            <Save className="size-3.5" /> Save
          </>
        )}
      </button>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-red-700">
      <AlertCircle className="mr-1 inline size-3.5" />
      {message}
    </p>
  );
}

function InlineFlash({ message }: { message: string }) {
  return (
    <p role="status" className="text-xs text-[#4D7A60]">
      <Sparkles className="mr-1 inline size-3" />
      {message}
    </p>
  );
}
