/**
 * OfferApprovalDecision (employer) — sent to the teammate who submitted an
 * offer, telling them whether an approver approved (it's now on its way to
 * the candidate) or rejected it, with the approver's note (N12 Phase 2).
 *
 *   import { OfferApprovalDecision } from '@/emails/employer/OfferApprovalDecision';
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

interface OfferApprovalDecisionProps {
  recipientName?: string;
  decision?: "approved" | "rejected";
  deciderName?: string;
  candidateName?: string;
  jobTitle?: string;
  note?: string | null;
  applicationUrl?: string;
}

export function OfferApprovalDecision({
  recipientName = "there",
  decision = "approved",
  deciderName = "An approver",
  candidateName = "the candidate",
  jobTitle = "the role",
  note = null,
  applicationUrl = "https://dsohire.com/employer/applications",
}: OfferApprovalDecisionProps) {
  const approved = decision === "approved";
  const eyebrowText = approved ? "Offer approved" : "Offer not approved";
  const lead = approved
    ? `${deciderName} approved your offer to ${candidateName} for ${jobTitle}. It has been sent to the candidate.`
    : `${deciderName} did not approve your offer to ${candidateName} for ${jobTitle}. Nothing was sent — you can revise the terms and resubmit.`;
  const cta = approved ? "View the offer" : "Revise the offer";

  return (
    <Layout previewText={lead}>
      <Text style={approved ? eyebrowOk : eyebrowNo}>{eyebrowText}</Text>
      <Heading style={heading}>Hi {recipientName} —</Heading>
      <Text style={paragraph}>{lead}</Text>

      {note ? (
        <Section style={cardSection}>
          <Text style={cardLabel}>Note from {deciderName}</Text>
          <Text style={cardNote}>“{note}”</Text>
        </Section>
      ) : null}

      <Section style={buttonWrap}>
        <PrimaryButton href={applicationUrl}>{cta}</PrimaryButton>
      </Section>

      <Text style={smallParagraph}>
        You&apos;re getting this because you submitted an offer that needed
        sign-off.
      </Text>
    </Layout>
  );
}

export default OfferApprovalDecision;

/* ───── styles ───── */

const eyebrowOk = {
  color: brand.heritageDeep,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "2.5px",
  textTransform: "uppercase" as const,
  margin: "0 0 12px",
};

const eyebrowNo = {
  color: "#9a3412",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "2.5px",
  textTransform: "uppercase" as const,
  margin: "0 0 12px",
};

const heading = {
  color: brand.ink,
  fontSize: "26px",
  fontWeight: 800,
  letterSpacing: "-0.6px",
  lineHeight: "1.2",
  margin: "0 0 16px",
};

const paragraph = {
  color: brand.ink,
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 20px",
};

const cardSection = {
  backgroundColor: brand.cream,
  borderLeft: `3px solid ${brand.heritage}`,
  padding: "18px 24px",
  margin: "20px 0",
};

const cardLabel = {
  color: brand.heritageDeep,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  margin: "0 0 8px",
};

const cardNote = {
  color: brand.ink,
  fontSize: "15px",
  fontStyle: "italic" as const,
  lineHeight: "1.5",
  margin: "0",
};

const buttonWrap = {
  margin: "8px 0 4px",
};

const smallParagraph = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "20px 0 0",
};
