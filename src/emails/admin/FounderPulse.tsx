/**
 * FounderPulse — the founder-only Vantage digest email (build spec §7 / Phase 4).
 *
 * Sent to Cam only (superadmin allowlist) by /api/cron/founder-pulse. Contentless
 * + aggregate: traffic, top channels, sign-ups, and funnel movement WoW. No PII,
 * no candidate identity — same firewall as the rest of Vantage.
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { brand } from "../lib/brand";

export interface FounderPulseChannel {
  channel: string;
  visitors: number;
}

export interface FounderPulseProps {
  rangeLabel?: string;
  cadence?: "weekly" | "daily";
  visitors?: number;
  visitorsPrev?: number;
  pageviews?: number;
  employerSignups?: number;
  candidateSignups?: number;
  paid?: number;
  topChannels?: FounderPulseChannel[];
  dashboardUrl?: string;
}

function delta(now: number, prev: number): string {
  const d = now - prev;
  if (d === 0) return "flat WoW";
  return d > 0 ? `+${d} WoW` : `${d} WoW`;
}

export function FounderPulse({
  rangeLabel = "this week",
  cadence = "weekly",
  visitors = 0,
  visitorsPrev = 0,
  pageviews = 0,
  employerSignups = 0,
  candidateSignups = 0,
  paid = 0,
  topChannels = [],
  dashboardUrl = "https://dsohire.com/admin/analytics",
}: FounderPulseProps) {
  return (
    <Layout
      previewText={`Vantage · ${visitors} visitors · ${employerSignups + candidateSignups} signups · ${paid} paid`}
    >
      <Text style={eyebrow}>
        Vantage {cadence === "daily" ? "daily" : "weekly"} pulse · {rangeLabel}
      </Text>
      <Heading style={heading}>Your founder pulse</Heading>
      <Text style={paragraph}>
        First-party, cookieless. Here&apos;s how the business moved{" "}
        {cadence === "daily" ? "yesterday" : "over the past 7 days"}.
      </Text>

      <Section style={tilesRow}>
        <Section style={tile}>
          <Text style={tileLabel}>Visitors</Text>
          <Text style={tileValue}>{visitors}</Text>
          <Text style={tileSecondary}>{delta(visitors, visitorsPrev)}</Text>
        </Section>
        <Section style={tile}>
          <Text style={tileLabel}>Pageviews</Text>
          <Text style={tileValue}>{pageviews}</Text>
          <Text style={tileSecondary}>this period</Text>
        </Section>
        <Section style={tile}>
          <Text style={tileLabel}>Paid</Text>
          <Text style={tileValue}>{paid}</Text>
          <Text style={tileSecondary}>new subscriptions</Text>
        </Section>
      </Section>

      <Section style={tilesRow}>
        <Section style={tile}>
          <Text style={tileLabel}>Employer signups</Text>
          <Text style={tileValue}>{employerSignups}</Text>
        </Section>
        <Section style={tile}>
          <Text style={tileLabel}>Candidate signups</Text>
          <Text style={tileValue}>{candidateSignups}</Text>
        </Section>
      </Section>

      {topChannels.length > 0 && (
        <Section style={listSection}>
          <Text style={sectionTitle}>Top channels</Text>
          {topChannels.map((c) => (
            <Text key={c.channel} style={listRow}>
              <strong style={strong}>{c.channel}</strong>{" "}
              <span style={listMeta}>· {c.visitors} visitors</span>
            </Text>
          ))}
        </Section>
      )}

      <Section style={{ marginTop: "24px" }}>
        <a href={dashboardUrl} style={button}>
          Open the dashboard
        </a>
      </Section>
    </Layout>
  );
}

export default FounderPulse;

/* ───────────── styles ───────────── */

const eyebrow = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  color: brand.heritageDeep,
  margin: "0 0 8px",
};
const heading = {
  fontSize: "26px",
  fontWeight: 800,
  letterSpacing: "-0.5px",
  color: brand.ink,
  margin: "0 0 12px",
};
const paragraph = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: brand.slate,
  margin: "0 0 20px",
};
const strong = { color: brand.ink, fontWeight: 700 };
const tilesRow = {
  display: "block" as const,
  margin: "0 0 8px",
};
const tile = {
  display: "inline-block" as const,
  width: "33%",
  verticalAlign: "top" as const,
  padding: "4px 8px 12px 0",
};
const tileLabel = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "1px",
  textTransform: "uppercase" as const,
  color: brand.slateMeta,
  margin: "0 0 2px",
};
const tileValue = {
  fontSize: "28px",
  fontWeight: 800,
  letterSpacing: "-0.5px",
  color: brand.ink,
  margin: "0",
};
const tileSecondary = {
  fontSize: "12px",
  color: brand.slateMeta,
  margin: "2px 0 0",
};
const listSection = { margin: "20px 0 0" };
const sectionTitle = {
  fontSize: "13px",
  fontWeight: 700,
  color: brand.ink,
  margin: "0 0 8px",
};
const listRow = {
  fontSize: "14px",
  color: brand.slate,
  margin: "0 0 6px",
};
const listMeta = { color: brand.slateMeta };
const button = {
  display: "inline-block",
  backgroundColor: brand.heritageDeep,
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "1px",
  textTransform: "uppercase" as const,
  textDecoration: "none",
  padding: "12px 24px",
};
