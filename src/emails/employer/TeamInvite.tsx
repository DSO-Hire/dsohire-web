/**
 * TeamInvite (employer) — email a teammate an invitation to join a DSO.
 *
 * Sent when:
 *   - An owner or admin uses /employer/team to invite someone by email
 *   - Triggered server-side after the dso_invitations row is inserted
 *
 * The acceptUrl is /employer/invite/[token], which validates the token and
 * either signs the invitee in or routes them through sign-up first.
 */

import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { PrimaryButton } from "../components/PrimaryButton";
import { brand } from "../lib/brand";

interface TeamInviteProps {
  inviteeName?: string | null;
  inviterName?: string;
  dsoName?: string;
  role?: string;
  acceptUrl?: string;
  expiresInDays?: number;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  recruiter: "Recruiter",
};

export function TeamInvite({
  inviteeName,
  inviterName = "Your teammate",
  dsoName = "Your DSO",
  role = "recruiter",
  acceptUrl = "https://dsohire.com/employer/invite/preview",
  expiresInDays = 7,
}: TeamInviteProps) {
  const greeting = inviteeName ? `Hi ${inviteeName},` : "Hi there,";
  const roleLabel = ROLE_LABELS[role] ?? role;

  return (
    <Layout
      previewText={`${inviterName} invited you to join ${dsoName} on DSO Hire`}
    >
      <Text style={eyebrow}>You&apos;re invited</Text>
      <Heading style={heading}>{greeting}</Heading>
      <Text style={paragraph}>
        <strong style={strong}>{inviterName}</strong> invited you to join{" "}
        <strong style={strong}>{dsoName}</strong> on DSO Hire as a{" "}
        <strong style={strong}>{roleLabel}</strong>. Accept below to start
        managing job postings and applications with the team.
      </Text>

      <Section style={cardSection}>
        <Text style={cardLabel}>What you&apos;ll be able to do</Text>
        <Text style={cardCopy}>
          {role === "admin"
            ? "Post and edit jobs, review applications, manage practice locations, and invite additional teammates."
            : role === "recruiter"
              ? "Post and edit jobs, review applications, and move candidates through the pipeline."
              : "Manage your DSO's hiring on DSO Hire."}
        </Text>
        <Section style={buttonWrap}>
          <PrimaryButton href={acceptUrl}>Accept Invitation</PrimaryButton>
        </Section>
      </Section>

      <Text style={smallParagraph}>
        This invitation expires in {expiresInDays}{" "}
        {expiresInDays === 1 ? "day" : "days"}. If the button above
        doesn&apos;t work, paste this link into your browser:
      </Text>
      <Text style={urlPreview}>{acceptUrl}</Text>

      <Text style={smallParagraph}>
        Didn&apos;t expect this? You can safely ignore this email — no
        account is created until you click the link.
      </Text>
    </Layout>
  );
}

export default TeamInvite;

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
  lineHeight: "1.55",
  margin: "0 0 8px",
};

const buttonWrap = {
  margin: "16px 0 4px",
};

const smallParagraph = {
  color: brand.slate,
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "20px 0 8px",
};

const urlPreview = {
  color: brand.slate,
  fontSize: "12px",
  lineHeight: "1.5",
  fontFamily: "monospace",
  wordBreak: "break-all" as const,
  margin: "0 0 16px",
};
