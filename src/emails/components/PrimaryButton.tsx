/**
 * PrimaryButton — brand-styled CTA for emails.
 *
 * Navy block on ivory bg, ivory text, no rounded corners (per brand).
 * Email-safe: uses table-based layout via @react-email/components Button,
 * which renders bulletproof across Outlook, Gmail, Apple Mail.
 */

import { Button } from "@react-email/components";
import { brand } from "../lib/brand";

interface PrimaryButtonProps {
  href: string;
  children: React.ReactNode;
}

export function PrimaryButton({ href, children }: PrimaryButtonProps) {
  return (
    <Button href={href} style={primaryButton}>
      {children}
    </Button>
  );
}

const primaryButton = {
  backgroundColor: brand.ink,
  color: brand.ivory,
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "1.5px",
  textTransform: "uppercase" as const,
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "16px 32px",
  display: "inline-block",
  fontFamily: brand.fontFamily,
};
