/**
 * CredentialExpiryDigest (employer) — #9d.
 *
 * Weekly heads-up listing hired/active candidates whose licenses or certs are
 * expired or expiring within 30 days. Sent via /api/cron/credential-expiry to
 * owner/admin users. Suppressed when a DSO has nothing urgent.
 *
 * Reuses Layout + PrimaryButton + brand styles (mirrors WeeklyDigest).
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

export interface CredentialExpiryItem {
  candidateName: string;
  credentialLabel: string;
  /** e.g. "Expired 4 days ago" / "Expires in 12 days". */
  expiryText: string;
  /** True = already expired (renders red); false = expiring soon (amber). */
  expired: boolean;
  /** Deep link to the candidate's hire-readiness section. */
  url: string;
}

export interface CredentialExpiryDigestProps {
  recipientFirstName?: string;
  dsoName?: string;
  items?: CredentialExpiryItem[];
  dashboardUrl?: string;
  unsubscribeUrl?: string;
}

export function CredentialExpiryDigest({
  recipientFirstName = "there",
  dsoName = "your DSO",
  items = [],
  dashboardUrl = "https://dsohire.com/employer/dashboard#credentials-expiring",
  unsubscribeUrl,
}: CredentialExpiryDigestProps) {
  const expiredCount = items.filter((i) => i.expired).length;
  const soonCount = items.length - expiredCount;

  return (
    <Layout
      previewText={`${items.length} credential${items.length === 1 ? "" : "s"} need attention at ${dsoName}`}
    >
      <Text style={eyebrow}>Credential alert</Text>
      <Heading style={heading}>
        {items.length} credential{items.length === 1 ? "" : "s"} need attention
      </Heading>
      <Text style={paragraph}>
        Hi {recipientFirstName} — these licenses and certifications for people
        you&apos;re hiring or have hired at{" "}
        <strong style={strong}>{dsoName}</strong> are expired or expiring soon.
        A current credential on file keeps you compliant and patient-ready.
      </Text>

      <Section style={tilesRow}>
        <Section style={tile}>
          <Text style={tileLabel}>Expired</Text>
          <Text style={tileValue}>{expiredCount}</Text>
        </Section>
        <Section style={tile}>
          <Text style={tileLabel}>Expiring ≤30d</Text>
          <Text style={tileValue}>{soonCount}</Text>
        </Section>
      </Section>

      <Section style={listSection}>
        {items.map((it, i) => (
          <Text key={`${it.url}-${i}`} style={listRow}>
            <a href={it.url} style={inlineLinkBold}>
              {it.candidateName}
            </a>{" "}
            <span style={listMeta}>· {it.credentialLabel} · </span>
            <span style={it.expired ? metaExpired : metaSoon}>
              {it.expiryText}
            </span>
          </Text>
        ))}
      </Section>

      <Section style={buttonWrap}>
        <PrimaryButton href={dashboardUrl}>
          Review credentials
        </PrimaryButton>
      </Section>

      <Text style={smallParagraph}>
        You&apos;re receiving this because you&apos;re an owner or admin on{" "}
        {dsoName}.{" "}
        {unsubscribeUrl ? (
          <>
            <a href={unsubscribeUrl} style={inlineLink}>
              Unsubscribe from credential alerts
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
            To change this, update your{" "}
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

export default CredentialExpiryDigest;

/* ───── styles (mirrors WeeklyDigest) ───── */

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
  width: "50%",
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
  margin: "0",
};

const listSection = {
  margin: "24px 0",
  padding: "0",
};

const listRow = {
  color: brand.ink,
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 6px",
};

const listMeta = {
  color: brand.slate,
};

const metaExpired = {
  color: "#b91c1c",
  fontWeight: 700,
};

const metaSoon = {
  color: "#b45309",
  fontWeight: 700,
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
