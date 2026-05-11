/**
 * MessageReceived — fires when a participant on an application sends a
 * direct message to the other side (candidate ↔ DSO).
 *
 * Sent fire-and-forget after each message INSERT (not on edits). The
 * recipient is determined by the sender_role: candidate-sent messages go
 * to the DSO admin contact; employer-sent messages go to the candidate.
 *
 * Use:
 *   import { MessageReceived } from '@/emails/MessageReceived';
 *   await sendEmail({
 *     to: recipientEmail,
 *     subject: `${senderName} sent you a message about ${jobTitle}`,
 *     template: 'application.message_received',
 *     react: <MessageReceived ... />,
 *   });
 */

import { Heading, Section, Text, Link as EmailLink } from "@react-email/components";
import { Layout } from "./components/Layout";
import { PrimaryButton } from "./components/PrimaryButton";
import { brand } from "./lib/brand";

interface MessageReceivedProps {
  recipientName?: string;
  senderName?: string;
  /** "candidate" or "employer" — used to phrase the lead-in. */
  senderRole?: "candidate" | "employer";
  jobTitle?: string;
  dsoName?: string;
  candidateName?: string;
  messageBody?: string;
  deepLink?: string;
  /** Same URL — used for the small "view full message" link below the CTA. */
  fullMessageLink?: string;
}

const EXCERPT_LIMIT = 200;

function excerpt(body: string): string {
  if (body.length <= EXCERPT_LIMIT) return body;
  return `${body.slice(0, EXCERPT_LIMIT).trimEnd()}…`;
}

export function MessageReceived({
  recipientName = "there",
  senderName = "Someone",
  senderRole = "employer",
  jobTitle = "Dental Hygienist",
  dsoName = "the hiring team",
  candidateName = "the candidate",
  messageBody = "",
  deepLink = "https://dsohire.com",
  fullMessageLink,
}: MessageReceivedProps) {
  const fullLink = fullMessageLink ?? deepLink;
  const previewText = `${senderName} sent you a message about ${jobTitle}`;

  // Lead-in copy differs by sender role so the recipient knows which
  // direction the message is going.
  const leadIn =
    senderRole === "candidate" ? (
      <>
        <strong style={strong}>{senderName}</strong> sent you a message about
        their application for{" "}
        <strong style={strong}>{jobTitle}</strong>.
      </>
    ) : (
      <>
        <strong style={strong}>{senderName}</strong> at{" "}
        <strong style={strong}>{dsoName}</strong> sent you a message about
        your application for <strong style={strong}>{jobTitle}</strong>.
      </>
    );

  return (
    <Layout previewText={previewText}>
      <Text style={eyebrow}>New message</Text>
      <Heading style={heading}>Hi {recipientName} —</Heading>
      <Text style={paragraph}>{leadIn}</Text>

      <Section style={cardSection}>
        <Text style={cardLabel}>Message</Text>
        <Text style={cardCopy}>{excerpt(messageBody)}</Text>

        <Section style={buttonWrap}>
          <PrimaryButton href={deepLink}>Reply on DSO Hire</PrimaryButton>
        </Section>

        <Text style={fullLinkRow}>
          <EmailLink href={fullLink} style={inlineLink}>
            View full message →
          </EmailLink>
        </Text>
      </Section>

      <Text style={smallParagraph}>
        Replies sent on DSO Hire keep your conversation tied to the
        application so {senderRole === "candidate" ? "the hiring team" : "you"}{" "}
        can see context in one place. Please don&apos;t share medical
        information here — discuss any accommodations or health-related
        context directly with HR.
      </Text>
      {senderRole === "employer" && candidateName ? (
        <Text style={smallParagraph}>
          About: {candidateName}
        </Text>
      ) : null}
    </Layout>
  );
}

export default MessageReceived;

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

const cardCopy = {
  color: brand.ink,
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 8px",
  whiteSpace: "pre-wrap" as const,
};

const buttonWrap = {
  margin: "20px 0 4px",
};

const fullLinkRow = {
  margin: "10px 0 0",
  fontSize: "12px",
  lineHeight: "1.6",
};

const inlineLink = {
  color: brand.heritageDeep,
  fontWeight: 700,
  textDecoration: "underline",
  letterSpacing: "0.5px",
};

const smallParagraph = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "20px 0 0",
};
