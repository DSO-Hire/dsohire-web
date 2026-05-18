/**
 * InterviewReminder (shared) — sent 24h + 1h before a confirmed
 * interview. Audience-aware copy (candidate vs employer) but same
 * layout. Phase 5A Day 3.
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "./components/Layout";
import { PrimaryButton } from "./components/PrimaryButton";
import { brand } from "./lib/brand";

export interface InterviewReminderProps {
  recipientName?: string | null;
  audience: "candidate" | "employer";
  windowLabel: "tomorrow" | "in an hour";
  dsoName?: string;
  jobTitle?: string;
  candidateName?: string | null;
  startAtIso: string;
  durationMinutes: number;
  kindLabel: string;
  locationText: string | null;
  detailUrl: string;
  /**
   * IANA timezone the recipient prefers (e.g. "America/Chicago"). Used to
   * render the reminder time in the recipient's TZ instead of falling
   * back to the Vercel Node runtime's UTC. Defaults to America/Chicago —
   * matches the column default added in migration 20260518000001.
   */
  recipientTimezone?: string;
}

function formatStart(
  iso: string,
  timezone: string
): { line1: string; line2: string } {
  const d = new Date(iso);
  return {
    line1: d.toLocaleString("en-US", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    line2: d.toLocaleString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }),
  };
}

export function InterviewReminder({
  recipientName = null,
  audience,
  windowLabel,
  dsoName = "the practice",
  jobTitle = "the role",
  candidateName = null,
  startAtIso,
  durationMinutes,
  kindLabel,
  locationText,
  detailUrl,
  recipientTimezone = "America/Chicago",
}: InterviewReminderProps) {
  const greeting = recipientName ? `Hi ${recipientName} —` : "Hi —";
  const { line1, line2 } = formatStart(startAtIso, recipientTimezone);
  const eyebrowText =
    windowLabel === "tomorrow"
      ? "Interview tomorrow"
      : "Interview in 1 hour";

  const heading =
    audience === "candidate"
      ? windowLabel === "tomorrow"
        ? `Your interview with ${dsoName} is tomorrow.`
        : `Your interview with ${dsoName} starts soon.`
      : windowLabel === "tomorrow"
        ? `Reminder: ${candidateName ?? "candidate"} interview tomorrow.`
        : `Reminder: ${candidateName ?? "candidate"} interview in 1 hour.`;

  return (
    <Layout previewText={`${eyebrowText} · ${line1} ${line2}`}>
      <Text style={eyebrow}>{eyebrowText} · {kindLabel}</Text>
      <Heading style={headingStyle}>{greeting}</Heading>
      <Text style={paragraph}>{heading}</Text>

      <Section style={cardSection}>
        <Text style={cardLabel}>When</Text>
        <Text style={whenLine1}>{line1}</Text>
        <Text style={whenLine2}>
          {line2} · {durationMinutes} minutes
        </Text>
        {audience === "employer" && candidateName && (
          <>
            <Text style={cardLabel}>Candidate</Text>
            <Text style={cardValue}>{candidateName}</Text>
          </>
        )}
        <Text style={cardLabel}>Role</Text>
        <Text style={cardValue}>{jobTitle}</Text>
        {locationText && (
          <>
            <Text style={cardLabel}>Where</Text>
            <Text style={cardValue}>{locationText}</Text>
          </>
        )}

        <Section style={buttonWrap}>
          <PrimaryButton href={detailUrl}>
            {audience === "candidate"
              ? "View application"
              : "Open application"}
          </PrimaryButton>
        </Section>
      </Section>

      <Text style={smallParagraph}>
        {audience === "candidate"
          ? `Need to reschedule? Reply to this email and ${dsoName} can propose new times.`
          : "Pre-interview prep tip: skim the candidate's resume + screening responses before the call."}
      </Text>
    </Layout>
  );
}

export default InterviewReminder;

/* ───── styles ───── */

const eyebrow = {
  color: brand.heritageDeep,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "2.5px",
  textTransform: "uppercase" as const,
  margin: "0 0 12px",
};

const headingStyle = {
  color: brand.ink,
  fontSize: "22px",
  fontWeight: 800,
  letterSpacing: "-0.4px",
  lineHeight: "1.25",
  margin: "0 0 16px",
};

const paragraph = {
  color: brand.ink,
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 18px",
};

const cardSection = {
  backgroundColor: brand.cream,
  borderLeft: `3px solid ${brand.heritage}`,
  padding: "20px 24px",
  margin: "20px 0",
};

const cardLabel = {
  color: brand.heritageDeep,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  margin: "0 0 4px",
};

const whenLine1 = {
  color: brand.ink,
  fontSize: "18px",
  fontWeight: 800,
  lineHeight: "1.25",
  margin: "0 0 2px",
};

const whenLine2 = {
  color: brand.ink,
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: "1.4",
  margin: "0 0 14px",
};

const cardValue = {
  color: brand.ink,
  fontSize: "14px",
  fontWeight: 600,
  lineHeight: "1.45",
  margin: "0 0 12px",
};

const buttonWrap = {
  margin: "12px 0 4px",
};

const smallParagraph = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "20px 0 0",
};
