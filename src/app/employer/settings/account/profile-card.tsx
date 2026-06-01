"use client";

/**
 * <ProfileCard> — the signed-in teammate's own identity editor on the
 * Account settings tab (2026-06-01).
 *
 * Two independent save paths, matching the candidate-profile convention:
 *   • Photo  — instant save via setMyAvatarUrl on upload/remove (no button).
 *   • Fields — first/last name, job title, pronouns, phone, About bio.
 *              Saved together via updateMyProfile behind a Save button.
 *
 * Email is shown read-only: it's the sign-in identity, not a casual edit.
 *
 * "Title" here is the human job title (e.g. "Director of Talent
 * Acquisition") shown to coworkers — deliberately distinct from the
 * system permission role (Owner/Admin/Recruiter/Hiring Manager) so a
 * hiring manager at a local office can tell who they're talking to.
 */

import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { ImageUpload } from "@/components/image-upload/image-upload";
import { updateMyProfile, setMyAvatarUrl } from "./actions";

interface LocationOption {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

interface ProfileCardProps {
  email: string;
  locations: LocationOption[];
  initial: {
    firstName: string;
    lastName: string;
    title: string;
    pronouns: string;
    phone: string;
    bio: string;
    avatarUrl: string | null;
    workBase: string;
    baseLocationId: string;
    coverageArea: string;
  };
}

export function ProfileCard({ email, locations, initial }: ProfileCardProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [title, setTitle] = useState(initial.title);
  const [pronouns, setPronouns] = useState(initial.pronouns);
  const [phone, setPhone] = useState(initial.phone);
  const [bio, setBio] = useState(initial.bio);
  const [workBase, setWorkBase] = useState(initial.workBase);
  const [baseLocationId, setBaseLocationId] = useState(initial.baseLocationId);
  const [coverageArea, setCoverageArea] = useState(initial.coverageArea);

  const [saving, startSaving] = useTransition();
  const [savingPhoto, startSavingPhoto] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const displayName = `${firstName} ${lastName}`.trim() || email;

  const persistAvatar = (next: string | null) => {
    startSavingPhoto(async () => {
      const result = await setMyAvatarUrl(next);
      if (result.ok) {
        setAvatarUrl(next);
        setFlash(next ? "Photo saved." : "Photo removed.");
        setTimeout(() => setFlash(null), 2500);
      } else {
        setError(result.error ?? "Couldn't save the photo.");
      }
    });
  };

  const onSave = () => {
    setError(null);
    startSaving(async () => {
      const result = await updateMyProfile({
        firstName,
        lastName,
        title,
        pronouns,
        phone,
        bio,
        workBase,
        baseLocationId,
        coverageArea,
      });
      if (result.ok) {
        setFlash("Profile saved.");
        setTimeout(() => setFlash(null), 2500);
      } else {
        setError(result.error ?? "Couldn't save your profile.");
      }
    });
  };

  const labelCls =
    "block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body mb-1.5";
  const inputCls =
    "w-full text-[14px] px-3 py-2 bg-white border border-[var(--rule-strong)] text-ink focus:outline-none focus:border-heritage";

  return (
    <section className="border border-[var(--rule)] bg-white p-7 sm:p-8">
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
        Your profile
      </div>
      <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-2">
        How you appear to your team
      </h2>
      <p className="text-[14px] text-slate-body leading-relaxed mb-6 max-w-[560px]">
        Your name, photo, and title show up wherever you appear to teammates —
        the team roster, application activity, and chat. A clear title and
        headshot help colleagues at other locations know who you are.
      </p>

      {/* Photo */}
      <div className="mb-7">
        <div className={labelCls}>Profile photo</div>
        <div className="flex items-start gap-5">
          <Avatar
            name={displayName}
            imageUrl={avatarUrl}
            size="xl"
            className="shrink-0 ring-1 ring-[var(--rule)]"
          />
          <div className="flex-1 min-w-0">
            <ImageUpload
              value={avatarUrl}
              pathPrefix="avatar"
              shape="circle"
              outputFormat="image/jpeg"
              hint="A headshot makes you recognizable to your team. JPG, PNG, or WebP up to 5MB."
              onUploaded={(publicUrl) => persistAvatar(publicUrl)}
              onRemove={() => persistAvatar(null)}
            />
            {savingPhoto && (
              <p className="mt-1 text-xs text-slate-meta">Saving photo…</p>
            )}
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label htmlFor="pf-first" className={labelCls}>
            First name
          </label>
          <input
            id="pf-first"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputCls}
            autoComplete="given-name"
          />
        </div>
        <div>
          <label htmlFor="pf-last" className={labelCls}>
            Last name
          </label>
          <input
            id="pf-last"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputCls}
            autoComplete="family-name"
          />
        </div>
      </div>

      {/* Title + pronouns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label htmlFor="pf-title" className={labelCls}>
            Job title
          </label>
          <input
            id="pf-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Director of Talent Acquisition"
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-slate-meta">
            Your human title — separate from your permission level.
          </p>
        </div>
        <div>
          <label htmlFor="pf-pronouns" className={labelCls}>
            Pronouns <span className="font-normal normal-case tracking-normal text-slate-meta">(optional)</span>
          </label>
          <input
            id="pf-pronouns"
            type="text"
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
            placeholder="e.g. she/her"
            className={inputCls}
          />
        </div>
      </div>

      {/* Works out of */}
      <div className="mb-4">
        <label htmlFor="pf-workbase" className={labelCls}>
          Works out of <span className="font-normal normal-case tracking-normal text-slate-meta">(optional)</span>
        </label>
        <select
          id="pf-workbase"
          value={workBase}
          onChange={(e) => setWorkBase(e.target.value)}
          className={inputCls}
        >
          <option value="">Not specified</option>
          <option value="corporate">Corporate / central office</option>
          <option value="practice">Based at a specific practice</option>
          <option value="regional">Regional — covers multiple sites</option>
        </select>

        {workBase === "practice" && (
          <div className="mt-3">
            <label htmlFor="pf-baseloc" className={labelCls}>
              Which practice?
            </label>
            {locations.length === 0 ? (
              <p className="text-[13px] text-slate-meta">
                No locations on file yet. Add practices under Locations first.
              </p>
            ) : (
              <select
                id="pf-baseloc"
                value={baseLocationId}
                onChange={(e) => setBaseLocationId(e.target.value)}
                className={inputCls}
              >
                <option value="">Select a practice…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.city || l.state
                      ? ` · ${[l.city, l.state].filter(Boolean).join(", ")}`
                      : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {workBase === "regional" && (
          <div className="mt-3">
            <label htmlFor="pf-coverage" className={labelCls}>
              Territory you cover
            </label>
            <input
              id="pf-coverage"
              type="text"
              value={coverageArea}
              onChange={(e) => setCoverageArea(e.target.value)}
              placeholder="e.g. Kansas City Metro — 6 offices"
              className={inputCls}
              maxLength={200}
            />
          </div>
        )}
      </div>

      {/* Phone + email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label htmlFor="pf-phone" className={labelCls}>
            Phone <span className="font-normal normal-case tracking-normal text-slate-meta">(optional)</span>
          </label>
          <input
            id="pf-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. (555) 123-4567"
            className={inputCls}
            autoComplete="tel"
          />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <div className="w-full text-[14px] px-3 py-2 bg-cream/60 border border-[var(--rule)] text-slate-body truncate">
            {email}
          </div>
          <p className="mt-1 text-[11px] text-slate-meta">
            This is your sign-in email and can&apos;t be changed here.
          </p>
        </div>
      </div>

      {/* Bio */}
      <div className="mb-6">
        <label htmlFor="pf-bio" className={labelCls}>
          About <span className="font-normal normal-case tracking-normal text-slate-meta">(optional)</span>
        </label>
        <textarea
          id="pf-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="A sentence or two so teammates know who you are and what you do."
          className={inputCls + " resize-y"}
        />
        <p className="mt-1 text-[11px] text-slate-meta">{bio.length}/600</p>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink text-ivory text-[13px] font-bold tracking-[1px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
        {flash && (
          <span role="status" className="text-[13px] font-medium text-heritage-deep">
            {flash}
          </span>
        )}
      </div>
    </section>
  );
}
