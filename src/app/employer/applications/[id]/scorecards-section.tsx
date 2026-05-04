"use client";

/**
 * <ScorecardsSection> — multi-reviewer scorecard surface for one application.
 *
 * Lives on /employer/applications/[id], between the Internal Notes block and
 * the Comments thread. Three stacked sections:
 *
 *   1. Aggregate roll-up — only shown when at least one scorecard is submitted.
 *      Avg score per attribute (across submitted scorecards), reviewer count,
 *      recommendation tally.
 *   2. My scorecard — the current reviewer's draft or submitted card. Form
 *      collapsed by default if no draft exists; expanded with a CTA otherwise.
 *   3. Other reviewers' submitted scorecards — read-only summary tiles.
 *
 * Realtime: subscribes to public.application_scorecards filtered by
 * application_id. INSERT and UPDATE events reconcile against local state;
 * self-echoes are deduped by row id (the optimistic save already inserted
 * the row).
 *
 * Privacy: RLS already permits a DSO member to read every scorecard on the
 * application (so the aggregate roll-up can be computed across reviewers),
 * but the UI hides drafts that don't belong to the current reviewer. A
 * draft from another reviewer is private until they submit — Greenhouse /
 * Ashby pattern.
 */

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { Star, Trash2, Lock, Loader2, AlertCircle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  type RealtimePostgresInsertPayload,
  type RealtimePostgresUpdatePayload,
} from "@supabase/supabase-js";
import {
  RECOMMENDATION_LABELS,
  RECOMMENDATION_ORDER,
  RECOMMENDATION_COLORS,
  SCORE_LABELS,
  SCORE_VALUES,
  ATTRIBUTE_CATEGORY_LABELS,
  averageScore,
  parseAttributeScores,
  getRubricById,
  type ScorecardRubric,
  type ScorecardAttribute,
  type ScorecardAttributeCategory,
  type AttributeScoresMap,
  type OverallRecommendation,
} from "@/lib/scorecards/rubric-library";
import {
  upsertScorecardDraft,
  submitScorecard,
  deleteScorecardDraft,
  type ApplicationScorecardRow,
} from "./scorecard-actions";

/* ───────────────────────────────────────────────────────────────
 * Public types — what the server passes in
 * ───────────────────────────────────────────────────────────── */

export interface ScorecardReviewer {
  /** dso_users.id */
  id: string;
  /** auth.users.id — used to attribute realtime rows. */
  authUserId: string;
  fullName: string | null;
  role: "owner" | "admin" | "recruiter";
}

export interface InitialScorecard extends ApplicationScorecardRow {
  reviewer: ScorecardReviewer | null;
}

interface ScorecardsSectionProps {
  applicationId: string;
  /** auth.users.id of the viewer. */
  currentUserId: string;
  /** All teammates in the viewer's DSO — used to attribute scorecards. */
  dsoUsers: ScorecardReviewer[];
  /** Default rubric for the job's role_category. Used for new drafts. */
  rubric: ScorecardRubric;
  /** The current viewer's existing scorecard (draft or submitted), if any. */
  initialMyScorecard: InitialScorecard | null;
  /** Submitted scorecards from other reviewers. */
  initialOtherScorecards: InitialScorecard[];
}

/* ───────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

const ROLE_LABELS: Record<ScorecardReviewer["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  recruiter: "Recruiter",
};

interface ThreadScorecard extends ApplicationScorecardRow {
  reviewerName: string | null;
  reviewerRole: ScorecardReviewer["role"] | null;
}

function buildThreadScorecard(
  row: ApplicationScorecardRow,
  initialReviewer: ScorecardReviewer | null,
  dsoUsers: ScorecardReviewer[]
): ThreadScorecard {
  const matched = dsoUsers.find((u) => u.authUserId === row.reviewer_user_id);
  return {
    ...row,
    reviewerName:
      initialReviewer?.fullName ?? matched?.fullName ?? "Teammate",
    reviewerRole: initialReviewer?.role ?? matched?.role ?? null,
  };
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* ───────────────────────────────────────────────────────────────
 * Realtime row → ApplicationScorecardRow
 * ───────────────────────────────────────────────────────────── */

interface RawRealtimeRow {
  id: string;
  application_id: string;
  reviewer_user_id: string;
  reviewer_dso_user_id: string;
  rubric_id: string;
  attribute_scores: unknown;
  overall_recommendation: string | null;
  overall_note: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
}

function rawToScorecard(row: RawRealtimeRow): ApplicationScorecardRow {
  const status = row.status === "submitted" ? "submitted" : "draft";
  const recommendation =
    row.overall_recommendation &&
    (RECOMMENDATION_ORDER as string[]).includes(row.overall_recommendation)
      ? (row.overall_recommendation as OverallRecommendation)
      : null;
  return {
    id: row.id,
    application_id: row.application_id,
    reviewer_user_id: row.reviewer_user_id,
    reviewer_dso_user_id: row.reviewer_dso_user_id,
    rubric_id: row.rubric_id,
    attribute_scores: parseAttributeScores(row.attribute_scores),
    overall_recommendation: recommendation,
    overall_note: row.overall_note,
    status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    submitted_at: row.submitted_at,
  };
}

/* ───────────────────────────────────────────────────────────────
 * Aggregate roll-up
 * ───────────────────────────────────────────────────────────── */

interface AggregateAttributeRow {
  attribute: ScorecardAttribute;
  avg: number;
  count: number;
}

interface Aggregate {
  attributeRows: AggregateAttributeRow[];
  overallAvg: number | null;
  reviewerCount: number;
  recommendationCounts: Record<OverallRecommendation, number>;
}

function buildAggregate(
  rubric: ScorecardRubric,
  submitted: ThreadScorecard[]
): Aggregate {
  const recommendationCounts: Record<OverallRecommendation, number> = {
    strong_yes: 0,
    yes: 0,
    maybe: 0,
    no: 0,
    strong_no: 0,
  };
  for (const sc of submitted) {
    if (sc.overall_recommendation) {
      recommendationCounts[sc.overall_recommendation] += 1;
    }
  }

  const attributeRows: AggregateAttributeRow[] = rubric.attributes.map(
    (attr) => {
      const values: number[] = [];
      for (const sc of submitted) {
        const entry = sc.attribute_scores[attr.id];
        if (entry && Number.isFinite(entry.score)) values.push(entry.score);
      }
      const count = values.length;
      const avg = count
        ? values.reduce((a, b) => a + b, 0) / count
        : 0;
      return { attribute: attr, avg, count };
    }
  );

  const overallScores = submitted
    .map((sc) => averageScore(sc.attribute_scores))
    .filter((v): v is number => v !== null);
  const overallAvg = overallScores.length
    ? overallScores.reduce((a, b) => a + b, 0) / overallScores.length
    : null;

  return {
    attributeRows,
    overallAvg,
    reviewerCount: submitted.length,
    recommendationCounts,
  };
}

/* ───────────────────────────────────────────────────────────────
 * Component
 * ───────────────────────────────────────────────────────────── */

export function ScorecardsSection({
  applicationId,
  currentUserId,
  dsoUsers,
  rubric,
  initialMyScorecard,
  initialOtherScorecards,
}: ScorecardsSectionProps) {
  const [myScorecard, setMyScorecard] = useState<ThreadScorecard | null>(() =>
    initialMyScorecard
      ? buildThreadScorecard(
          initialMyScorecard,
          initialMyScorecard.reviewer,
          dsoUsers
        )
      : null
  );
  const [otherScorecards, setOtherScorecards] = useState<ThreadScorecard[]>(
    () =>
      initialOtherScorecards.map((sc) =>
        buildThreadScorecard(sc, sc.reviewer, dsoUsers)
      )
  );

  // Form state — backs the open editor when the reviewer is composing or
  // editing their draft. Mirrors `myScorecard` until the form is opened.
  const [editing, setEditing] = useState(false);
  const [formScores, setFormScores] = useState<AttributeScoresMap>(
    () => myScorecard?.attribute_scores ?? {}
  );
  const [formRecommendation, setFormRecommendation] =
    useState<OverallRecommendation | null>(
      myScorecard?.overall_recommendation ?? null
    );
  const [formOverallNote, setFormOverallNote] = useState<string>(
    myScorecard?.overall_note ?? ""
  );

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmittingFlag] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Realtime ── */
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`application_scorecards:${applicationId}`)
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT,
          schema: "public",
          table: "application_scorecards",
          filter: `application_id=eq.${applicationId}`,
        },
        (payload: RealtimePostgresInsertPayload<RawRealtimeRow>) => {
          const row = payload.new;
          if (!row?.id) return;
          const sc = rawToScorecard(row);
          // Mine — let optimistic state win; only fill in if we don't have it.
          if (sc.reviewer_user_id === currentUserId) {
            setMyScorecard((prev) =>
              prev && prev.id === sc.id
                ? prev
                : buildThreadScorecard(sc, null, dsoUsers)
            );
            return;
          }
          // Theirs — only show when submitted.
          if (sc.status !== "submitted") return;
          setOtherScorecards((current) => {
            if (current.some((c) => c.id === sc.id)) return current;
            const next = [
              ...current,
              buildThreadScorecard(sc, null, dsoUsers),
            ];
            next.sort(
              (a, b) =>
                new Date(b.submitted_at ?? b.updated_at).getTime() -
                new Date(a.submitted_at ?? a.updated_at).getTime()
            );
            return next;
          });
        }
      )
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.UPDATE,
          schema: "public",
          table: "application_scorecards",
          filter: `application_id=eq.${applicationId}`,
        },
        (payload: RealtimePostgresUpdatePayload<RawRealtimeRow>) => {
          const row = payload.new;
          if (!row?.id) return;
          const sc = rawToScorecard(row);

          if (sc.reviewer_user_id === currentUserId) {
            setMyScorecard((prev) =>
              prev
                ? buildThreadScorecard(
                    sc,
                    {
                      id: prev.reviewer_dso_user_id,
                      authUserId: prev.reviewer_user_id,
                      fullName: prev.reviewerName,
                      role: prev.reviewerRole ?? "recruiter",
                    },
                    dsoUsers
                  )
                : buildThreadScorecard(sc, null, dsoUsers)
            );
            return;
          }

          // Other reviewer's row updated — if it just transitioned to
          // submitted, surface it; if it was already in our list, refresh it;
          // if it's still a draft, drop it.
          setOtherScorecards((current) => {
            const without = current.filter((c) => c.id !== sc.id);
            if (sc.status !== "submitted") return without;
            const next = [...without, buildThreadScorecard(sc, null, dsoUsers)];
            next.sort(
              (a, b) =>
                new Date(b.submitted_at ?? b.updated_at).getTime() -
                new Date(a.submitted_at ?? a.updated_at).getTime()
            );
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applicationId, currentUserId, dsoUsers]);

  /* ── Aggregate + grouped rubric attributes ── */
  const submittedScorecards = useMemo<ThreadScorecard[]>(() => {
    const all: ThreadScorecard[] = [...otherScorecards];
    if (myScorecard?.status === "submitted") all.push(myScorecard);
    return all;
  }, [otherScorecards, myScorecard]);

  const aggregate = useMemo(
    () => buildAggregate(rubric, submittedScorecards),
    [rubric, submittedScorecards]
  );

  const groupedAttributes = useMemo(() => {
    const groups = new Map<ScorecardAttributeCategory, ScorecardAttribute[]>();
    for (const attr of rubric.attributes) {
      const list = groups.get(attr.category) ?? [];
      list.push(attr);
      groups.set(attr.category, list);
    }
    return Array.from(groups.entries());
  }, [rubric]);

  /* ── Form handlers ── */

  function openEditor(): void {
    setFormScores(myScorecard?.attribute_scores ?? {});
    setFormRecommendation(myScorecard?.overall_recommendation ?? null);
    setFormOverallNote(myScorecard?.overall_note ?? "");
    setError(null);
    setEditing(true);
  }

  function cancelEditor(): void {
    setEditing(false);
    setError(null);
    setConfirmingSubmit(false);
    setConfirmingDelete(false);
  }

  function setAttributeScore(attrId: string, score: number): void {
    setFormScores((prev) => {
      const next = { ...prev };
      const existing = next[attrId];
      next[attrId] = existing ? { ...existing, score } : { score };
      return next;
    });
  }

  function setAttributeNote(attrId: string, note: string): void {
    setFormScores((prev) => {
      const next = { ...prev };
      const existing = next[attrId];
      const trimmed = note;
      if (!existing) {
        // Don't store a note for an unscored attribute.
        return prev;
      }
      next[attrId] = { score: existing.score, note: trimmed };
      return next;
    });
  }

  async function handleSaveDraft(): Promise<void> {
    if (saving || submitting) return;
    setError(null);
    setSaving(true);
    const result = await upsertScorecardDraft({
      applicationId,
      rubricId: rubric.id,
      attributeScores: formScores,
      overallRecommendation: formRecommendation,
      overallNote: formOverallNote,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMyScorecard(buildThreadScorecard(result.scorecard, null, dsoUsers));
    setEditing(false);
  }

  async function handleSubmit(): Promise<void> {
    if (saving || submitting) return;
    if (Object.keys(formScores).length === 0) {
      setError("Score at least one attribute before submitting.");
      return;
    }
    if (!formRecommendation) {
      setError("Pick an overall recommendation before submitting.");
      return;
    }
    setError(null);
    setSubmittingFlag(true);

    // Save the latest draft first, then promote to submitted.
    const draftResult = await upsertScorecardDraft({
      applicationId,
      rubricId: rubric.id,
      attributeScores: formScores,
      overallRecommendation: formRecommendation,
      overallNote: formOverallNote,
    });
    if (!draftResult.ok) {
      setSubmittingFlag(false);
      setError(draftResult.error);
      return;
    }
    const submitResult = await submitScorecard(draftResult.scorecard.id);
    setSubmittingFlag(false);
    setConfirmingSubmit(false);
    if (!submitResult.ok) {
      setError(submitResult.error);
      // Still update local state so the saved draft is reflected.
      setMyScorecard(buildThreadScorecard(draftResult.scorecard, null, dsoUsers));
      return;
    }
    setMyScorecard(buildThreadScorecard(submitResult.scorecard, null, dsoUsers));
    setEditing(false);
  }

  async function handleDelete(): Promise<void> {
    if (!myScorecard || myScorecard.status !== "draft") return;
    if (saving || submitting) return;
    setError(null);
    const result = await deleteScorecardDraft(myScorecard.id);
    setConfirmingDelete(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMyScorecard(null);
    setEditing(false);
    setFormScores({});
    setFormRecommendation(null);
    setFormOverallNote("");
  }

  /* ── Render ── */

  const myStatus: "none" | "draft" | "submitted" = myScorecard
    ? myScorecard.status
    : "none";
  const formIsOpen = editing || myStatus === "none";

  return (
    <div className="space-y-8">
      {aggregate.reviewerCount > 0 && (
        <AggregatePanel rubric={rubric} aggregate={aggregate} />
      )}

      {/* My scorecard */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
              Your scorecard
            </h3>
            {myStatus === "submitted" && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
                <Lock className="h-3 w-3" />
                Submitted · locked
              </span>
            )}
            {myStatus === "draft" && (
              <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-amber-700">
                Draft · not yet submitted
              </span>
            )}
          </div>
          {myStatus === "submitted" && myScorecard?.submitted_at && (
            <span className="text-[11px] text-slate-meta">
              Submitted {relativeTime(myScorecard.submitted_at)}
            </span>
          )}
        </div>

        {myStatus === "none" && !editing && (
          <button
            type="button"
            onClick={openEditor}
            className="w-full px-5 py-4 border border-dashed border-[var(--rule-strong)] bg-cream text-ink text-[13px] font-semibold hover:bg-ivory transition-colors flex items-center justify-center gap-2"
          >
            <Star className="h-4 w-4 text-heritage-deep" />
            Score this candidate
          </button>
        )}

        {myStatus === "draft" && !editing && myScorecard && (
          <div className="border border-[var(--rule)] bg-white p-5">
            <ReadOnlyScorecard
              scorecard={myScorecard}
              rubric={rubric}
              showReviewer={false}
            />
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[var(--rule)]">
              <button
                type="button"
                onClick={openEditor}
                className="px-4 py-2 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
              >
                Continue editing
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body hover:text-red-700 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Discard draft
              </button>
            </div>
          </div>
        )}

        {myStatus === "submitted" && myScorecard && (
          <div className="border border-[var(--rule)] bg-white p-5">
            <ReadOnlyScorecard
              scorecard={myScorecard}
              rubric={rubric}
              showReviewer={false}
            />
          </div>
        )}

        {formIsOpen && (
          <ScorecardForm
            rubric={rubric}
            scores={formScores}
            recommendation={formRecommendation}
            overallNote={formOverallNote}
            onScoreChange={setAttributeScore}
            onAttributeNoteChange={setAttributeNote}
            onRecommendationChange={setFormRecommendation}
            onOverallNoteChange={(v) => setFormOverallNote(v)}
            onCancel={myScorecard ? cancelEditor : undefined}
            onSaveDraft={handleSaveDraft}
            onRequestSubmit={() => setConfirmingSubmit(true)}
            saving={saving}
            submitting={submitting}
            error={error}
            groupedAttributes={groupedAttributes}
          />
        )}
      </div>

      {/* Other reviewers */}
      {otherScorecards.length > 0 && (
        <div>
          <h3 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
            Other reviewers · {otherScorecards.length}
          </h3>
          <ul className="space-y-4">
            {otherScorecards.map((sc) => (
              <li
                key={sc.id}
                className="border border-[var(--rule)] bg-white p-5"
              >
                <ReadOnlyScorecard
                  scorecard={sc}
                  rubric={getRubricById(sc.rubric_id)}
                  showReviewer
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirmingSubmit && (
        <ConfirmDialog
          title="Submit this scorecard?"
          body="Once submitted, scores and notes are locked and visible to the rest of the hiring team. You won't be able to edit them."
          confirmLabel={submitting ? "Submitting…" : "Submit scorecard"}
          confirmDisabled={submitting}
          onConfirm={handleSubmit}
          onCancel={() => setConfirmingSubmit(false)}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Discard draft scorecard?"
          body="Your scores and notes will be deleted. This can't be undone."
          confirmLabel="Discard draft"
          confirmTone="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Aggregate roll-up panel
 * ───────────────────────────────────────────────────────────── */

function AggregatePanel({
  rubric,
  aggregate,
}: {
  rubric: ScorecardRubric;
  aggregate: Aggregate;
}) {
  const overall =
    aggregate.overallAvg !== null ? aggregate.overallAvg.toFixed(1) : "—";
  return (
    <div className="border border-[var(--rule-strong)] bg-cream p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div>
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
            Aggregate · {aggregate.reviewerCount}{" "}
            {aggregate.reviewerCount === 1 ? "reviewer" : "reviewers"}
          </div>
          <div className="flex items-baseline gap-2">
            <Star className="h-5 w-5 text-heritage-deep self-center" />
            <span className="text-3xl font-extrabold tracking-[-1px] text-ink tabular-nums">
              {overall}
            </span>
            <span className="text-[12px] text-slate-meta">/ 5.0</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RECOMMENDATION_ORDER.map((rec) => {
            const count = aggregate.recommendationCounts[rec];
            if (count === 0) return null;
            const c = RECOMMENDATION_COLORS[rec];
            return (
              <span
                key={rec}
                className={`text-[10px] font-bold tracking-[1.5px] uppercase px-2 py-1 ring-1 ring-inset ${c.bg} ${c.ring} ${c.text}`}
              >
                {count} {RECOMMENDATION_LABELS[rec]}
              </span>
            );
          })}
        </div>
      </div>
      <ul className="space-y-2.5">
        {aggregate.attributeRows.map((row) => (
          <li
            key={row.attribute.id}
            className="flex items-center gap-4 text-[12px]"
          >
            <span className="flex-1 min-w-0 text-ink leading-snug">
              {row.attribute.label}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-slate-meta tabular-nums w-10 text-right">
                {row.count > 0 ? row.avg.toFixed(1) : "—"}
              </span>
              <ScoreBar value={row.count > 0 ? row.avg : 0} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-slate-meta mt-4 pt-3 border-t border-[var(--rule)]">
        Rubric: {rubric.label}. Averages computed across submitted scorecards
        only — drafts are private to the reviewer until submitted.
      </p>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Score bar — small horizontal bar, 0-5 scaled
 * ───────────────────────────────────────────────────────────── */

function ScoreBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(5, value));
  const pct = (clamped / 5) * 100;
  return (
    <div
      className="h-1.5 w-24 bg-slate-100 overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="h-full bg-heritage"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Read-only scorecard tile (used for submitted-mine + other reviewers)
 * ───────────────────────────────────────────────────────────── */

function ReadOnlyScorecard({
  scorecard,
  rubric,
  showReviewer,
}: {
  scorecard: ThreadScorecard;
  rubric: ScorecardRubric;
  showReviewer: boolean;
}) {
  const overall = averageScore(scorecard.attribute_scores);
  const recommendation = scorecard.overall_recommendation;
  const recColor = recommendation ? RECOMMENDATION_COLORS[recommendation] : null;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div className="min-w-0">
          {showReviewer && (
            <div className="flex flex-wrap items-baseline gap-2 mb-1">
              <span className="text-[14px] font-bold text-ink truncate">
                {scorecard.reviewerName ?? "Teammate"}
              </span>
              {scorecard.reviewerRole && (
                <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
                  {ROLE_LABELS[scorecard.reviewerRole]}
                </span>
              )}
              {scorecard.submitted_at && (
                <span className="text-[11px] text-slate-meta">
                  Submitted {relativeTime(scorecard.submitted_at)}
                </span>
              )}
            </div>
          )}
          <div className="flex items-baseline gap-2">
            <Star className="h-4 w-4 text-heritage-deep self-center" />
            <span className="text-2xl font-extrabold tracking-[-0.6px] text-ink tabular-nums">
              {overall !== null ? overall.toFixed(1) : "—"}
            </span>
            <span className="text-[11px] text-slate-meta">/ 5.0</span>
          </div>
        </div>
        {recommendation && recColor && (
          <span
            className={`text-[10px] font-bold tracking-[1.5px] uppercase px-2.5 py-1.5 ring-1 ring-inset ${recColor.bg} ${recColor.ring} ${recColor.text}`}
          >
            {RECOMMENDATION_LABELS[recommendation]}
          </span>
        )}
      </div>

      <ul className="space-y-2.5">
        {rubric.attributes.map((attr) => {
          const entry = scorecard.attribute_scores[attr.id];
          return (
            <li
              key={attr.id}
              className="flex items-start gap-3 text-[12px]"
            >
              <div className="flex-1 min-w-0">
                <div className="text-ink leading-snug">{attr.label}</div>
                {entry?.note && (
                  <div className="text-[12px] text-slate-body mt-0.5 italic leading-snug whitespace-pre-wrap">
                    {entry.note}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-slate-meta tabular-nums w-6 text-right">
                  {entry ? entry.score : "—"}
                </span>
                <ScoreBar value={entry?.score ?? 0} />
              </div>
            </li>
          );
        })}
      </ul>

      {scorecard.overall_note && (
        <div className="mt-4 pt-4 border-t border-[var(--rule)]">
          <div className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta mb-1">
            Overall notes
          </div>
          <p className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap">
            {scorecard.overall_note}
          </p>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Editable form
 * ───────────────────────────────────────────────────────────── */

interface ScorecardFormProps {
  rubric: ScorecardRubric;
  scores: AttributeScoresMap;
  recommendation: OverallRecommendation | null;
  overallNote: string;
  onScoreChange: (attrId: string, score: number) => void;
  onAttributeNoteChange: (attrId: string, note: string) => void;
  onRecommendationChange: (rec: OverallRecommendation | null) => void;
  onOverallNoteChange: (next: string) => void;
  onCancel?: () => void;
  onSaveDraft: () => void;
  onRequestSubmit: () => void;
  saving: boolean;
  submitting: boolean;
  error: string | null;
  groupedAttributes: Array<[ScorecardAttributeCategory, ScorecardAttribute[]]>;
}

function ScorecardForm({
  rubric,
  scores,
  recommendation,
  overallNote,
  onScoreChange,
  onAttributeNoteChange,
  onRecommendationChange,
  onOverallNoteChange,
  onCancel,
  onSaveDraft,
  onRequestSubmit,
  saving,
  submitting,
  error,
  groupedAttributes,
}: ScorecardFormProps) {
  return (
    <div className="border border-[var(--rule-strong)] bg-white p-5 mt-4 space-y-6">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
          Rubric · {rubric.label}
        </div>
        <p className="text-[12px] text-slate-meta leading-snug">
          {rubric.description}
        </p>
      </div>

      <div className="space-y-6">
        {groupedAttributes.map(([category, attrs]) => (
          <fieldset key={category} className="space-y-4">
            <legend className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta mb-2">
              {ATTRIBUTE_CATEGORY_LABELS[category]}
            </legend>
            {attrs.map((attr) => {
              const entry = scores[attr.id];
              return (
                <AttributeRow
                  key={attr.id}
                  attribute={attr}
                  score={entry?.score ?? null}
                  note={entry?.note ?? ""}
                  onScoreChange={(s) => onScoreChange(attr.id, s)}
                  onNoteChange={(n) => onAttributeNoteChange(attr.id, n)}
                />
              );
            })}
          </fieldset>
        ))}
      </div>

      {/* Overall recommendation */}
      <div className="pt-5 border-t border-[var(--rule)]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          Overall recommendation
        </div>
        <div
          role="radiogroup"
          aria-label="Overall recommendation"
          className="flex flex-wrap gap-2 mb-4"
        >
          {RECOMMENDATION_ORDER.map((rec) => {
            const active = recommendation === rec;
            const c = RECOMMENDATION_COLORS[rec];
            return (
              <button
                key={rec}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onRecommendationChange(rec)}
                className={`text-[10px] font-bold tracking-[1.5px] uppercase px-3 py-2 ring-1 ring-inset transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2 ${
                  active
                    ? `${c.bg} ${c.ring} ${c.text}`
                    : "bg-white ring-[var(--rule-strong)] text-slate-body hover:bg-cream"
                }`}
              >
                {RECOMMENDATION_LABELS[rec]}
              </button>
            );
          })}
        </div>

        <label className="block">
          <span className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta mb-1.5 block">
            Overall notes
          </span>
          <textarea
            value={overallNote}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              onOverallNoteChange(e.target.value)
            }
            rows={3}
            placeholder="Anything else hiring should know — strengths, concerns, follow-ups."
            className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors leading-relaxed"
          />
        </label>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-[12px] text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[var(--rule)]">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={saving || submitting}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-ink text-[10px] font-bold tracking-[1.5px] uppercase ring-1 ring-inset ring-[var(--rule-strong)] hover:bg-cream transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Save Draft
        </button>
        <button
          type="button"
          onClick={onRequestSubmit}
          disabled={saving || submitting}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
          Submit Scorecard
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving || submitting}
            className="px-3 py-2.5 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body hover:text-ink transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        )}
        <span className="text-[11px] text-slate-meta">
          Drafts are private to you. Submitting locks scores and shares with
          the hiring team.
        </span>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Single attribute row (label + helper + 1-5 segmented + note)
 * ───────────────────────────────────────────────────────────── */

function AttributeRow({
  attribute,
  score,
  note,
  onScoreChange,
  onNoteChange,
}: {
  attribute: ScorecardAttribute;
  score: number | null;
  note: string;
  onScoreChange: (score: number) => void;
  onNoteChange: (note: string) => void;
}) {
  return (
    <div className="border border-[var(--rule)] bg-cream p-4">
      <div className="mb-2.5">
        <div className="text-[13px] font-bold text-ink leading-snug">
          {attribute.label}
        </div>
        <div className="text-[12px] text-slate-meta leading-snug mt-0.5">
          {attribute.description}
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label={`Score for ${attribute.label}`}
        className="inline-flex items-stretch gap-0 border border-[var(--rule-strong)] bg-white mb-2.5"
      >
        {SCORE_VALUES.map((value) => {
          const active = score === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${value} — ${SCORE_LABELS[value]}`}
              title={SCORE_LABELS[value]}
              onClick={() => onScoreChange(value)}
              className={`px-4 py-2 text-[12px] font-bold tabular-nums border-r last:border-r-0 border-[var(--rule)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-inset ${
                active
                  ? "bg-heritage text-ivory"
                  : "text-slate-body hover:bg-cream"
              }`}
            >
              {value}
            </button>
          );
        })}
      </div>
      {score !== null && (
        <div className="text-[11px] text-slate-meta mb-2">
          {SCORE_LABELS[score]}
        </div>
      )}

      {score !== null && (
        <input
          type="text"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          maxLength={1000}
          placeholder="Optional note for this attribute"
          className="w-full px-3 py-2 bg-white border border-[var(--rule)] text-ink text-[13px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        />
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Inline confirmation dialog (no Radix dependency — matches the
 * comments-thread pattern of using shadcn-styled native primitives).
 * ───────────────────────────────────────────────────────────── */

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  confirmDisabled = false,
  confirmTone = "primary",
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  confirmTone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scorecard-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-[var(--rule-strong)] shadow-xl max-w-md w-full p-6"
      >
        <h4
          id="scorecard-confirm-title"
          className="text-lg font-bold text-ink mb-2"
        >
          {title}
        </h4>
        <p className="text-[13px] text-slate-body leading-relaxed mb-5">
          {body}
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body hover:text-ink transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`px-5 py-2.5 text-[10px] font-bold tracking-[1.5px] uppercase transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
              confirmTone === "danger"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-ink text-ivory hover:bg-ink-soft"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
