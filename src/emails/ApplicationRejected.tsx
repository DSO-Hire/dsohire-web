/**
 * ApplicationRejected — fires when an application moves to a rejected-kind
 * stage (Punch #6, 2026-07-10). Replaces the generic StageChanged email on
 * that transition: a candidate should get a respectful close-out, not
 * "moved from Interview to Rejected" pipeline mechanics.
 *
 * The internal disposition reason is NEVER included (disposition codes are
 * employer-only by design). Suppressed by the same
 * `jobs.hide_stages_from_candidate` gate as StageChanged. Used as the
 * React Email fallback when the DSO doesn't have a custom
 * `candidate.application_rejected` template.
 */

import { Heading, Text, Link as EmailLink } from "@react-email/components";
import { Layout } from "./components/Layout";
import { brand } from "./lib/brand";

interface ApplicationRejectedProps {
  recipientName?: string;
  jobTitle?: string;
  dsoName?: string;
  jobsUrl?: string;
}

export function ApplicationRejected({
  recipientName = "there",
  jobTitle = "the role",
  dsoName = "the hiring team",
  jobsUrl = "https://dsohire.com/jobs",
}: ApplicationRejectedProps) {
  const previewText = `An update on your application for ${jobTitle}`;

  return (
    <Layout previewText={previewText}>
      <Text style={eyebrow}>Application update</Text>
      <Heading style={heading}>Hi {recipientName} —</Heading>
      <Text style={paragraph}>
        Thank you for applying for <strong style={strong}>{jobTitle}</strong>{" "}
        at <strong style={strong}>{dsoName}</strong>, and for the time you
        put into your application.
      </Text>
      <Text style={paragraph}>
        After careful review, the hiring team has decided to move forward
        with other candidates for this role. This decision isn&apos;t a
        reflection of your qualifications — hiring often comes down to a
        very specific mix of needs for a single opening.
      </Text>
      <Text style={paragraph}>
        Your profile stays active on DSO Hire, and new dental roles are
        posted every week.{" "}
        <EmailLink href={jobsUrl} style={inlineLink}>
          Browse open roles →
        </EmailLink>
      </Text>
      <Text style={smallParagraph}>
        We&apos;re rooting for you. — The DSO Hire team, on behalf of{" "}
        {dsoName}
      </Text>
    </Layout>
  );
}

export default ApplicationRejected;

/* ───── styles (house email ramp — mirrors StageChanged) ───── */

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
