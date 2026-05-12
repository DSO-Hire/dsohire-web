/**
 * OfferLetter — sent to a candidate when a DSO recruiter dispatches a
 * templated offer letter (Phase 5A Track E).
 *
 * The body markdown was pre-rendered to HTML upstream by
 * `src/lib/offer-letters/merge.ts`. This component wraps that HTML
 * fragment in the canonical DSO Hire navy/ivory chrome and adds a
 * short framing intro + a "Reach out if you have questions" outro so
 * the email doesn't feel like a raw legal document.
 *
 * Use:
 *   import { OfferLetter } from '@/emails/employer/OfferLetter';
 *   await sendEmail({
 *     to: candidateEmail,
 *     subject: `Offer from ${dsoName}`,
 *     template: 'employer.offer_letter',
 *     react: <OfferLetter ... />,
 *   });
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
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
}

export function OfferLetter({
  candidateFirstName = "there",
  dsoName = "a DSO Hire employer",
  jobTitle = "an open role",
  senderName = null,
  bodyHtml,
}: OfferLetterProps) {
  return (
    <Layout
      previewText={`${dsoName} has an offer for you${jobTitle ? ` — ${jobTitle}` : ""}`}
    >
      <Text style={eyebrow}>Offer letter</Text>
      <Heading style={heading}>Hi {candidateFirstName} —</Heading>

      <Text style={paragraph}>
        We&apos;re excited to extend the offer below from{" "}
        <strong style={strong}>{dsoName}</strong>. Please take a few minutes to
        review.
      </Text>

      {/* ── The actual offer letter body ── */}
      <Section style={bodyCard}>
        <div
          style={bodyCardInner}
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </Section>

      <Text style={paragraph}>
        If anything needs clarification, just reply to this email —
        {senderName ? ` ${senderName} ` : " the hiring team "}
        will get right back to you.
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

const smallParagraph = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "16px 0 0",
};
