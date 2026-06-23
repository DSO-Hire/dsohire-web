/**
 * ProspectInterest (candidate) — Sourcing CRM Phase 2.
 *
 * Sent when a DSO messages a sourced (pre-application) prospect. The candidate's
 * identity stays masked to the DSO; this email reveals the DSO to the CANDIDATE
 * (the #52 first-outbound reveal) and drives them to the in-app thread to read +
 * reply. Reply-to is the platform no-reply — replies happen on-platform only, so
 * the candidate's email is never exposed to the DSO.
 *
 *   import { ProspectInterest } from '@/emails/candidate/ProspectInterest';
 */

import { Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

interface ProspectInterestProps {
  dsoName?: string;
  /** DSO-authored body. Rendered as paragraphs split on blank/newlines. */
  messageBody?: string;
  threadUrl?: string;
}

export function ProspectInterest({
  dsoName = "A dental group",
  messageBody = "We came across your profile on DSO Hire and think you could be a great fit.",
  threadUrl = "https://dsohire.com/candidate/prospects",
}: ProspectInterestProps) {
  const paragraphs = messageBody
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Layout previewText={`${dsoName} is interested in you on DSO Hire`}>
      <Text style={eyebrow}>Interest from an employer</Text>
      <Text style={heading}>{dsoName} is interested in you</Text>
      {paragraphs.map((p, i) => (
        <Text key={i} style={paragraph}>
          {p}
        </Text>
      ))}

      <Section style={buttonWrap}>
        <PrimaryButton href={threadUrl}>View &amp; reply on DSO Hire</PrimaryButton>
      </Section>

      <Text style={smallParagraph}>
        You stay anonymous until you choose to reply or apply. You can reply,
        mute, or block this employer right from the conversation — they never see
        your email address.
      </Text>
    </Layout>
  );
}

export default ProspectInterest;

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
  margin: "0 0 16px",
};

const buttonWrap = {
  margin: "24px 0 4px",
};

const smallParagraph = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "20px 0 0",
};
