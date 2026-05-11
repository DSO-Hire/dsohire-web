/**
 * ApplicationReceived (candidate) — confirmation after passive apply.
 *
 * Sent when:
 *   - Candidate submits an application via /jobs/[id] Apply form
 *   - Triggered server-side after `applications` row insert succeeds
 *
 * The magic-link in this email is what unlocks /candidate/dashboard for them
 * to track this and any future applications. Per Q3, account creation is
 * passive — they didn't sign up explicitly, so this email both confirms AND
 * gives them their first sign-in path.
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

interface ApplicationReceivedProps {
  candidateName?: string;
  jobTitle?: string;
  dsoName?: string;
  trackingUrl?: string;
}

export function ApplicationReceived({
  candidateName = "there",
  jobTitle = "Dental Hygienist",
  dsoName = "SmileBright DSO",
  trackingUrl = "https://dsohire.com/candidate/auth/callback?token=preview",
}: ApplicationReceivedProps) {
  return (
    <Layout previewText={`Your application for ${jobTitle} at ${dsoName} was received`}>
      <Text style={eyebrow}>Application received</Text>
      <Heading style={heading}>Hi {candidateName} —</Heading>
      <Text style={paragraph}>
        Your application for <strong style={strong}>{jobTitle}</strong> at{" "}
        <strong style={strong}>{dsoName}</strong> was successfully submitted.
        We&apos;ll email you when the hiring team reviews it or moves it forward.
      </Text>

      <Section style={cardSection}>
        <Text style={cardLabel}>Track this application</Text>
        <Text style={cardCopy}>
          We created a free account for you so you can check status and apply to
          future jobs in one click. Click below to access your candidate dashboard.
        </Text>
        <Section style={buttonWrap}>
          <PrimaryButton href={trackingUrl}>Open my dashboard</PrimaryButton>
        </Section>
      </Section>

      <Text style={smallParagraph}>
        Questions about this application? Reply to this email and we&apos;ll route it
        to the {dsoName} team.
      </Text>
    </Layout>
  );
}

export default ApplicationReceived;

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
  lineHeight: "1.55",
  margin: "0 0 8px",
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
