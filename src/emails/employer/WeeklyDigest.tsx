/**
 * WeeklyDigest (employer) — Monday-morning roundup of the past week.
 *
 * Sent every Monday at 8am US Central via Vercel cron
 * (/api/cron/weekly-digest). Hits each dso_users.role IN ('owner',
 * 'admin') user once. Suppresses if there's truly nothing to report
 * (no apps, no hires, no stale candidates) to avoid empty-noise emails.
 *
 * Phase 5C / E6.10. Reuses Layout + PrimaryButton.
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

export interface WeeklyDigestTopJob {
  title: string;
  apps_this_week: number;
  url: string;
}

export interface WeeklyDigestStaleCandidate {
  name: string;
  job_title: string;
  stage_label: string;
  days_in_stage: number;
  url: string;
}

export interface WeeklyDigestProps {
  recipientFirstName?: string;
  dsoName?: string;
  weekRangeLabel?: string;
  applicationsThisWeek?: number;
  applicationsLastWeek?: number;
  hiresThisWeek?: number;
  openRoles?: number;
  topJobs?: WeeklyDigestTopJob[];
  staleCandidates?: WeeklyDigestStaleCandidate[];
  dashboardUrl?: string;
  /**
   * Tokenized one-click unsubscribe URL for the "Performance summaries"
   * category (no login). Built per-recipient via
   * unsubscribePageUrlForEvent(userId, "employer.weekly_digest"). When omitted
   * (e.g. in preview), we fall back to the logged-in settings link.
   */
  unsubscribeUrl?: string;
}

export function WeeklyDigest({
  recipientFirstName = "there",
  dsoName = "your DSO",
  weekRangeLabel = "May 5 – May 11",
  applicationsThisWeek = 0,
  applicationsLastWeek = 0,
  hiresThisWeek = 0,
  openRoles = 0,
  topJobs = [],
  staleCandidates = [],
  dashboardUrl = "https://dsohire.com/employer/reports",
  unsubscribeUrl,
}: WeeklyDigestProps) {
  const delta = applicationsThisWeek - applicationsLastWeek;
  const deltaLabel =
    delta === 0
      ? "flat week-over-week"
      : delta > 0
        ? `+${delta} vs last week`
        : `${delta} vs last week`;

  return (
    <Layout previewText={`${dsoName} · ${applicationsThisWeek} apps · ${hiresThisWeek} hire${hiresThisWeek === 1 ? "" : "s"} this week`}>
      <Text style={eyebrow}>Weekly digest · {weekRangeLabel}</Text>
      <Heading style={heading}>
        {applicationsThisWeek === 0 && hiresThisWeek === 0
          ? `A quiet week at ${dsoName}.`
          : `${dsoName} · this week`}
      </Heading>
      <Text style={paragraph}>
        Hi {recipientFirstName} — here&apos;s how hiring moved at{" "}
        <strong style={strong}>{dsoName}</strong>{" "}over the past 7 days.
      </Text>

      <Section style={tilesRow}>
        <Section style={tile}>
          <Text style={tileLabel}>Apps</Text>
          <Text style={tileValue}>{applicationsThisWeek}</Text>
          <Text style={tileSecondary}>{deltaLabel}</Text>
        </Section>
        <Section style={tile}>
          <Text style={tileLabel}>Hires</Text>
          <Text style={tileValue}>{hiresThisWeek}</Text>
          <Text style={tileSecondary}>this week</Text>
        </Section>
        <Section style={tile}>
          <Text style={tileLabel}>Open roles</Text>
          <Text style={tileValue}>{openRoles}</Text>
          <Text style={tileSecondary}>currently active</Text>
        </Section>
      </Section>

      {topJobs.length > 0 && (
        <Section style={listSection}>
          <Text style={sectionTitle}>Top jobs this week</Text>
          {topJobs.map((job) => (
            <Text key={job.url} style={listRow}>
              <a href={job.url} style={inlineLinkBold}>
                {job.title}
              </a>{" "}
              <span style={listMeta}>· {job.apps_this_week} apps</span>
            </Text>
          ))}
        </Section>
      )}

      {staleCandidates.length > 0 && (
        <Section style={listSection}>
          <Text style={sectionTitle}>
            Candidates sitting more than 14 days
          </Text>
          <Text style={smallParagraph}>
            Worth a nudge — the longer an applicant waits, the more
            likely they accept somewhere else.
          </Text>
          {staleCandidates.map((c) => (
            <Text key={c.url} style={listRow}>
              <a href={c.url} style={inlineLinkBold}>
                {c.name}
              </a>{" "}
              <span style={listMeta}>
                · {c.job_title} · {c.stage_label} · {c.days_in_stage}d
              </span>
            </Text>
          ))}
        </Section>
      )}

      <Section style={buttonWrap}>
        <PrimaryButton href={dashboardUrl}>
          Open the dashboard
        </PrimaryButton>
      </Section>

      <Text style={smallParagraph}>
        You&apos;re receiving this because you&apos;re an owner or admin on{" "}
        {dsoName}.{" "}
        {unsubscribeUrl ? (
          <>
            <a href={unsubscribeUrl} style={inlineLink}>
              Unsubscribe from weekly digests
            </a>{" "}
            or manage all{" "}
            <a
              href={`${brand.siteUrl}/employer/settings/notifications`}
              style={inlineLink}
            >
              notification preferences
            </a>
            .
          </>
        ) : (
          <>
            To unsubscribe from weekly digests, update your{" "}
            <a
              href={`${brand.siteUrl}/employer/settings/notifications`}
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

export default WeeklyDigest;

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

const strong = {
  fontWeight: 700,
  color: brand.ink,
};

const tilesRow = {
  display: "table" as const,
  width: "100%",
  borderCollapse: "collapse" as const,
  margin: "8px 0 28px",
};

const tile = {
  display: "table-cell" as const,
  width: "33.33%",
  backgroundColor: brand.cream,
  borderLeft: `3px solid ${brand.heritage}`,
  padding: "14px 18px",
  verticalAlign: "top" as const,
};

const tileLabel = {
  color: brand.heritageDeep,
  fontSize: "9px",
  fontWeight: 700,
  letterSpacing: "1.5px",
  textTransform: "uppercase" as const,
  margin: "0 0 6px",
};

const tileValue = {
  color: brand.ink,
  fontSize: "26px",
  fontWeight: 800,
  letterSpacing: "-0.6px",
  lineHeight: "1",
  margin: "0 0 4px",
};

const tileSecondary = {
  color: brand.slate,
  fontSize: "11px",
  margin: "0",
};

const listSection = {
  margin: "24px 0",
  padding: "0",
};

const sectionTitle = {
  color: brand.heritageDeep,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  margin: "0 0 8px",
};

const listRow = {
  color: brand.ink,
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 4px",
};

const listMeta = {
  color: brand.slate,
};

const buttonWrap = {
  margin: "28px 0 8px",
};

const smallParagraph = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "0 0 16px",
};

const inlineLink = {
  color: brand.heritageDeep,
  textDecoration: "underline",
};

const inlineLinkBold = {
  color: brand.ink,
  textDecoration: "underline",
  fontWeight: 700,
};
