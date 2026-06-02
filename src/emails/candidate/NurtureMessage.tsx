/**
 * NurtureMessage (candidate) — sent by an N16 automation when an employer
 * re-engages an applicant (e.g. an application that's been sitting in a stage
 * a while). The employer authors the subject + body in the automation builder;
 * we render the body as paragraphs and add a link back to their application.
 *
 *   import { NurtureMessage } from '@/emails/candidate/NurtureMessage';
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

interface NurtureMessageProps {
  recipientName?: string;
  dsoName?: string;
  jobTitle?: string;
  /** Author-written body. Rendered as paragraphs split on blank/newlines. */
  messageBody?: string;
  applicationUrl?: string;
}

export function NurtureMessage({
  recipientName = "there",
  dsoName = "the hiring team",
  jobTitle = "the role",
  messageBody = "We wanted to check in on your application.",
  applicationUrl = "https://dsohire.com/candidate/applications",
}: NurtureMessageProps) {
  const paragraphs = messageBody
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Layout previewText={`A note from ${dsoName} about ${jobTitle}`}>
      <Text style={eyebrow}>A note from {dsoName}</Text>
      <Heading style={heading}>Hi {recipientName} —</Heading>
      {paragraphs.length > 0 ? (
        paragraphs.map((p, i) => (
          <Text key={i} style={paragraph}>
            {p}
          </Text>
        ))
      ) : (
        <Text style={paragraph}>{messageBody}</Text>
      )}

      <Section style={buttonWrap}>
        <PrimaryButton href={applicationUrl}>View your application</PrimaryButton>
      </Section>

      <Text style={smallParagraph}>
        You&apos;re receiving this because you applied for {jobTitle} via DSO Hire.
      </Text>
    </Layout>
  );
}

export default NurtureMessage;

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
