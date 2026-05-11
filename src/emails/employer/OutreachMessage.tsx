/**
 * OutreachMessage (employer → candidate) — Phase 5D Day 2.
 *
 * Sent when a DSO recruiter messages a candidate from the talent
 * pool. Reply-to is set to the recruiter's email so the candidate
 * can respond directly.
 *
 * Brand-styled but intentionally less ornate than the application
 * confirmation emails — outreach should read like a thoughtful
 * person sent it, not a marketing blast.
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { brand } from "../lib/brand";

export interface OutreachMessageProps {
  candidateFirstName?: string | null;
  dsoName?: string;
  senderName?: string | null;
  subject?: string;
  body?: string;
  siteUrl?: string;
}

export function OutreachMessage({
  candidateFirstName = null,
  dsoName = "A practice",
  senderName = null,
  subject = "",
  body = "",
  siteUrl = "https://www.dsohire.com",
}: OutreachMessageProps) {
  const greeting = candidateFirstName ? `Hi ${candidateFirstName} —` : "Hi —";

  // Split body into paragraphs on blank lines so the email keeps
  // reasonable spacing instead of one massive run-on block.
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <Layout previewText={subject || `${dsoName} reached out via DSO Hire`}>
      <Text style={eyebrow}>Outreach from {dsoName}</Text>
      <Heading style={heading}>{greeting}</Heading>

      {paragraphs.length === 0 ? (
        <Text style={paragraph}>{body}</Text>
      ) : (
        paragraphs.map((p, i) => (
          <Text key={i} style={paragraph}>
            {p}
          </Text>
        ))
      )}

      {senderName && (
        <Text style={signature}>
          — {senderName}
          <br />
          {dsoName}
        </Text>
      )}

      <Section style={footerWrap}>
        <Text style={footerText}>
          You&apos;re receiving this because you opted into employer
          discoverability on{" "}
          <a href={`${siteUrl}/candidate/profile`} style={inlineLink}>
            DSO Hire
          </a>
          . To stop receiving outreach, set your visibility to
          &quot;Hidden&quot; in{" "}
          <a href={`${siteUrl}/candidate/profile`} style={inlineLink}>
            your profile
          </a>
          .
        </Text>
        <Text style={footerText}>
          Replies to this email go directly to the sender.
        </Text>
      </Section>
    </Layout>
  );
}

export default OutreachMessage;

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
  fontSize: "20px",
  fontWeight: 800,
  letterSpacing: "-0.4px",
  lineHeight: "1.3",
  margin: "0 0 20px",
};

const paragraph = {
  color: brand.ink,
  fontSize: "15px",
  lineHeight: "1.65",
  margin: "0 0 16px",
  whiteSpace: "pre-wrap" as const,
};

const signature = {
  color: brand.ink,
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "28px 0 12px",
  fontStyle: "italic" as const,
};

const footerWrap = {
  marginTop: "32px",
  paddingTop: "18px",
  borderTop: `1px solid ${brand.ivoryDeep}`,
};

const footerText = {
  color: brand.slate,
  fontSize: "11px",
  lineHeight: "1.6",
  margin: "0 0 8px",
};

const inlineLink = {
  color: brand.heritageDeep,
  textDecoration: "underline",
};
