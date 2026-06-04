/**
 * PracticeFitDigest (candidate) — the weekly PracticeFit drip (Phase B.2).
 *
 * Sent every Monday (9am ET / 8am CT) via /api/cron/practice-fit-digest to each
 * consenting candidate who has new high-fit roles — or, if they'd otherwise go
 * a month with no drip, their best current applicable roles ("fallback").
 *
 * Privacy: every DSO name here is ALREADY masked upstream (getTopFitJobsForCandidate
 * → getDisplayedDsoNamesBatch, viewer "public"). This template NEVER receives a
 * raw corporate name — it renders whatever masked `dso_name` it's handed, and
 * falls back to a generic label when null. The anonymity guarantee holds.
 *
 *   import { PracticeFitDigest } from '@/emails/candidate/PracticeFitDigest';
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

export interface PracticeFitDigestJob {
  title: string;
  /** Masked display name (practice name when affiliation is private). May be null. */
  dso_name: string | null;
  /** "City, ST" — or null when no location is set. */
  location_label: string | null;
  /** Bucket label, e.g. "Excellent fit" / "Strong fit". */
  bucket_label: string;
  url: string;
}

export interface PracticeFitDigestProps {
  recipientFirstName?: string;
  /** "new" = fresh high-fit matches; "fallback" = broader roles (monthly catch-up). */
  variant?: "new" | "fallback";
  jobs?: PracticeFitDigestJob[];
  /** Link to the candidate's full matches feed. */
  matchesUrl?: string;
  /**
   * Tokenized one-click unsubscribe URL for the "Job alerts & recommendations"
   * category (no login). Built per-recipient via
   * unsubscribePageUrlForEvent(userId, "candidate.practice_fit_digest"). When
   * omitted (e.g. in preview), we fall back to the logged-in settings link.
   */
  unsubscribeUrl?: string;
}

export function PracticeFitDigest({
  recipientFirstName = "there",
  variant = "new",
  jobs = [],
  matchesUrl = "https://dsohire.com/candidate/dashboard",
  unsubscribeUrl,
}: PracticeFitDigestProps) {
  const count = jobs.length;
  const isNew = variant === "new";

  const heading = isNew
    ? `${count} new role${count === 1 ? "" : "s"} that fit you`
    : "Roles worth a look this week";

  const intro = isNew
    ? "Here are this week's best new matches for your profile — ranked by how closely they fit what you're looking for."
    : "Nothing brand-new cleared the bar this week, so here are a few roles still worth a look based on your profile.";

  const previewText = isNew
    ? `${count} new PracticeFit match${count === 1 ? "" : "es"} this week`
    : "A few roles worth a look this week";

  return (
    <Layout previewText={previewText}>
      <Text style={eyebrow}>PracticeFit · Weekly matches</Text>
      <Heading style={headingStyle}>{heading}</Heading>
      <Text style={paragraph}>
        Hi {recipientFirstName} — {intro}
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
            </Text>
            <Text style={bucketChip}>{job.bucket_label}</Text>
          </Section>
        ))}
      </Section>

      <Section style={buttonWrap}>
        <PrimaryButton href={matchesUrl}>See all your matches</PrimaryButton>
      </Section>

      <Text style={smallParagraph}>
        You&apos;re receiving this because PracticeFit match alerts are on for
        your account.{" "}
        {unsubscribeUrl ? (
          <>
            <a href={unsubscribeUrl} style={inlineLink}>
              Unsubscribe from match alerts
            </a>{" "}
            or manage all{" "}
            <a
              href={`${brand.siteUrl}/candidate/settings/notifications`}
              style={inlineLink}
            >
              notification preferences
            </a>
            .
          </>
        ) : (
          <>
            To turn these off, update your{" "}
            <a
              href={`${brand.siteUrl}/candidate/settings/notifications`}
              style={inlineLink}
            >
              notification preferences
            </a>
            .
          </>
        )}
      </Text>
    </Layout>
  );
}

export default PracticeFitDigest;

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
  margin: "0 0 8px",
};

const bucketChip = {
  display: "inline-block" as const,
  color: brand.heritageDeep,
  backgroundColor: "rgba(77, 122, 96, 0.12)",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.4px",
  padding: "3px 10px",
  borderRadius: "999px",
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
