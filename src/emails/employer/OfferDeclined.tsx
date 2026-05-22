/**
 * OfferDeclined — notification to the DSO recruiter when a candidate
 * declines a sent offer through /o/[token].
 *
 * Sent from the candidate-driven recordDecline action. Surfaces the
 * optional decline reason and links back to the employer detail page.
 * Reply-to is set to the candidate's email so the recruiter can ask
 * follow-up questions if useful.
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

export interface OfferDeclinedProps {
  recipientFirstName?: string | null;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string;
  dsoName: string;
  /** Optional reason the candidate provided. */
  reason: string | null;
  detailUrl: string;
}

export function OfferDeclined({
  recipientFirstName = null,
  candidateName,
  candidateEmail,
  jobTitle,
  dsoName,
  reason,
  detailUrl,
}: OfferDeclinedProps) {
  const greeting = recipientFirstName ? `Hi ${recipientFirstName} —` : "Hi —";
  return (
    <Layout
      previewText={`${candidateName} declined the offer for ${jobTitle}`}
    >
      <Text style={eyebrow}>Offer · Declined</Text>
      <Heading style={heading}>{greeting}</Heading>
      <Text style={paragraph}>
        <strong style={strong}>{candidateName}</strong>{" "}declined the offer
        for the <strong style={strong}>{jobTitle}</strong> role at {dsoName}.
      </Text>

      {reason && (
        <Section style={reasonCard}>
          <Text style={cardLabel}>Reason they gave</Text>
          <Text style={reasonText}>“{reason}”</Text>
        </Section>
      )}

      <Text style={paragraph}>
        The application has been moved to <strong>Withdrawn</strong>{" "}on your
        kanban. If you&apos;d like to reopen it (or send a revised offer),
        open the application page below.
      </Text>

      <Section style={buttonWrap}>
        <PrimaryButton href={detailUrl}>
          Open application
        </PrimaryButton>
      </Section>

      <Text style={smallParagraph}>
        {candidateEmail
          ? `Replies to this email go directly to ${candidateName} at ${candidateEmail}.`
          : "Reach out through the application page if you need to follow up."}
      </Text>
    </Layout>
  );
}

export default OfferDeclined;

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

const reasonCard = {
  backgroundColor: brand.cream,
  borderLeft: `3px solid ${brand.heritage}`,
  padding: "12px 18px",
  margin: "0 0 18px",
};

const cardLabel = {
  color: brand.heritageDeep,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  margin: "0 0 8px",
};

const reasonText = {
  color: brand.ink,
  fontSize: "14px",
  fontStyle: "italic" as const,
  lineHeight: "1.55",
  margin: "0",
};

const buttonWrap = {
  margin: "8px 0 18px",
};

const smallParagraph = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "16px 0 0",
};
