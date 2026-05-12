"use server";

/**
 * Interview scheduling server actions (E3.16 / Phase 5A Day 1).
 *
 *   proposeInterview        — employer creates proposal + N option rows
 *   cancelInterviewProposal — employer cancels before booking
 *   bookInterviewSlot       — candidate (or DSO on their behalf) picks one
 *   cancelInterviewBooking  — either party reschedules
 *
 * Side effects:
 *   - email to candidate on propose (InterviewProposed)
 *   - email to candidate + every DSO admin on book (InterviewBooked)
 *   - audit log emitters via recordAuditEvent
 *
 * Day 2/3 layer on top: calendar push, reminder cron, reschedule UI.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { dispatchInboxSystemMessage } from "@/lib/inbox/dispatch-system";
import { recordAuditEvent } from "@/lib/audit/record";
import { InterviewProposed } from "@/emails/candidate/InterviewProposed";
import { InterviewBooked } from "@/emails/InterviewBooked";
import {
  getConnection,
  type CalendarProvider,
} from "@/lib/integrations/connections";
import {
  pushInterviewEvent,
  deleteInterviewEvent,
} from "@/lib/integrations/calendar-push";

export interface InterviewActionResult {
  ok: boolean;
  error?: string;
  proposalId?: string;
  bookingId?: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

const KIND_LABELS: Record<string, string> = {
  phone: "Phone call",
  video: "Video call",
  in_person: "In-person",
  other: "Other",
};

interface ProposeInterviewInput {
  applicationId: string;
  interviewKind: "phone" | "video" | "in_person" | "other";
  durationMinutes: number;
  locationText: string | null;
  messageToCandidate: string | null;
  /** ISO timestamps for proposed start times. */
  proposedStarts: string[];
}

export async function proposeInterview(
  input: ProposeInterviewInput
): Promise<InterviewActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  if (!input.applicationId) return { ok: false, error: "Missing application." };
  if (
    !input.proposedStarts ||
    input.proposedStarts.length === 0 ||
    input.proposedStarts.length > 6
  ) {
    return {
      ok: false,
      error: "Pick between 1 and 6 candidate time options.",
    };
  }
  if (input.durationMinutes < 5 || input.durationMinutes > 480) {
    return { ok: false, error: "Duration must be between 5 and 480 minutes." };
  }

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, full_name, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO context." };

  // Read the application context for the emails + audit.
  const { data: appRow } = await supabase
    .from("applications")
    .select(
      "id, job_id, candidate_id, jobs(title), candidates(full_name, auth_user_id)"
    )
    .eq("id", input.applicationId)
    .maybeSingle();
  if (!appRow) return { ok: false, error: "Application not found." };
  const appCtx = appRow as unknown as {
    id: string;
    job_id: string;
    candidate_id: string;
    jobs: Array<{ title: string }>;
    candidates: Array<{ full_name: string | null; auth_user_id: string | null }>;
  };
  const jobTitle = appCtx.jobs?.[0]?.title ?? "the role";
  const candidate = appCtx.candidates?.[0];

  // Insert proposal.
  const { data: proposal, error: pErr } = await supabase
    .from("interview_proposals")
    .insert({
      application_id: input.applicationId,
      proposed_by: dsoUser.id as string,
      interview_kind: input.interviewKind,
      duration_minutes: input.durationMinutes,
      location_text: input.locationText || null,
      message_to_candidate: input.messageToCandidate || null,
    })
    .select("id")
    .single();
  if (pErr || !proposal) {
    return {
      ok: false,
      error: pErr?.message ?? "Couldn't save the proposal.",
    };
  }

  // Insert options.
  const optionRows = input.proposedStarts.map((iso, i) => ({
    proposal_id: proposal.id as string,
    start_at: iso,
    sort_order: i,
  }));
  const { error: oErr } = await supabase
    .from("interview_proposal_options")
    .insert(optionRows);
  if (oErr) {
    // Roll back the proposal so we don't orphan it.
    await supabase
      .from("interview_proposals")
      .delete()
      .eq("id", proposal.id as string);
    return { ok: false, error: oErr.message };
  }

  // Email candidate.
  const candAuth = candidate?.auth_user_id ?? null;
  let candidateEmail: string | null = null;
  if (candAuth) {
    const admin = createSupabaseServiceRoleClient();
    const res = await admin.auth.admin.getUserById(candAuth);
    candidateEmail = res.data?.user?.email ?? null;
  }
  const dsoName = await dsoNameForAppId(supabase, input.applicationId);

  if (candidateEmail) {
    void sendEmail({
      to: candidateEmail,
      subject: `Pick an interview time · ${jobTitle}`,
      template: "candidate.interview_proposed",
      replyTo: "info@dsohire.com",
      relatedDsoId: dsoUser.dso_id as string,
      relatedCandidateId: appCtx.candidate_id,
      react: InterviewProposed({
        candidateFirstName:
          candidate?.full_name?.split(/\s+/)[0] ?? null,
        dsoName,
        jobTitle,
        kindLabel: KIND_LABELS[input.interviewKind] ?? "Interview",
        durationMinutes: input.durationMinutes,
        message: input.messageToCandidate,
        locationText: input.locationText,
        proposedStartsIso: input.proposedStarts,
        pickUrl: `${SITE_URL}/candidate/applications/${input.applicationId}`,
      }),
    });
  }

  // Drop a system message into the candidate's inbox thread so the
  // proposal shows up there too, not just in their email. Fire-and-
  // forget — never block the propose flow on a dispatch failure.
  void dispatchInboxSystemMessage({
    applicationId: input.applicationId,
    eventKind: "interview_proposed",
    senderRole: "employer",
    body: `${dsoName} proposed ${input.proposedStarts.length} interview time${input.proposedStarts.length === 1 ? "" : "s"} for ${jobTitle}. Pick the one that works.`,
  });

  await recordAuditEvent({
    dsoId: dsoUser.dso_id as string,
    actorUserId: user.id,
    actorDsoUserId: dsoUser.id as string,
    actorName: (dsoUser.full_name as string | null) ?? null,
    actorRole: (dsoUser.role as string | null) ?? null,
    eventKind: "interview.proposed",
    targetTable: "applications",
    targetId: input.applicationId,
    summary: `Proposed ${input.proposedStarts.length} interview time${input.proposedStarts.length === 1 ? "" : "s"} for ${
      candidate?.full_name ?? "the candidate"
    } (${jobTitle})`,
    metadata: {
      application_id: input.applicationId,
      proposal_id: proposal.id,
      proposed_starts: input.proposedStarts,
      interview_kind: input.interviewKind,
      duration_minutes: input.durationMinutes,
    },
  });

  revalidatePath(`/employer/applications/${input.applicationId}`);
  revalidatePath(`/candidate/applications/${input.applicationId}`);
  return { ok: true, proposalId: proposal.id as string };
}

export async function cancelInterviewProposal(
  proposalId: string,
  reason: string | null
): Promise<InterviewActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: prior } = await supabase
    .from("interview_proposals")
    .select("id, application_id, status")
    .eq("id", proposalId)
    .maybeSingle();
  if (!prior) return { ok: false, error: "Proposal not found." };

  const { error } = await supabase
    .from("interview_proposals")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason || null,
    })
    .eq("id", proposalId);
  if (error) return { ok: false, error: error.message };

  const dsoId = await dsoIdForAppId(supabase, prior.application_id as string);
  if (dsoId) {
    await recordAuditEvent({
      dsoId,
      actorUserId: user.id,
      eventKind: "interview.cancelled",
      targetTable: "applications",
      targetId: prior.application_id as string,
      summary: `Cancelled the interview proposal${reason ? ` — ${reason.slice(0, 80)}` : ""}`,
      metadata: { proposal_id: proposalId, reason },
    });
  }

  revalidatePath(`/employer/applications/${prior.application_id}`);
  revalidatePath(`/candidate/applications/${prior.application_id}`);
  return { ok: true, proposalId };
}

interface BookInterviewInput {
  proposalId: string;
  optionId: string;
  candidateNotes: string | null;
}

export async function bookInterviewSlot(
  input: BookInterviewInput
): Promise<InterviewActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Insert booking. The DB unique(proposal_id) constraint blocks dupes.
  const { data: booking, error: bErr } = await supabase
    .from("interview_bookings")
    .insert({
      proposal_id: input.proposalId,
      selected_option_id: input.optionId,
      candidate_notes: input.candidateNotes || null,
    })
    .select("id")
    .single();
  if (bErr || !booking) {
    if (bErr?.code === "23505") {
      return {
        ok: false,
        error: "This proposal already has a booked time.",
      };
    }
    return { ok: false, error: bErr?.message ?? "Couldn't book the slot." };
  }

  // Flip proposal status. Use service-role: when a CANDIDATE calls
  // this action, the RLS-gated client can INSERT a booking row (allowed
  // by "Interview bookings: candidate or recruiter insert") but the
  // ONLY update policy on interview_proposals is "recruiter write" —
  // candidates can't flip status under their own RLS, so the update
  // silently fails. Same pattern as candidate withdraw → service-role
  // bypass with app-layer scope check (ownership of the booking row we
  // just successfully inserted is sufficient gate).
  const admin = createSupabaseServiceRoleClient();
  await admin
    .from("interview_proposals")
    .update({ status: "booked" })
    .eq("id", input.proposalId);

  // Fetch context for emails + audit.
  const { data: proposal } = await supabase
    .from("interview_proposals")
    .select(
      "id, application_id, interview_kind, duration_minutes, location_text, message_to_candidate, applications(jobs(title, dso_id), candidates(full_name, auth_user_id))"
    )
    .eq("id", input.proposalId)
    .maybeSingle();

  const { data: option } = await supabase
    .from("interview_proposal_options")
    .select("start_at")
    .eq("id", input.optionId)
    .maybeSingle();

  if (proposal && option) {
    const propCtx = proposal as unknown as {
      application_id: string;
      interview_kind: string;
      duration_minutes: number;
      location_text: string | null;
      applications: Array<{
        jobs: Array<{ title: string; dso_id: string }>;
        candidates: Array<{ full_name: string | null; auth_user_id: string | null }>;
      }>;
    };
    const app = propCtx.applications?.[0];
    const job = app?.jobs?.[0];
    const cand = app?.candidates?.[0];
    const dsoId = job?.dso_id ?? null;
    const jobTitle = job?.title ?? "the role";
    const dsoName = dsoId ? await dsoNameById(supabase, dsoId) : "the DSO";

    // Email candidate
    if (cand?.auth_user_id) {
      const admin = createSupabaseServiceRoleClient();
      const r = await admin.auth.admin.getUserById(cand.auth_user_id);
      const candEmail = r.data?.user?.email ?? null;
      if (candEmail) {
        void sendEmail({
          to: candEmail,
          subject: `Interview booked · ${jobTitle}`,
          template: "shared.interview_booked",
          relatedDsoId: dsoId,
          react: InterviewBooked({
            recipientName: cand.full_name?.split(/\s+/)[0] ?? null,
            audience: "candidate",
            dsoName,
            jobTitle,
            startAtIso: option.start_at as string,
            durationMinutes: propCtx.duration_minutes,
            kindLabel: KIND_LABELS[propCtx.interview_kind] ?? "Interview",
            locationText: propCtx.location_text,
            detailUrl: `${SITE_URL}/candidate/applications/${propCtx.application_id}`,
          }),
        });
      }
    }

    // Email DSO members
    if (dsoId) {
      const admin = createSupabaseServiceRoleClient();
      const { data: members } = await admin
        .from("dso_users")
        .select("auth_user_id, full_name, role")
        .eq("dso_id", dsoId)
        .in("role", ["owner", "admin", "recruiter", "hiring_manager"]);
      for (const m of (members ?? []) as Array<{
        auth_user_id: string;
        full_name: string | null;
        role: string;
      }>) {
        try {
          const r = await admin.auth.admin.getUserById(m.auth_user_id);
          const email = r.data?.user?.email ?? null;
          if (!email) continue;
          void sendEmail({
            to: email,
            subject: `Interview booked · ${
              cand?.full_name ?? "candidate"
            } · ${jobTitle}`,
            template: "shared.interview_booked",
            relatedDsoId: dsoId,
            react: InterviewBooked({
              recipientName: m.full_name?.split(/\s+/)[0] ?? null,
              audience: "employer",
              dsoName,
              jobTitle,
              candidateName: cand?.full_name ?? null,
              startAtIso: option.start_at as string,
              durationMinutes: propCtx.duration_minutes,
              kindLabel: KIND_LABELS[propCtx.interview_kind] ?? "Interview",
              locationText: propCtx.location_text,
              detailUrl: `${SITE_URL}/employer/applications/${propCtx.application_id}`,
            }),
          });
        } catch (err) {
          console.warn("[interview-book] notify member failed", err);
        }
      }
    }

    if (dsoId) {
      await recordAuditEvent({
        dsoId,
        actorUserId: user.id,
        eventKind: "interview.booked",
        targetTable: "applications",
        targetId: propCtx.application_id,
        summary: `${cand?.full_name ?? "Candidate"} booked the interview for ${jobTitle}`,
        metadata: {
          proposal_id: input.proposalId,
          option_id: input.optionId,
          start_at: option.start_at,
        },
      });

      // Drop a system message into the inbox thread — candidate-side
      // "speaking" (senderRole='candidate') so the employer's inbox
      // shows the booking confirmation as an incoming event.
      const slotIso = option.start_at as string;
      void dispatchInboxSystemMessage({
        applicationId: propCtx.application_id,
        eventKind: "interview_booked",
        senderRole: "candidate",
        body: `Interview confirmed for ${new Date(slotIso).toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })}.`,
      });
    }

    // Day 2: push to connected calendars (best-effort, never fail the
    // booking on push errors). Pushes happen sequentially because each
    // call involves a refresh-token round-trip + an API write.
    await pushCalendarsForBooking({
      bookingId: booking.id as string,
      proposalId: input.proposalId,
      startAtIso: option.start_at as string,
      durationMinutes: propCtx.duration_minutes,
      interviewKind: propCtx.interview_kind,
      jobTitle,
      dsoName,
      locationText: propCtx.location_text,
      candidateAuthUserId: cand?.auth_user_id ?? null,
      candidateName: cand?.full_name ?? null,
      applicationId: propCtx.application_id,
    });

    revalidatePath(`/employer/applications/${propCtx.application_id}`);
    revalidatePath(`/candidate/applications/${propCtx.application_id}`);
  }

  return { ok: true, bookingId: booking.id as string };
}

export async function cancelInterviewBooking(
  bookingId: string,
  reason: string | null
): Promise<InterviewActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Snapshot for audit + path revalidation before delete.
  const { data: booking } = await supabase
    .from("interview_bookings")
    .select(
      "id, proposal_id, interview_proposals(application_id, jobs!inner(dso_id))"
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { ok: false, error: "Booking not found." };

  // Best-effort: delete pushed calendar events BEFORE we delete the
  // booking row. The interview_calendar_events rows have ON DELETE
  // CASCADE on booking_id, so once the booking is gone the lookup
  // returns nothing and the provider event stays orphaned on the user's
  // calendar. Doing this first preserves the breadcrumb.
  await cancelCalendarsForBooking(bookingId);

  // Delete booking; flip proposal back to pending so another slot can
  // be picked (or the proposal can be cancelled outright).
  const { error } = await supabase
    .from("interview_bookings")
    .delete()
    .eq("id", bookingId);
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("interview_proposals")
    .update({ status: "pending" })
    .eq("id", booking.proposal_id as string);

  const bCtx = booking as unknown as {
    proposal_id: string;
    interview_proposals: Array<{
      application_id: string;
      jobs?: Array<{ dso_id: string }>;
    }>;
  };
  const appId = bCtx.interview_proposals?.[0]?.application_id ?? null;
  const dsoId =
    bCtx.interview_proposals?.[0]?.jobs?.[0]?.dso_id ??
    (appId ? await dsoIdForAppId(supabase, appId) : null);

  if (dsoId && appId) {
    await recordAuditEvent({
      dsoId,
      actorUserId: user.id,
      eventKind: "interview.booking_cancelled",
      targetTable: "applications",
      targetId: appId,
      summary: `Interview booking cancelled${reason ? ` — ${reason.slice(0, 80)}` : ""}`,
      metadata: { booking_id: bookingId, reason },
    });
  }

  if (appId) {
    revalidatePath(`/employer/applications/${appId}`);
    revalidatePath(`/candidate/applications/${appId}`);
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function dsoIdForAppId(
  supabase: SupabaseClient,
  applicationId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("applications")
    .select("jobs(dso_id)")
    .eq("id", applicationId)
    .maybeSingle();
  const joined = data as unknown as {
    jobs?: Array<{ dso_id: string }>;
  } | null;
  return joined?.jobs?.[0]?.dso_id ?? null;
}

async function dsoNameForAppId(
  supabase: SupabaseClient,
  applicationId: string
): Promise<string> {
  const dsoId = await dsoIdForAppId(supabase, applicationId);
  if (!dsoId) return "the DSO";
  return dsoNameById(supabase, dsoId);
}

async function dsoNameById(
  supabase: SupabaseClient,
  dsoId: string
): Promise<string> {
  const { data } = await supabase
    .from("dsos")
    .select("name")
    .eq("id", dsoId)
    .maybeSingle();
  return (data?.name as string | undefined) ?? "the DSO";
}

// ─────────────────────────────────────────────────────────────
// Calendar push (Day 2)
// ─────────────────────────────────────────────────────────────

interface PushCalendarsInput {
  bookingId: string;
  proposalId: string;
  startAtIso: string;
  durationMinutes: number;
  interviewKind: string;
  jobTitle: string;
  dsoName: string;
  locationText: string | null;
  candidateAuthUserId: string | null;
  candidateName: string | null;
  applicationId: string;
}

/**
 * Mirror the booked interview onto every connected calendar — candidate's
 * (if they connected one) and the proposing interviewer's (if they did).
 * Each provider connection per user gets its own push. Pushes are
 * best-effort: a failure logs a warning but does NOT roll back the
 * booking. The InterviewBooked email is the durable notification; the
 * calendar mirror is convenience layered on top.
 *
 * We push to the user who proposed the interview rather than every DSO
 * team member because (a) the proposer is the most likely interviewer,
 * and (b) flooding 5 team members' calendars with the same event is
 * spammy. Future enhancement: a "calendar invitees" field on the
 * interview_proposals row that lets the proposer pick additional
 * interviewers to mirror to.
 */
async function pushCalendarsForBooking(input: PushCalendarsInput): Promise<void> {
  try {
    const admin = createSupabaseServiceRoleClient();

    const startAt = new Date(input.startAtIso);
    const endAt = new Date(
      startAt.getTime() + input.durationMinutes * 60 * 1000
    );
    const kindLabel = KIND_LABELS[input.interviewKind] ?? "Interview";
    const siteUrl = SITE_URL;

    // Candidate-side push.
    if (input.candidateAuthUserId) {
      const summary = `${kindLabel} · ${input.jobTitle} · ${input.dsoName}`;
      const description = [
        `${kindLabel} with ${input.dsoName} · ${input.jobTitle}`,
        input.locationText ? `Location: ${input.locationText}` : null,
        `Booked via DSO Hire.`,
        `${siteUrl}/candidate/applications/${input.applicationId}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      await pushForUser({
        authUserId: input.candidateAuthUserId,
        bookingId: input.bookingId,
        startAt,
        endAt,
        summary,
        description,
        locationText: input.locationText,
      });
    }

    // Employer (proposer) side push.
    const { data: proposerLink } = await admin
      .from("interview_proposals")
      .select("proposed_by")
      .eq("id", input.proposalId)
      .maybeSingle();

    const proposerDsoUserId =
      (proposerLink as { proposed_by?: string } | null)?.proposed_by ?? null;
    if (proposerDsoUserId) {
      const { data: proposerRow } = await admin
        .from("dso_users")
        .select("auth_user_id")
        .eq("id", proposerDsoUserId)
        .maybeSingle();
      const proposerAuthId =
        (proposerRow as { auth_user_id?: string } | null)?.auth_user_id ??
        null;

      if (proposerAuthId) {
        const summary = `${kindLabel} · ${
          input.candidateName ?? "Candidate"
        } · ${input.jobTitle}`;
        const description = [
          `${kindLabel} with ${
            input.candidateName ?? "the candidate"
          } · ${input.jobTitle}`,
          input.locationText ? `Location: ${input.locationText}` : null,
          `Booked via DSO Hire.`,
          `${siteUrl}/employer/applications/${input.applicationId}`,
        ]
          .filter(Boolean)
          .join("\n\n");

        await pushForUser({
          authUserId: proposerAuthId,
          bookingId: input.bookingId,
          startAt,
          endAt,
          summary,
          description,
          locationText: input.locationText,
        });
      }
    }
  } catch (err) {
    // Belt-and-suspenders: any unexpected throw should not propagate out
    // of the booking flow. Log + move on.
    console.warn("[interview-book] calendar push wrapper error", err);
  }
}

interface PushForUserInput {
  authUserId: string;
  bookingId: string;
  startAt: Date;
  endAt: Date;
  summary: string;
  description: string;
  locationText: string | null;
}

/**
 * Mirror cancellation back to every calendar that received a pushed
 * event for this booking. Reads from interview_calendar_events directly
 * because the booking's proposer/candidate user mapping isn't enough on
 * its own — only the rows in interview_calendar_events know which
 * provider events actually got persisted (some pushes may have failed
 * on the original booking).
 *
 * Best-effort throughout. The booking deletion is the authoritative
 * cancel; this is convenience layered on top.
 */
async function cancelCalendarsForBooking(bookingId: string): Promise<void> {
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data: events } = await admin
      .from("interview_calendar_events")
      .select("auth_user_id, provider")
      .eq("booking_id", bookingId);

    const rows = (events ?? []) as Array<{
      auth_user_id: string;
      provider: CalendarProvider;
    }>;
    for (const row of rows) {
      try {
        await deleteInterviewEvent({
          authUserId: row.auth_user_id,
          provider: row.provider,
          bookingId,
        });
      } catch (err) {
        console.warn("[interview-cancel] calendar delete failed", {
          bookingId,
          provider: row.provider,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.warn("[interview-cancel] calendar wrapper error", err);
  }
}

/**
 * For a single user, push the event to whichever calendar provider(s)
 * they have connected. Most users will have at most one — but the loop
 * handles a Google-AND-Microsoft user gracefully (uncommon but possible).
 */
async function pushForUser(input: PushForUserInput): Promise<void> {
  const providers: CalendarProvider[] = ["google", "microsoft"];
  for (const provider of providers) {
    try {
      const conn = await getConnection(input.authUserId, provider);
      if (!conn) continue;
      const result = await pushInterviewEvent({
        authUserId: input.authUserId,
        provider,
        bookingId: input.bookingId,
        startAt: input.startAt,
        endAt: input.endAt,
        summary: input.summary,
        description: input.description,
        attendees: [],
        locationText: input.locationText,
      });
      if (!result.ok) {
        console.warn("[interview-book] calendar push failed", {
          provider,
          bookingId: input.bookingId,
          error: result.error,
        });
      }
    } catch (err) {
      console.warn("[interview-book] calendar push threw", {
        provider,
        bookingId: input.bookingId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
