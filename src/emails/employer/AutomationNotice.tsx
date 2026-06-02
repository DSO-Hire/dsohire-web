/**
 * AutomationNotice (employer) — sent to a teammate by the N13
 * "notify a teammate" automation action. Generic shell: the rule supplies
 * a headline + one-line body + a link to the relevant application.
 *
 *   import { AutomationNotice } from '@/emails/employer/AutomationNotice';
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

interface AutomationNoticeProps {
  recipientName?: string;
  ruleName?: string;
  headline?: string;
  body?: string;
  applicationUrl?: string;
}

export function AutomationNotice({
  recipientName = "there",
  ruleName = "An automation",
  headline = "An automation ran",
  body = "One of your hiring automations matched an application.",
  applicationUrl = "https://dsohire.com/employer/applications",
}: AutomationNoticeProps) {
  return (
    <Layout previewText={headline}>
      <Text style={eyebrow}>Automation alert</Text>
      <Heading style={heading}>Hi {recipientName} —</Heading>
      <Text style={paragraph}>{body}</Text>

      <Section style={cardSection}>
        <Text style={cardLabel}>Triggered by</Text>
        <Text style={cardName}>{ruleName}</Text>
        <Section style={buttonWrap}>
          <PrimaryButton href={applicationUrl}>Open the application</PrimaryButton>
        </Section>
      </Section>

      <Text style={smallParagraph}>
        You&apos;re getting this because a teammate set up an automation to notify
        you. Manage your automations in the{" "}
        <a href={`${brand.siteUrl}/employer/automations`} style={inlineLink}>
          DSO Hire dashboard
        </a>
        .
      </Text>
    </Layout>
  );
}

export default AutomationNotice;

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
  margin: "0 0 8px",
};

const cardName = {
  color: brand.ink,
  fontSize: "18px",
  fontWeight: 800,
  letterSpacing: "-0.3px",
  margin: "0 0 4px",
};

const buttonWrap = {
  margin: "20px 0 4px",
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
