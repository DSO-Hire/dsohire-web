/**
 * SupportRequest — internal-only email to support@dsohire.com when a
 * user fires the in-app SupportDrawer. NOT sent to customers; just to
 * Cam (or whoever is on support@) with the context block already
 * gathered so triage is fast.
 *
 * Reply-To header on the parent send is set to the author's email, so
 * a direct reply from the inbox goes straight to the user.
 */

import { Heading, Section, Text, Link as EmailLink } from "@react-email/components";
import { Layout } from "./components/Layout";
import { brand } from "./lib/brand";

interface RecentEvent {
  event_kind: string;
  summary: string;
  created_at: string;
}

interface SupportRequestProps {
  authorEmail: string;
  authorName: string;
  dsoName: string;
  role: string;
  tier: string;
  pageUrl: string;
  pageTitle: string | null;
  body: string;
  recentEvents: RecentEvent[];
  requestId: string;
  adminUrl: string;
}

export function SupportRequest({
  authorEmail = "user@example.com",
  authorName = "User",
  dsoName = "Sample DSO",
  role = "owner",
  tier = "solo",
  pageUrl = "https://dsohire.com",
  pageTitle = null,
  body = "I need help with…",
  recentEvents = [],
  requestId = "00000000-0000-0000-0000-000000000000",
  adminUrl = "https://dsohire.com/admin/support",
}: SupportRequestProps) {
  return (
    <Layout previewText={`Support request from ${authorName}`}>
      <Text style={eyebrow}>New support request</Text>
      <Heading style={heading}>
        {authorName} — {dsoName}
      </Heading>

      <Section style={metaSection}>
        <Text style={metaRow}>
          <strong style={metaLabel}>From:</strong>{" "}
          <EmailLink href={`mailto:${authorEmail}`} style={inlineLink}>
            {authorEmail}
          </EmailLink>
        </Text>
        <Text style={metaRow}>
          <strong style={metaLabel}>Role:</strong> {role}
        </Text>
        <Text style={metaRow}>
          <strong style={metaLabel}>Tier:</strong> {tier}
        </Text>
        <Text style={metaRow}>
          <strong style={metaLabel}>Page:</strong>{" "}
          <EmailLink href={pageUrl} style={inlineLink}>
            {pageTitle ?? pageUrl}
          </EmailLink>
        </Text>
        <Text style={metaRow}>
          <strong style={metaLabel}>Request ID:</strong>{" "}
          <code style={codeText}>{requestId}</code>
        </Text>
      </Section>

      <Heading as="h2" style={sectionHeading}>
        Message
      </Heading>
      <Section style={bodySection}>
        <Text style={bodyText}>{body}</Text>
      </Section>

      {recentEvents.length > 0 && (
        <>
          <Heading as="h2" style={sectionHeading}>
            Recent activity
          </Heading>
          <Section style={eventsSection}>
            {recentEvents.map((e, i) => (
              <Text key={i} style={eventRow}>
                <code style={codeText}>{e.event_kind}</code> —{" "}
                {e.summary}{" "}
                <span style={metaLabel}>
                  ({new Date(e.created_at).toLocaleString()})
                </span>
              </Text>
            ))}
          </Section>
        </>
      )}

      <Text style={footerText}>
        Reply to this email and the user gets it directly (reply-to set
        to {authorEmail}). Manage in the{" "}
        <EmailLink href={adminUrl} style={inlineLink}>
          support admin
        </EmailLink>{" "}
        once it&apos;s wired up.
      </Text>
    </Layout>
  );
}

export default SupportRequest;

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
  margin: "0 0 20px",
};

const sectionHeading = {
  color: brand.ink,
  fontSize: "14px",
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: "1.5px",
  margin: "24px 0 8px",
};

const metaSection = {
  backgroundColor: brand.cream,
  borderLeft: `3px solid ${brand.heritage}`,
  padding: "12px 16px",
  margin: "0 0 16px",
};

const metaRow = {
  margin: "0 0 4px",
  fontSize: "13px",
  color: brand.ink,
  lineHeight: "1.5",
};

const metaLabel = {
  color: brand.slate,
  fontWeight: 600,
};

const bodySection = {
  backgroundColor: "#FFFFFF",
  border: `1px solid ${brand.ivoryDeep}`,
  padding: "14px 16px",
  margin: "0 0 16px",
};

const bodyText = {
  color: brand.ink,
  fontSize: "14px",
  lineHeight: "1.6",
  margin: 0,
  whiteSpace: "pre-wrap" as const,
};

const eventsSection = {
  backgroundColor: brand.cream,
  padding: "10px 14px",
  margin: "0 0 24px",
};

const eventRow = {
  margin: "0 0 4px",
  fontSize: "12px",
  color: brand.ink,
  lineHeight: "1.5",
};

const codeText = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "11px",
  color: brand.heritageDeep,
};

const inlineLink = {
  color: brand.heritageDeep,
  fontWeight: 600,
  textDecoration: "underline",
};

const footerText = {
  color: brand.slate,
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "16px 0 0",
};
