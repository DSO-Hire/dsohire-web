/**
 * StageChanged — fires when an application moves between pipeline stages
 * (e.g. New → Reviewed, or Interview → Rejected).
 *
 * Sent fire-and-forget after a stage update commits. Suppressed when the
 * employer has `jobs.hide_stages_from_candidate=true` (same gate as the
 * inbox system-message dispatch). Used as the React Email fallback when
 * the DSO doesn't have a custom `candidate.stage_changed` template.
 */

import { Heading, Section, Text, Link as EmailLink } from "@react-email/components";
import { Layout } from "./components/Layout";
import { PrimaryButton } from "./components/PrimaryButton";
import { brand } from "./lib/brand";

interface StageChangedProps {
  recipientName?: string;
  jobTitle?: string;
  dsoName?: string;
  fromStageLabel?: string;
  toStageLabel?: string;
  applicationUrl?: string;
}

export function StageChanged({
  recipientName = "there",
  jobTitle = "the role",
  dsoName = "the hiring team",
  fromStageLabel = "New",
  toStageLabel = "Reviewed",
  applicationUrl = "https://dsohire.com",
}: StageChangedProps) {
  const previewText = `Your application for ${jobTitle} is now in ${toStageLabel}`;

  return (
    <Layout previewText={previewText}>
      <Text style={eyebrow}>Application update</Text>
      <Heading style={heading}>Hi {recipientName} —</Heading>
      <Text style={paragraph}>
        Quick update on your application for{" "}
        <strong style={strong}>{jobTitle}</strong> at{" "}
        <strong style={strong}>{dsoName}</strong>.
      </Text>

      <Section style={cardSection}>
        <Text style={cardLabel}>Status</Text>
        <Text style={cardCopy}>
          Moved from <strong style={strong}>{fromStageLabel}</strong> to{" "}
          <strong style={strong}>{toStageLabel}</strong>.
        </Text>

        <Section style={buttonWrap}>
          <PrimaryButton href={applicationUrl}>
            See your application
          </PrimaryButton>
        </Section>

        <Text style={fullLinkRow}>
          <EmailLink href={applicationUrl} style={inlineLink}>
            View full status →
          </EmailLink>
        </Text>
      </Section>

      <Text style={smallParagraph}>
        The hiring team at {dsoName}{" "}will reach out when there&apos;s a
        next step. You can track this application from your dashboard.
      </Text>
    </Layout>
  );
}

export default StageChanged;

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

const strong = {
  fontWeight: 700,
  color: brand.ink,
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
  margin: "0 0 8px",
};

const cardCopy = {
  color: brand.ink,
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 8px",
};

const buttonWrap = {
  margin: "20px 0 4px",
};

const fullLinkRow = {
  margin: "10px 0 0",
  fontSize: "12px",
  lineHeight: "1.6",
};

const inlineLink = {
  color: brand.heritageDeep,
  fontWeight: 700,
  textDecoration: "underline",
  letterSpacing: "0.5px",
};

const smallParagraph = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "20px 0 0",
};
