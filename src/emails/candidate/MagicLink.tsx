/**
 * MagicLink (candidate) — magic-link sign-in email for job seekers.
 *
 * Sent when:
 *   - A candidate enters their email on /candidate/sign-in
 *   - A candidate applies passively (auto-creates account, this email lands)
 *
 * Use:
 *   import { CandidateMagicLink } from '@/emails/candidate/MagicLink';
 *   await resend.emails.send({
 *     from: 'no-reply@dsohire.com',
 *     to: candidate.email,
 *     subject: 'Sign in to DSO Hire',
 *     react: <CandidateMagicLink magicUrl={url} />,
 *   });
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

interface CandidateMagicLinkProps {
  magicUrl?: string;
  expiresInMinutes?: number;
}

export function CandidateMagicLink({
  magicUrl = "https://dsohire.com/candidate/auth/callback?token=preview",
  expiresInMinutes = 15,
}: CandidateMagicLinkProps) {
  return (
    <Layout previewText="Sign in to DSO Hire to track your applications">
      <Heading style={heading}>Sign in to DSO Hire</Heading>
      <Text style={paragraph}>
        Click the button below to sign in. This link expires in{" "}
        {expiresInMinutes} minutes and can only be used once.
      </Text>

      <Section style={buttonWrap}>
        <PrimaryButton href={magicUrl}>Sign in to DSO Hire</PrimaryButton>
      </Section>

      <Text style={smallParagraph}>
        Or copy and paste this URL into your browser:
      </Text>
      <Text style={urlPreview}>{magicUrl}</Text>

      <Text style={paragraph}>
        Didn&apos;t request this? You can safely ignore this email — your account is
        only accessed when someone clicks a sign-in link.
      </Text>
    </Layout>
  );
}

export default CandidateMagicLink;

/* ───── styles ───── */

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
  margin: "0 0 16px",
};

const smallParagraph = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "24px 0 4px",
};

const buttonWrap = {
  margin: "28px 0",
};

const urlPreview = {
  color: brand.slate,
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "0 0 24px",
  wordBreak: "break-all" as const,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};
