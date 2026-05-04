/**
 * CommentMention (employer) — fires when a teammate @-mentions someone on
 * an application's internal comment thread.
 *
 * Sent to each newly-added mentioned_user_id on insert + on edits that add
 * a mention not previously present (idempotent re-mention guard lives in
 * comments-actions.ts).
 *
 * Use:
 *   import { CommentMention } from '@/emails/employer/CommentMention';
 *   await sendEmail({
 *     to: recipientEmail,
 *     subject: `${authorName} mentioned you on ${candidateName}`,
 *     template: 'employer.comment_mention',
 *     react: <CommentMention ... />,
 *   });
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

interface CommentMentionProps {
  recipientName?: string;
  authorName?: string;
  candidateName?: string;
  commentBody?: string;
  deepLink?: string;
}

const EXCERPT_LIMIT = 320;

function excerpt(body: string): string {
  if (body.length <= EXCERPT_LIMIT) return body;
  return `${body.slice(0, EXCERPT_LIMIT).trimEnd()}…`;
}

export function CommentMention({
  recipientName = "there",
  authorName = "A teammate",
  candidateName = "a candidate",
  commentBody = "",
  deepLink = "https://dsohire.com/employer/applications/preview",
}: CommentMentionProps) {
  return (
    <Layout
      previewText={`${authorName} mentioned you on ${candidateName}`}
    >
      <Text style={eyebrow}>You were mentioned</Text>
      <Heading style={heading}>Hi {recipientName} —</Heading>
      <Text style={paragraph}>
        <strong style={strong}>{authorName}</strong> mentioned you in a
        comment on{" "}
        <strong style={strong}>{candidateName}</strong>&apos;s application.
      </Text>

      <Section style={cardSection}>
        <Text style={cardLabel}>Comment</Text>
        <Text style={cardCopy}>{excerpt(commentBody)}</Text>

        <Section style={buttonWrap}>
          <PrimaryButton href={deepLink}>View comment</PrimaryButton>
        </Section>
      </Section>

      <Text style={smallParagraph}>
        Reply directly in the comment thread to keep the conversation in
        one place. Internal comments are visible to your team only — never
        to candidates.
      </Text>
    </Layout>
  );
}

export default CommentMention;

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

const smallParagraph = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "20px 0 0",
};
