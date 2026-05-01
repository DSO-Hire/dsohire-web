/**
 * NewApplication (employer) — fires when a candidate applies to a job.
 *
 * Sent to every dso_users member of the DSO that owns the job. Phase 2 ships
 * with a single "all-members" notification; per-user notification preferences
 * are a Phase 3 follow-up.
 *
 * Use:
 *   import { NewApplication } from '@/emails/employer/NewApplication';
 *   await sendEmail({
 *     to: dsoEmails,
 *     subject: 'New application: Hygienist · Downtown Office',
 *     template: 'employer.new_application',
 *     react: <NewApplication ... />,
 *   });
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

interface NewApplicationProps {
  recipientName?: string;
  candidateName?: string;
  candidateEmail?: string;
  candidateHeadline?: string | null;
  jobTitle?: string;
  jobLocations?: string;
  applicationUrl?: string;
}

export function NewApplication({
  recipientName = "there",
  candidateName = "A candidate",
  candidateEmail,
  candidateHeadline = null,
  jobTitle = "Dental Hygienist",
  jobLocations = "Downtown Office, Kansas City, KS",
  applicationUrl = "https://dsohire.com/employer/applications/preview",
}: NewApplicationProps) {
  return (
    <Layout
      previewText={`${candidateName} applied for ${jobTitle}`}
    >
      <Text style={eyebrow}>New application</Text>
      <Heading style={heading}>Hi {recipientName} —</Heading>
      <Text style={paragraph}>
        <strong style={strong}>{candidateName}</strong> just applied for{" "}
        <strong style={strong}>{jobTitle}</strong> at {jobLocations}.
      </Text>

      <Section style={cardSection}>
        <Text style={cardLabel}>Candidate</Text>
        <Text style={cardName}>{candidateName}</Text>
        {candidateHeadline && (
          <Text style={cardMeta}>{candidateHeadline}</Text>
        )}
        {candidateEmail && (
          <Text style={cardMeta}>{candidateEmail}</Text>
        )}

        <Section style={buttonWrap}>
          <PrimaryButton href={applicationUrl}>
            Review application
          </PrimaryButton>
        </Section>
      </Section>

      <Text style={smallParagraph}>
        Top DSOs respond to strong candidates within 24 hours. The longer an
        application sits, the more likely the candidate signs elsewhere.
      </Text>

      <Text style={smallParagraph}>
        Manage notifications, jobs, and locations in your{" "}
        <a href={`${brand.siteUrl}/employer/dashboard`} style={inlineLink}>
          DSO Hire dashboard
        </a>
        .
      </Text>
    </Layout>
  );
}

export default NewApplication;

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

const cardName = {
  color: brand.ink,
  fontSize: "18px",
  fontWeight: 800,
  letterSpacing: "-0.3px",
  margin: "0 0 4px",
};

const cardMeta = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.5",
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
