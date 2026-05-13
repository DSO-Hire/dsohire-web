/**
 * OfferLetter — sent to a candidate when a DSO recruiter dispatches a
 * templated offer letter (Phase 5A Track E + Track E completion).
 *
 * The body markdown was pre-rendered to HTML upstream by
 * `src/lib/offer-letters/merge.ts`. This component wraps that HTML
 * fragment in the canonical DSO Hire navy/ivory chrome and frames it
 * with a CTA that lands the candidate on /o/[token] for a structured
 * Accept / Decline.
 *
 * Track E completion changes (2026-05-12):
 *   • Replaced the "reply to this email directly" copy (which lied —
 *     From is no-reply@). Email now wraps with a "Review and respond"
 *     CTA pointing at the tokenized response page.
 *   • Adds Quick-Reply pre-tokenized links (Accept / Decline) below
 *     the main CTA so candidates who know their answer get a one-tap
 *     affordance — but still land on the response page for a final
 *     confirm tap and audit-grade signal capture.
 *
 * Use:
 *   import { OfferLetter } from '@/emails/employer/OfferLetter';
 *   await sendEmail({
 *     to: candidateEmail,
 *     subject: `Offer from ${dsoName}`,
 *     template: 'employer.offer_letter',
 *     replyTo: 'info@dsohire.com',
 *     react: <OfferLetter ... />,
 *   });
 */

import { Heading, Link, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

interface OfferLetterProps {
  /** Candidate's first name for the salutation. */
  candidateFirstName?: string;
  /** DSO name for the eyebrow + closing line. */
  dsoName?: string;
  /** Job title for the preview-text line. */
  jobTitle?: string;
  /** Sender's display name (e.g., "Sara Chen") — appears in the closing. */
  senderName?: string | null;
  /** Pre-rendered HTML fragment from `renderTemplate()`. Already escaped. */
  bodyHtml: string;
  /** Tokenized response page — /o/{token}. Renders the primary CTA. */
  responseUrl?: string;
  /** Pre-selected accept link — /o/{token}?choice=accept. */
  quickAcceptUrl?: string;
  /** Pre-selected decline link — /o/{token}?choice=decline. */
  quickDeclineUrl?: string;
}

export function OfferLetter({
  candidateFirstName = "there",
  dsoName = "a DSO Hire employer",
  jobTitle = "an open role",
  senderName = null,
  bodyHtml,
  responseUrl,
  quickAcceptUrl,
  quickDeclineUrl,
}: OfferLetterProps) {
  return (
    <Layout
      previewText={`${dsoName} has an offer for you${jobTitle ? ` — ${jobTitle}` : ""}`}
    >
      <Text style={eyebrow}>Offer letter</Text>
      <Heading style={heading}>Hi {candidateFirstName} —</Heading>

      <Text style={paragraph}>
        We&apos;re excited to extend the offer below from{" "}
        <strong style={strong}>{dsoName}</strong>. Please take a few minutes
        to review.
      </Text>

      {/* ── The actual offer letter body ── */}
      <Section style={bodyCard}>
        <div
          style={bodyCardInner}
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </Section>

      {/* ── Response CTA ── */}
      {responseUrl && (
        <Section style={ctaCard}>
          <Text style={ctaLabel}>Your response</Text>
          <Text style={ctaCopy}>
            When you&apos;re ready, click below to accept or decline. You can
            type a short reason if you decline — it&apos;s optional and goes
            only to {dsoName}.
          </Text>
          <Section style={buttonWrap}>
            <PrimaryButton href={responseUrl}>
              Review and respond
            </PrimaryButton>
          </Section>
          {(quickAcceptUrl || quickDeclineUrl) && (
            <Text style={quickReplyRow}>
              Or jump straight to:{" "}
              {quickAcceptUrl && (
                <Link href={quickAcceptUrl} style={quickReplyLink}>
                  Accept
                </Link>
              )}
              {quickAcceptUrl && quickDeclineUrl && (
                <span style={quickReplyDivider}> · </span>
              )}
              {quickDeclineUrl && (
                <Link href={quickDeclineUrl} style={quickReplyLink}>
                  Decline
                </Link>
              )}
            </Text>
          )}
        </Section>
      )}

      <Text style={paragraph}>
        Questions about anything in the offer? Reply to this email and{" "}
        {senderName ? <strong style={strong}>{senderName}</strong> : "the hiring team"}{" "}
        will follow up. If you can&apos;t click the button, paste this link
        into your browser:{" "}
        {responseUrl && (
          <Link href={responseUrl} style={inlineLink}>
            {responseUrl}
          </Link>
        )}
      </Text>

      <Text style={smallParagraph}>
        — {senderName ?? `The ${dsoName} team`}
      </Text>
    </Layout>
  );
}

export default OfferLetter;

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

const bodyCard = {
  backgroundColor: brand.cream,
  borderLeft: `3px solid ${brand.heritage}`,
  padding: "24px 28px",
  margin: "20px 0 24px",
};

const bodyCardInner = {
  color: brand.ink,
  fontSize: "15px",
  lineHeight: "1.65",
};

const ctaCard = {
  backgroundColor: "#ffffff",
  border: `1px solid ${brand.ivoryDeep}`,
  padding: "22px 24px",
  margin: "8px 0 24px",
};

const ctaLabel = {
  color: brand.heritageDeep,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  margin: "0 0 10px",
};

const ctaCopy = {
  color: brand.ink,
  fontSize: "14px",
  lineHeight: "1.55",
  margin: "0 0 14px",
};

const buttonWrap = {
  margin: "0 0 12px",
};

const quickReplyRow = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.55",
  margin: "8px 0 0",
};

const quickReplyLink = {
  color: brand.ink,
  fontWeight: 700,
  textDecoration: "underline",
};

const quickReplyDivider = {
  color: brand.slate,
};

const inlineLink = {
  color: brand.ink,
  textDecoration: "underline",
  wordBreak: "break-all" as const,
};

const smallParagraph = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "16px 0 0",
};
