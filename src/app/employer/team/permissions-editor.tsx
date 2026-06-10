"use client";

/**
 * #83 Phase 3 — per-teammate permission editor (Growth+).
 *
 * "Permissions" control on each non-owner team row (owner/admin viewers
 * only). Opens a dialog listing CAPABILITY_META grouped by section with a
 * toggle per capability, pre-filled from the teammate's EFFECTIVE
 * permissions (role preset + overrides). Saving sends the desired
 * effective map to saveTeammatePermissions, which stores the minimal
 * diff vs the preset + audit-logs the change.
 *
 * - Non-grantable caps for the target role are hidden entirely
 *   (isCapabilityGrantable) — e.g. billing/team/EEO for recruiter/HM.
 * - Toggles the VIEWER doesn't hold themselves are locked (you can't
 *   grant what you don't have; server re-rejects).
 * - Below Growth the dialog is read-only with an upgrade nudge — Solo
 *   teams run the role presets as-is.
 *
 * Imports only the PURE capability model — no server/site-shell deps in
 * this "use client" file (hard rule).
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { SlidersHorizontal, X, Check, Lock, RotateCcw } from "lucide-react";
import {
  CAPABILITY_META,
  ROLE_DEFAULTS,
  effectivePermissions,
  isCapabilityGrantable,
  type Capability,
  type DsoRole,
} from "@/lib/permissions/capabilities";
import { saveTeammatePermissions } from "./permission-actions";

const GROUP_ORDER = ["Jobs", "Pipeline", "Offers", "Sensitive", "Admin"] as const;

const ROLE_LABEL: Record<DsoRole, string> = {
  owner: "Owner",
  admin: "Admin",
  recruiter: "Recruiter",
  hiring_manager: "Hiring Manager",
};

interface PermissionsEditorButtonProps {
  targetDsoUserId: string;
  targetName: string;
  targetRole: DsoRole;
  /** Parsed permission_overrides (plain serializable object). */
  overrides: Partial<Record<Capability, boolean>>;
  /** Growth+ — false renders the read-only preset view + upgrade nudge. */
  editable: boolean;
  /** The VIEWER's effective permissions — locks grants they can't make. */
  viewerPerms: Record<Capability, boolean>;
}

export function PermissionsEditorButton({
  targetDsoUserId,
  targetName,
  targetRole,
  overrides,
  editable,
  viewerPerms,
}: PermissionsEditorButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const preset = ROLE_DEFAULTS[targetRole];
  const initialEffective = useMemo(
    () => effectivePermissions(targetRole, overrides),
    [targetRole, overrides]
  );
  const [values, setValues] = useState<Record<Capability, boolean>>(
    initialEffective
  );

  // Re-seed when reopening so Cancel + reopen drops stale toggles.
  useEffect(() => {
    if (open) {
      setValues(initialEffective);
      setError(null);
    }
  }, [open, initialEffective]);

  // Body scroll lock + Esc (mirrors HmRescopeButton).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const grantable = useMemo(
    () => CAPABILITY_META.filter((m) => isCapabilityGrantable(m.key, targetRole)),
    [targetRole]
  );
  const groups = GROUP_ORDER.map((g) => ({
    group: g,
    items: grantable.filter((m) => m.group === g),
  })).filter((g) => g.items.length > 0);

  const customCount = grantable.filter(
    (m) => values[m.key] !== preset[m.key]
  ).length;
  const dirty = grantable.some((m) => values[m.key] !== initialEffective[m.key]);

  const toggle = (cap: Capability) =>
    setValues((prev) => ({ ...prev, [cap]: !prev[cap] }));
  const resetToPreset = () => setValues({ ...preset });

  const onSave = () => {
    setError(null);
    const desired: Record<string, boolean> = {};
    for (const m of grantable) desired[m.key] = values[m.key];
    startTransition(async () => {
      const res = await saveTeammatePermissions({
        targetDsoUserId,
        desired,
      });
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:bg-cream transition-colors whitespace-nowrap"
        aria-label={`Edit permissions for ${targetName}`}
      >
        <SlidersHorizontal className="h-3 w-3" />
        Permissions
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="perm-editor-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-ivory border border-[var(--rule-strong)] w-full max-w-[620px] max-h-[85vh] overflow-y-auto">
            <header className="sticky top-0 z-10 bg-ivory border-b border-[var(--rule)] px-6 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
                  Permissions · {ROLE_LABEL[targetRole]} preset
                </div>
                <h2
                  id="perm-editor-title"
                  className="text-lg font-extrabold tracking-[-0.3px] text-ink"
                >
                  {targetName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 text-slate-meta hover:text-ink hover:bg-cream transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="px-6 py-5">
              {!editable && (
                <div className="mb-5 px-4 py-3 bg-cream border border-[var(--rule-strong)]">
                  <div className="text-[12px] font-bold tracking-[1.5px] uppercase text-heritage-deep mb-1">
                    Upgrade to customize permissions
                  </div>
                  <p className="text-[13px] text-slate-body leading-relaxed">
                    On your current plan teammates use their role&apos;s
                    standard permissions, shown below. Per-teammate
                    fine-tuning — like hiding pay fields or granting direct
                    offer-send — is available on Growth and above.
                  </p>
                </div>
              )}

              <p className="text-[14px] text-slate-body leading-relaxed mb-5">
                {editable
                  ? `Tune exactly what ${targetName.split(" ")[0]} can do. Toggles that differ from the ${ROLE_LABEL[targetRole]} preset are marked Custom; every change is recorded in your audit log.`
                  : `What ${targetName.split(" ")[0]} can do as a ${ROLE_LABEL[targetRole]}.`}
              </p>

              {groups.map(({ group, items }) => (
                <section key={group} className="mb-5">
                  <h3 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
                    {group}
                  </h3>
                  <div className="grid grid-cols-1 gap-px bg-[var(--rule)] border border-[var(--rule)]">
                    {items.map((m) => {
                      const on = values[m.key];
                      const isCustom = on !== preset[m.key];
                      // Lock turning ON a cap the viewer doesn't hold.
                      const lockedGrant =
                        editable && !on && !viewerPerms[m.key];
                      const disabled = !editable || pending || lockedGrant;
                      return (
                        <label
                          key={m.key}
                          className={`flex items-start gap-3 p-3 transition-colors ${
                            disabled
                              ? "bg-white opacity-70 cursor-not-allowed"
                              : "cursor-pointer " +
                                (on ? "bg-cream" : "bg-white hover:bg-cream/60")
                          }`}
                          title={
                            lockedGrant
                              ? "You can't grant a permission your own account doesn't have."
                              : undefined
                          }
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-heritage flex-shrink-0"
                            checked={on}
                            disabled={disabled}
                            onChange={() => toggle(m.key)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[14px] font-semibold text-ink">
                                {m.label}
                              </span>
                              {isCustom && (
                                <span className="inline-flex items-center px-1.5 py-0.5 bg-heritage-light border border-heritage text-[9px] font-bold tracking-[1px] uppercase text-ink">
                                  Custom
                                </span>
                              )}
                              {lockedGrant && (
                                <Lock className="h-3 w-3 text-slate-meta" />
                              )}
                            </div>
                            {m.help && (
                              <div className="text-[12px] text-slate-meta leading-snug mt-0.5">
                                {m.help}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}

              {error && (
                <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 text-[13px] text-red-900">
                  {error}
                </div>
              )}
            </div>

            <footer className="sticky bottom-0 bg-ivory border-t border-[var(--rule)] px-6 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {editable && customCount > 0 && (
                  <button
                    type="button"
                    onClick={resetToPreset}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body hover:text-ink transition-colors disabled:opacity-40"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset to {ROLE_LABEL[targetRole]} defaults
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-ink hover:bg-cream transition-colors disabled:opacity-40"
                >
                  {editable ? "Cancel" : "Close"}
                </button>
                {editable && (
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={pending || !dirty}
                    className="inline-flex items-center gap-1.5 px-5 py-2 bg-ink text-ivory text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-50"
                  >
                    {pending ? (
                      "Saving…"
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Save permissions
                      </>
                    )}
                  </button>
                )}
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
