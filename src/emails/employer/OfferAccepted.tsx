/**
 * OfferAccepted — notification to the DSO recruiter when a candidate
 * accepts a sent offer through /o/[token].
 *
 * Sent from the candidate-driven recordAcceptance action. Renders the
 * candidate's name + role + the soft-sig they typed, with a primary CTA
 * back to the employer detail page so the recruiter can confirm next
 * steps. Reply-to is set to the candidate's email so the recruiter can
 * respond directly.
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

export interface OfferAcceptedProps {
  /** First name of the recruiter (sender of the original offer). */
  recipientFirstName?: string | null;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string;
  dsoName: string;
  /** Full legal name the candidate typed as acknowledgement. */
  signedName: string | null;
  /** Direct link to the employer-side application detail page. */
  detailUrl: string;
}

export function OfferAccepted({
  recipientFirstName = null,
  candidateName,
  candidateEmail,
  jobTitle,
  dsoName,
  signedName,
  detailUrl,
}: OfferAcceptedProps) {
  const greeting = recipientFirstName ? `Hi ${recipientFirstName} —` : "Hi —";
  return (
    <Layout
      previewText={`${candidateName} accepted the offer for ${jobTitle}`}
    >
      <Text style={eyebrow}>Offer · Accepted</Text>
      <Heading style={heading}>{greeting}</Heading>
      <Text style={paragraph}>
        <strong style={strong}>{candidateName}</strong>{" "}just accepted the
        offer for the <strong style={strong}>{jobTitle}</strong> role at{" "}
        {dsoName}.
      </Text>

      <Section style={card}>
        <Text style={cardLabel}>Acknowledgement on file</Text>
        {signedName && (
          <Text style={signedRow}>
            Typed name: <strong>{signedName}</strong>
          </Text>
        )}
        <Text style={cardMeta}>
          We&apos;ve also flipped the application to <strong>Hired</strong>{" "}on
          your kanban so the rest of the team sees the update.
        </Text>
      </Section>

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

export default OfferAccepted;

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

const card = {
  backgroundColor: brand.cream,
  borderLeft: `3px solid ${brand.heritage}`,
  padding: "16px 22px",
  margin: "16px 0 22px",
};

const cardLabel = {
  color: brand.heritageDeep,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  margin: "0 0 10px",
};

const signedRow = {
  color: brand.ink,
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "0 0 8px",
};

const cardMeta = {
  color: brand.slate,
  fontSize: "13px",
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
