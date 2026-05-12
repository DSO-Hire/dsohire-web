/**
 * ReferenceRequest — sent to a professional reference contact when a DSO
 * asks them to provide a reference on a candidate (Phase 5A Track D).
 *
 * The recipient is unauthenticated. The CTA links to the public no-auth
 * route /r/{token} which gates by the opaque server-generated token.
 *
 * Use:
 *   import { ReferenceRequest } from '@/emails/employer/ReferenceRequest';
 *   await sendEmail({
 *     to: referenceEmail,
 *     subject: `Reference request from ${dsoName}`,
 *     template: 'employer.reference_request',
 *     react: <ReferenceRequest ... />,
 *   });
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

interface ReferenceRequestProps {
  referenceName?: string;
  candidateName?: string;
  dsoName?: string;
  requestingUserName?: string;
  jobTitle?: string;
  formUrl?: string;
}

export function ReferenceRequest({
  referenceName = "there",
  candidateName = "the candidate",
  dsoName = "a DSO Hire employer",
  requestingUserName = "The hiring team",
  jobTitle = "an open role",
  formUrl = "https://dsohire.com/r/preview",
}: ReferenceRequestProps) {
  // First-name only for the salutation (keeps the tone collegial without
  // ever leaning on a value the employer might not have entered cleanly).
  const firstName = referenceName.split(" ")[0] ?? referenceName;

  return (
    <Layout
      previewText={`${dsoName} would like a reference for ${candidateName}`}
    >
      <Text style={eyebrow}>Reference request</Text>
      <Heading style={heading}>Hi {firstName} —</Heading>

      <Text style={paragraph}>
        <strong style={strong}>{dsoName}</strong> would like a reference for{" "}
        <strong style={strong}>{candidateName}</strong>.
      </Text>

      <Text style={paragraph}>
        {requestingUserName} at {dsoName} is considering {candidateName} for a{" "}
        <strong style={strong}>{jobTitle}</strong> role and asked you for a quick
        professional reference.
      </Text>

      <Section style={cardSection}>
        <Text style={cardLabel}>What you'll be asked</Text>
        <Text style={cardCopy}>
          Seven short questions about how you'd describe {candidateName}'s work —
          quality, reliability, teamwork, and what they're best at. About
          3-5 minutes total.
        </Text>

        <Section style={buttonWrap}>
          <PrimaryButton href={formUrl}>
            Provide a reference
          </PrimaryButton>
        </Section>

        <Text style={cardMeta}>
          Estimated time: about 3-5 minutes
        </Text>
      </Section>

      <Text style={smallParagraph}>
        If you'd rather not respond, you can ignore this email.{" "}
        {requestingUserName} will follow up directly if they need to reach you
        another way.
      </Text>

      <Text style={smallParagraph}>
        Your responses go only to {dsoName}'s hiring team — DSO Hire doesn't
        share them publicly.
      </Text>
    </Layout>
  );
}

export default ReferenceRequest;

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
  margin: "0 0 4px",
};

const cardMeta = {
  color: brand.slate,
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "12px 0 0",
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
