/**
 * Calendar push/update/delete helpers.
 *
 * Single front door for the interview-booking flow to mirror an event
 * into the booker's calendar (Google Calendar or Microsoft Graph
 * `/me/events`). Each function:
 *   1. Resolves a valid access token via `getValidAccessToken` (which
 *      transparently refreshes if needed). When no connection exists,
 *      returns `{ ok: false, error: "..." }` rather than throwing —
 *      calendar push is a best-effort side effect, not a hard
 *      prerequisite for the booking itself.
 *   2. POSTs/PATCHes/DELETEs the provider event.
 *   3. Persists the (booking_id, auth_user_id, provider, provider_event_id)
 *      mapping into `interview_calendar_events` so a later reschedule
 *      or cancellation can update/delete the same provider event.
 *
 * The push function also requests an auto-generated Google Meet (via
 * `conferenceData.createRequest`) or Teams meeting (via
 * `isOnlineMeeting: true`) link in the same call. We surface the join
 * URL on the response and persist it, then the interview-booked email
 * + reminder UI can render a clickable join link without re-fetching
 * from the provider.
 *
 * Error policy:
 *   pushInterviewEvent / updateInterviewEvent return a discriminated
 *   union (`{ ok: true, ... } | { ok: false, error }`) so the calling
 *   server action can surface a banner like "Booking confirmed —
 *   calendar push failed, try the Settings → Integrations reconnect
 *   button" without aborting the booking.
 *
 *   deleteInterviewEvent swallows not-found errors (HTTP 404, 410) and
 *   logs the rest because cancellation paths should not get stuck on a
 *   user who already deleted the event from their own calendar.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  getValidAccessToken,
  type CalendarProvider,
} from "@/lib/integrations/connections";

export interface CalendarAttendee {
  email: string;
  /** Falls back to the email's local part when omitted. */
  name?: string;
}

export interface PushInterviewEventInput {
  authUserId: string;
  provider: CalendarProvider;
  bookingId: string;
  /** Absolute start time (UTC). */
  startAt: Date;
  /** Absolute end time (UTC). */
  endAt: Date;
  summary: string;
  description: string;
  attendees: CalendarAttendee[];
  /** Optional physical/zoom-text location (Microsoft "displayName"). */
  locationText?: string | null;
  /**
   * When provided, the event is created with the time zone we render
   * times in for the user. Defaults to UTC; we always send UTC starts
   * regardless so the provider stores the absolute moment correctly.
   */
  timeZone?: string;
}

export type PushInterviewEventResult =
  | { ok: true; providerEventId: string; meetingUrl: string | null }
  | { ok: false; error: string };

export interface UpdateInterviewEventInput
  extends Omit<PushInterviewEventInput, "bookingId"> {
  bookingId: string;
}

export interface DeleteInterviewEventInput {
  authUserId: string;
  provider: CalendarProvider;
  bookingId: string;
}

/* ───────────────────────────────────────────────────────────────
 * Public API
 * ───────────────────────────────────────────────────────────── */

export async function pushInterviewEvent(
  input: PushInterviewEventInput
): Promise<PushInterviewEventResult> {
  const accessToken = await getValidAccessToken(
    input.authUserId,
    input.provider
  );
  if (!accessToken) {
    return {
      ok: false,
      error: `No active ${input.provider} calendar connection.`,
    };
  }

  try {
    if (input.provider === "google") {
      const result = await createGoogleEvent(accessToken, input);
      await persistEventMapping({
        bookingId: input.bookingId,
        authUserId: input.authUserId,
        provider: "google",
        providerEventId: result.providerEventId,
        meetingUrl: result.meetingUrl,
      });
      return { ok: true, ...result };
    }

    const result = await createMicrosoftEvent(accessToken, input);
    await persistEventMapping({
      bookingId: input.bookingId,
      authUserId: input.authUserId,
      provider: "microsoft",
      providerEventId: result.providerEventId,
      meetingUrl: result.meetingUrl,
    });
    return { ok: true, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[calendar-push] push failed", {
      provider: input.provider,
      bookingId: input.bookingId,
      error: message,
    });
    return { ok: false, error: message };
  }
}

export async function updateInterviewEvent(
  input: UpdateInterviewEventInput
): Promise<PushInterviewEventResult> {
  const accessToken = await getValidAccessToken(
    input.authUserId,
    input.provider
  );
  if (!accessToken) {
    return {
      ok: false,
      error: `No active ${input.provider} calendar connection.`,
    };
  }

  const existing = await loadEventMapping(input.bookingId, input.authUserId, input.provider);
  if (!existing) {
    // No prior push — treat update as create. This keeps the API ergonomic
    // for callers that don't want to branch on "was it pushed".
    return pushInterviewEvent(input);
  }

  try {
    if (input.provider === "google") {
      const result = await patchGoogleEvent(
        accessToken,
        existing.provider_event_id,
        input
      );
      await persistEventMapping({
        bookingId: input.bookingId,
        authUserId: input.authUserId,
        provider: "google",
        providerEventId: result.providerEventId,
        meetingUrl: result.meetingUrl,
      });
      return { ok: true, ...result };
    }

    const result = await patchMicrosoftEvent(
      accessToken,
      existing.provider_event_id,
      input
    );
    await persistEventMapping({
      bookingId: input.bookingId,
      authUserId: input.authUserId,
      provider: "microsoft",
      providerEventId: result.providerEventId,
      meetingUrl: result.meetingUrl,
    });
    return { ok: true, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[calendar-push] update failed", {
      provider: input.provider,
      bookingId: input.bookingId,
      error: message,
    });
    return { ok: false, error: message };
  }
}

export async function deleteInterviewEvent(
  input: DeleteInterviewEventInput
): Promise<void> {
  const existing = await loadEventMapping(
    input.bookingId,
    input.authUserId,
    input.provider
  );
  if (!existing) return;

  const accessToken = await getValidAccessToken(
    input.authUserId,
    input.provider
  );
  if (!accessToken) {
    // Without a token we can't reach the provider — just drop the local
    // mapping so we don't keep referring to an orphaned event.
    await deleteEventMapping(input.bookingId, input.authUserId, input.provider);
    return;
  }

  try {
    if (input.provider === "google") {
      await deleteGoogleEvent(accessToken, existing.provider_event_id);
    } else {
      await deleteMicrosoftEvent(accessToken, existing.provider_event_id);
    }
  } catch (err) {
    console.warn("[calendar-push] delete failed (continuing)", {
      provider: input.provider,
      bookingId: input.bookingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  await deleteEventMapping(input.bookingId, input.authUserId, input.provider);
}

/* ───────────────────────────────────────────────────────────────
 * Google Calendar — events.insert / patch / delete
 * ───────────────────────────────────────────────────────────── */

interface ProviderCallResult {
  providerEventId: string;
  meetingUrl: string | null;
}

function googleEventBody(input: PushInterviewEventInput): Record<string, unknown> {
  const timeZone = input.timeZone ?? "UTC";
  return {
    summary: input.summary,
    description: input.description,
    start: {
      dateTime: input.startAt.toISOString(),
      timeZone,
    },
    end: {
      dateTime: input.endAt.toISOString(),
      timeZone,
    },
    attendees: input.attendees.map((a) => ({
      email: a.email,
      displayName: a.name,
    })),
    location: input.locationText ?? undefined,
    conferenceData: {
      createRequest: {
        // Deterministic but unique-enough per booking — same booking
        // re-pushed shares this so Google de-dupes the Meet link.
        requestId: `dsohire-${input.bookingId}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
}

async function createGoogleEvent(
  accessToken: string,
  input: PushInterviewEventInput
): Promise<ProviderCallResult> {
  const url =
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(googleEventBody(input)),
    cache: "no-store",
  });

  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok || !raw || typeof raw !== "object") {
    const message = extractGoogleErrorMessage(raw, response.status);
    throw new Error(`Google events.insert failed: ${message}`);
  }
  return parseGoogleEventResponse(raw);
}

async function patchGoogleEvent(
  accessToken: string,
  providerEventId: string,
  input: UpdateInterviewEventInput
): Promise<ProviderCallResult> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
    providerEventId
  )}?conferenceDataVersion=1&sendUpdates=all`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(googleEventBody(input)),
    cache: "no-store",
  });

  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok || !raw || typeof raw !== "object") {
    const message = extractGoogleErrorMessage(raw, response.status);
    throw new Error(`Google events.patch failed: ${message}`);
  }
  return parseGoogleEventResponse(raw);
}

async function deleteGoogleEvent(
  accessToken: string,
  providerEventId: string
): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
    providerEventId
  )}?sendUpdates=all`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (response.ok || response.status === 404 || response.status === 410) return;
  const raw = (await response.json().catch(() => null)) as unknown;
  const message = extractGoogleErrorMessage(raw, response.status);
  throw new Error(`Google events.delete failed: ${message}`);
}

function parseGoogleEventResponse(raw: unknown): ProviderCallResult {
  const data = raw as {
    id?: unknown;
    hangoutLink?: unknown;
    conferenceData?: {
      entryPoints?: Array<{ entryPointType?: unknown; uri?: unknown }>;
    };
  };
  if (typeof data.id !== "string" || data.id.length === 0) {
    throw new Error("Google events response missing id.");
  }
  let meetingUrl: string | null =
    typeof data.hangoutLink === "string" ? data.hangoutLink : null;
  if (!meetingUrl && Array.isArray(data.conferenceData?.entryPoints)) {
    for (const ep of data.conferenceData.entryPoints) {
      if (
        ep &&
        typeof ep === "object" &&
        ep.entryPointType === "video" &&
        typeof ep.uri === "string"
      ) {
        meetingUrl = ep.uri;
        break;
      }
    }
  }
  return { providerEventId: data.id, meetingUrl };
}

function extractGoogleErrorMessage(raw: unknown, status: number): string {
  if (raw && typeof raw === "object" && "error" in raw) {
    const errBlock = (raw as { error: unknown }).error;
    if (errBlock && typeof errBlock === "object" && "message" in errBlock) {
      const msg = (errBlock as { message: unknown }).message;
      if (typeof msg === "string") return `${msg} (HTTP ${status})`;
    }
  }
  return `HTTP ${status}`;
}

/* ───────────────────────────────────────────────────────────────
 * Microsoft Graph — /me/events POST / PATCH / DELETE
 * ───────────────────────────────────────────────────────────── */

function microsoftEventBody(input: PushInterviewEventInput): Record<string, unknown> {
  const timeZone = input.timeZone ?? "UTC";
  return {
    subject: input.summary,
    body: {
      contentType: "HTML",
      content: input.description,
    },
    start: {
      dateTime: input.startAt.toISOString(),
      timeZone,
    },
    end: {
      dateTime: input.endAt.toISOString(),
      timeZone,
    },
    location: input.locationText
      ? { displayName: input.locationText }
      : undefined,
    attendees: input.attendees.map((a) => ({
      type: "required",
      emailAddress: { address: a.email, name: a.name ?? a.email.split("@")[0] },
    })),
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
    allowNewTimeProposals: false,
  };
}

async function createMicrosoftEvent(
  accessToken: string,
  input: PushInterviewEventInput
): Promise<ProviderCallResult> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(microsoftEventBody(input)),
    cache: "no-store",
  });

  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok || !raw || typeof raw !== "object") {
    const message = extractMicrosoftErrorMessage(raw, response.status);
    throw new Error(`Microsoft /me/events POST failed: ${message}`);
  }
  return parseMicrosoftEventResponse(raw);
}

async function patchMicrosoftEvent(
  accessToken: string,
  providerEventId: string,
  input: UpdateInterviewEventInput
): Promise<ProviderCallResult> {
  const url = `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(
    providerEventId
  )}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(microsoftEventBody(input)),
    cache: "no-store",
  });

  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok || !raw || typeof raw !== "object") {
    const message = extractMicrosoftErrorMessage(raw, response.status);
    throw new Error(`Microsoft /me/events PATCH failed: ${message}`);
  }
  return parseMicrosoftEventResponse(raw);
}

async function deleteMicrosoftEvent(
  accessToken: string,
  providerEventId: string
): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(
    providerEventId
  )}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (
    response.ok ||
    response.status === 204 ||
    response.status === 404 ||
    response.status === 410
  ) {
    return;
  }
  const raw = (await response.json().catch(() => null)) as unknown;
  const message = extractMicrosoftErrorMessage(raw, response.status);
  throw new Error(`Microsoft /me/events DELETE failed: ${message}`);
}

function parseMicrosoftEventResponse(raw: unknown): ProviderCallResult {
  const data = raw as {
    id?: unknown;
    onlineMeeting?: { joinUrl?: unknown } | null;
  };
  if (typeof data.id !== "string" || data.id.length === 0) {
    throw new Error("Microsoft /me/events response missing id.");
  }
  const meetingUrl =
    data.onlineMeeting && typeof data.onlineMeeting === "object" &&
    typeof data.onlineMeeting.joinUrl === "string"
      ? data.onlineMeeting.joinUrl
      : null;
  return { providerEventId: data.id, meetingUrl };
}

function extractMicrosoftErrorMessage(raw: unknown, status: number): string {
  if (raw && typeof raw === "object" && "error" in raw) {
    const errBlock = (raw as { error: unknown }).error;
    if (errBlock && typeof errBlock === "object" && "message" in errBlock) {
      const msg = (errBlock as { message: unknown }).message;
      if (typeof msg === "string") return `${msg} (HTTP ${status})`;
    }
  }
  return `HTTP ${status}`;
}

/* ───────────────────────────────────────────────────────────────
 * interview_calendar_events persistence
 * ───────────────────────────────────────────────────────────── */

interface PersistMappingInput {
  bookingId: string;
  authUserId: string;
  provider: CalendarProvider;
  providerEventId: string;
  meetingUrl: string | null;
}

async function persistEventMapping(input: PersistMappingInput): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("interview_calendar_events").upsert(
    {
      booking_id: input.bookingId,
      auth_user_id: input.authUserId,
      provider: input.provider,
      provider_event_id: input.providerEventId,
      meeting_url: input.meetingUrl,
    },
    { onConflict: "booking_id,auth_user_id,provider" }
  );
  if (error) {
    // Logged but not thrown — the provider event was created
    // successfully; we just lost the local breadcrumb. The caller's
    // response already includes the IDs so the next sync still has them.
    console.warn("[calendar-push] persist mapping failed", {
      bookingId: input.bookingId,
      provider: input.provider,
      error: error.message,
    });
  }
}

interface EventMappingRow {
  provider_event_id: string;
  meeting_url: string | null;
}

async function loadEventMapping(
  bookingId: string,
  authUserId: string,
  provider: CalendarProvider
): Promise<EventMappingRow | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("interview_calendar_events")
    .select("provider_event_id, meeting_url")
    .eq("booking_id", bookingId)
    .eq("auth_user_id", authUserId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) {
    console.warn("[calendar-push] loadEventMapping failed", {
      bookingId,
      provider,
      error: error.message,
    });
    return null;
  }
  if (!data) return null;
  return data as unknown as EventMappingRow;
}

async function deleteEventMapping(
  bookingId: string,
  authUserId: string,
  provider: CalendarProvider
): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("interview_calendar_events")
    .delete()
    .eq("booking_id", bookingId)
    .eq("auth_user_id", authUserId)
    .eq("provider", provider);
  if (error) {
    console.warn("[calendar-push] deleteEventMapping failed", {
      bookingId,
      provider,
      error: error.message,
    });
  }
}
