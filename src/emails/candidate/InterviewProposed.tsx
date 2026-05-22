/**
 * InterviewProposed (candidate) — "pick a time" email.
 *
 * Sent when an employer proposes one or more interview slots through
 * the Phase 5A scheduling flow. The candidate clicks through to
 * /candidate/applications/[id] to confirm a slot.
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

export interface InterviewProposedProps {
  candidateFirstName?: string | null;
  dsoName?: string;
  jobTitle?: string;
  kindLabel?: string;
  durationMinutes?: number;
  message?: string | null;
  locationText?: string | null;
  proposedStartsIso?: string[];
  pickUrl?: string;
  /**
   * IANA timezone the recipient prefers (e.g. "America/Chicago"). Used to
   * render proposed slots in the candidate's TZ instead of falling back to
   * the Vercel Node runtime's UTC. Defaults to the US-centric
   * America/Chicago — matches the candidates.preferred_timezone default
   * added in migration 20260518000001.
   */
  recipientTimezone?: string;
}

function formatSlot(iso: string, timezone: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

export function InterviewProposed({
  candidateFirstName = null,
  dsoName = "the practice",
  jobTitle = "the role",
  kindLabel = "Interview",
  durationMinutes = 30,
  message = null,
  locationText = null,
  proposedStartsIso = [],
  pickUrl = "https://dsohire.com/candidate/dashboard",
  recipientTimezone = "America/Chicago",
}: InterviewProposedProps) {
  const greeting = candidateFirstName
    ? `Hi ${candidateFirstName} —`
    : "Hi —";
  return (
    <Layout
      previewText={`${dsoName} proposed interview times for ${jobTitle}`}
    >
      <Text style={eyebrow}>Interview · {kindLabel} · {durationMinutes} min</Text>
      <Heading style={heading}>{greeting}</Heading>
      <Text style={paragraph}>
        <strong style={strong}>{dsoName}</strong> proposed{" "}
        {proposedStartsIso.length === 1 ? "an interview time" : "interview times"}{" "}
        for the <strong style={strong}>{jobTitle}</strong>{" "}role.
      </Text>

      {message && (
        <Section style={quoteSection}>
          <Text style={quoteText}>“{message}”</Text>
        </Section>
      )}

      <Section style={cardSection}>
        <Text style={cardLabel}>Pick a time that works</Text>
        {proposedStartsIso.map((iso) => (
          <Text key={iso} style={slotRow}>
            {formatSlot(iso, recipientTimezone)}
          </Text>
        ))}
        {locationText && (
          <Text style={cardMeta}>
            <strong>Where:</strong> {locationText}
          </Text>
        )}

        <Section style={buttonWrap}>
          <PrimaryButton href={pickUrl}>
            Pick a time
          </PrimaryButton>
        </Section>
      </Section>

      <Text style={smallParagraph}>
        Click the button to confirm one of the times above. If none work,
        reply to this email and {dsoName} can propose new ones.
      </Text>
    </Layout>
  );
}

export default InterviewProposed;

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

const strong = {
  fontWeight: 700,
  color: brand.ink,
};

const quoteSection = {
  borderLeft: `3px solid ${brand.heritage}`,
  padding: "8px 16px",
  margin: "0 0 18px",
  backgroundColor: brand.cream,
};

const quoteText = {
  color: brand.ink,
  fontSize: "14px",
  fontStyle: "italic" as const,
  lineHeight: "1.55",
  margin: "0",
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
  margin: "0 0 12px",
};

const slotRow = {
  color: brand.ink,
  fontSize: "15px",
  fontWeight: 700,
  lineHeight: "1.4",
  margin: "0 0 6px",
};

const cardMeta = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "12px 0 0",
};

const buttonWrap = {
  margin: "16px 0 4px",
};

const smallParagraph = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "20px 0 0",
};
