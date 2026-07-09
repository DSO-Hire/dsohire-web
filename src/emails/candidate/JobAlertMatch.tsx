/**
 * JobAlertMatch (candidate) — saved-search alert email.
 *
 * Sent by /api/cron/job-alert-dispatch when new jobs match one of the
 * candidate's saved searches (candidate_saved_searches). One email per
 * saved search per run — never per job.
 *
 * Privacy: DSO names are masked upstream (getDisplayedDsoNamesBatch,
 * viewer "public") — this template never receives a raw corporate name
 * for a privacy-flagged practice.
 *
 *   import { JobAlertMatch } from '@/emails/candidate/JobAlertMatch';
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

export interface JobAlertMatchJob {
  title: string;
  /** Masked display name (practice name when affiliation is private). May be null. */
  dso_name: string | null;
  /** "City, ST" — or null when no location is set. */
  location_label: string | null;
  /** "$150K–$180K" comp line, or null when the role has no published range. */
  comp_label: string | null;
  url: string;
}

export interface JobAlertMatchProps {
  recipientFirstName?: string;
  /** The saved search's (possibly candidate-renamed) name. */
  searchName?: string;
  jobs?: JobAlertMatchJob[];
  /** Link back to /jobs with the saved filters applied. */
  searchUrl?: string;
  /** Link to Settings → Credentials, where saved searches are managed. */
  manageUrl?: string;
  /** Tokenized one-click unsubscribe URL for the candidate.jobs category. */
  unsubscribeUrl?: string;
}

export function JobAlertMatch({
  recipientFirstName = "there",
  searchName = "your saved search",
  jobs = [],
  searchUrl = "https://dsohire.com/jobs",
  manageUrl = "https://dsohire.com/candidate/settings/credentials",
  unsubscribeUrl,
}: JobAlertMatchProps) {
  const count = jobs.length;
  const previewText = `${count} new job${count === 1 ? "" : "s"} match “${searchName}”`;

  return (
    <Layout previewText={previewText}>
      <Text style={eyebrow}>Job alert · Saved search</Text>
      <Heading style={headingStyle}>
        {count} new job{count === 1 ? "" : "s"} match &ldquo;{searchName}&rdquo;
      </Heading>
      <Text style={paragraph}>
        Hi {recipientFirstName} — new roles were just posted that match a
        search you saved on DSO Hire.
      </Text>

      <Section style={listSection}>
        {jobs.map((job) => (
          <Section key={job.url} style={jobCard}>
            <Text style={jobTitle}>
              <a href={job.url} style={jobTitleLink}>
                {job.title}
              </a>
            </Text>
            <Text style={jobMeta}>
              {job.dso_name ?? "A dental practice"}
              {job.location_label ? ` · ${job.location_label}` : ""}
              {job.comp_label ? ` · ${job.comp_label}` : ""}
            </Text>
          </Section>
        ))}
      </Section>

      <Section style={buttonWrap}>
        <PrimaryButton href={searchUrl}>See all matching jobs</PrimaryButton>
      </Section>

      <Text style={smallParagraph}>
        You&apos;re receiving this because you saved this search with alerts
        on.{" "}
        <a href={manageUrl} style={inlineLink}>
          Manage your saved searches
        </a>
        {unsubscribeUrl ? (
          <>
            {" "}
            or{" "}
            <a href={unsubscribeUrl} style={inlineLink}>
              unsubscribe from job alerts
            </a>
            .
          </>
        ) : (
          "."
        )}
      </Text>
    </Layout>
  );
}

export default JobAlertMatch;

/* ───── styles ───── */

const eyebrow = {
  color: brand.heritageDeep,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "2.5px",
  textTransform: "uppercase" as const,
  margin: "0 0 12px",
};

const headingStyle = {
  color: brand.ink,
  fontSize: "24px",
  fontWeight: 800,
  letterSpacing: "-0.6px",
  lineHeight: "1.2",
  margin: "0 0 16px",
};

const paragraph = {
  color: brand.ink,
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 24px",
};

const listSection = {
  margin: "8px 0 8px",
  padding: "0",
};

const jobCard = {
  backgroundColor: brand.cream,
  borderLeft: `3px solid ${brand.heritage}`,
  padding: "14px 18px",
  margin: "0 0 12px",
};

const jobTitle = {
  margin: "0 0 4px",
};

const jobTitleLink = {
  color: brand.ink,
  fontSize: "16px",
  fontWeight: 700,
  textDecoration: "none",
  lineHeight: "1.3",
};

const jobMeta = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "0",
};

const buttonWrap = {
  margin: "20px 0 8px",
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
