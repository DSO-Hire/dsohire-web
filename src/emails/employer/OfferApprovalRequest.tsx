/**
 * OfferApprovalRequest (employer) — sent to owners/admins when a teammate
 * submits an offer that needs sign-off (N12 Phase 2). Links to the
 * Approvals queue where they approve or reject.
 *
 *   import { OfferApprovalRequest } from '@/emails/employer/OfferApprovalRequest';
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

interface OfferApprovalRequestProps {
  recipientName?: string;
  requesterName?: string;
  candidateName?: string;
  jobTitle?: string;
  /** Pretty base + period, e.g. "$72/hr" or "$165,000/yr". */
  baseLabel?: string | null;
  /** Plain-English reason approval was required. */
  reasonLabel?: string;
  approvalsUrl?: string;
}

export function OfferApprovalRequest({
  recipientName = "there",
  requesterName = "A teammate",
  candidateName = "a candidate",
  jobTitle = "a role",
  baseLabel = null,
  reasonLabel = "Approval required",
  approvalsUrl = "https://dsohire.com/employer/offer-approvals",
}: OfferApprovalRequestProps) {
  return (
    <Layout previewText={`${requesterName} needs your sign-off on an offer`}>
      <Text style={eyebrow}>Offer approval needed</Text>
      <Heading style={heading}>Hi {recipientName} —</Heading>
      <Text style={paragraph}>
        <strong>{requesterName}</strong> prepared an offer to{" "}
        <strong>{candidateName}</strong> for <strong>{jobTitle}</strong> and it
        needs your approval before it can be sent.
      </Text>

      <Section style={cardSection}>
        <Text style={cardLabel}>Why it needs sign-off</Text>
        <Text style={cardName}>{reasonLabel}</Text>
        {baseLabel ? (
          <>
            <Text style={cardLabel}>Base compensation</Text>
            <Text style={cardName}>{baseLabel}</Text>
          </>
        ) : null}
        <Section style={buttonWrap}>
          <PrimaryButton href={approvalsUrl}>Review &amp; respond</PrimaryButton>
        </Section>
      </Section>

      <Text style={smallParagraph}>
        Nothing has been sent to the candidate yet — the offer waits here until
        you approve it. You can change who needs approval and when in{" "}
        <a href={`${brand.siteUrl}/employer/settings/offer-approvals`} style={inlineLink}>
          offer-approval settings
        </a>
        .
      </Text>
    </Layout>
  );
}

export default OfferApprovalRequest;

/* ───── styles ───── */

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
  padding: "20px 24px",
  margin: "24px 0",
};

const cardLabel = {
  color: brand.heritageDeep,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  margin: "0 0 4px",
};

const cardName = {
  color: brand.ink,
  fontSize: "18px",
  fontWeight: 800,
  letterSpacing: "-0.3px",
  margin: "0 0 14px",
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

const inlineLink = {
  color: brand.heritageDeep,
  textDecoration: "underline",
};
