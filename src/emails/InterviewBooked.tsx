/**
 * InterviewBooked (shared) — confirmation email sent to BOTH the
 * candidate and each DSO admin after a slot is booked.
 *
 * Audience flag swaps a few copy bits; the rest of the layout is
 * identical so both parties read the same source of truth.
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "./components/Layout";
import { PrimaryButton } from "./components/PrimaryButton";
import { brand } from "./lib/brand";

export interface InterviewBookedProps {
  recipientName?: string | null;
  audience: "candidate" | "employer";
  dsoName?: string;
  jobTitle?: string;
  candidateName?: string | null;
  startAtIso: string;
  durationMinutes: number;
  kindLabel: string;
  locationText: string | null;
  detailUrl: string;
}

function formatStart(iso: string): { line1: string; line2: string } {
  const d = new Date(iso);
  return {
    line1: d.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    line2: d.toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }),
  };
}

export function InterviewBooked({
  recipientName = null,
  audience,
  dsoName = "the practice",
  jobTitle = "the role",
  candidateName = null,
  startAtIso,
  durationMinutes,
  kindLabel,
  locationText,
  detailUrl,
}: InterviewBookedProps) {
  const greeting = recipientName ? `Hi ${recipientName} —` : "Hi —";
  const { line1, line2 } = formatStart(startAtIso);

  const headlineText =
    audience === "candidate"
      ? `Your interview with ${dsoName} is confirmed.`
      : `${candidateName ?? "Candidate"} booked their interview.`;
  const previewText =
    audience === "candidate"
      ? `Interview confirmed: ${line1}`
      : `Interview booked with ${candidateName ?? "candidate"}`;

  return (
    <Layout previewText={previewText}>
      <Text style={eyebrow}>Interview confirmed · {kindLabel}</Text>
      <Heading style={heading}>{greeting}</Heading>
      <Text style={paragraph}>{headlineText}</Text>

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
          : `Want to add this to your calendar automatically? Connect Google Calendar or Outlook in Integrations (rolling out this week).`}
      </Text>
    </Layout>
  );
}

export default InterviewBooked;

const eyebrow = {
  color: brand.heritageDeep,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "2.5px",
  textTransform: "uppercase" as const,
  margin: "0 0 12px",
};

const heading = {
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
