/**
 * Layout — shared frame for every transactional email.
 *
 * Wraps any template in the canonical DSO Hire shell:
 *   navy header strip → ivory body → small navy footer.
 *
 * Use as:
 *   <Layout previewText="Your application was received">
 *     <YourEmailContent />
 *   </Layout>
 */

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { brand } from "../lib/brand";
import { ReactNode } from "react";

interface LayoutProps {
  previewText: string;
  children: ReactNode;
}

export function Layout({ previewText, children }: LayoutProps) {
  return (
    <Html>
      <Head>
        {/* Force light-mode rendering. Without these, Apple Mail / Gmail
            auto-invert our ivory background to a muddy brown and break the
            navy header. Opt out of forced dark mode entirely. */}
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={main}>
        {/* ─── Header strip ─── */}
        <Section style={header}>
          <Container style={headerContainer}>
            <Img
              src={brand.logoLockupOnDark}
              width="156"
              height="56"
              alt="DSO Hire"
              style={brandLogo}
            />
          </Container>
        </Section>

        {/* ─── Content ─── */}
        <Container style={content}>{children}</Container>

        {/* ─── Footer ─── */}
        <Section style={footer}>
          <Container style={footerContainer}>
            <Hr style={footerRule} />
            <Text style={footerText}>
              DSO Hire · The job board built for mid-market Dental Support Organizations.
            </Text>
            <Text style={footerSmall}>
              <Link href={brand.siteUrl} style={footerLink}>
                dsohire.com
              </Link>
              {" · "}
              <Link href={`mailto:${brand.supportEmail}`} style={footerLink}>
                {brand.supportEmail}
              </Link>
            </Text>
            <Text style={footerSmall}>
              © {new Date().getFullYear()} DSO Hire LLC · Kansas
            </Text>
          </Container>
        </Section>
      </Body>
    </Html>
  );
}

/* ───────── styles ───────── */

const main = {
  backgroundColor: "#FFFFFF",
  fontFamily: brand.fontFamily,
  margin: 0,
  padding: 0,
};

const header = {
  backgroundColor: brand.ink,
  padding: "24px 0",
};

const headerContainer = {
  maxWidth: brand.maxWidth,
  margin: "0 auto",
  padding: `0 ${brand.contentPadding}`,
};

const brandLogo = {
  display: "block",
  margin: 0,
  // Cap rendered size for retina + non-retina; image's intrinsic 4x doubles for
  // sharp display.
  height: "auto",
  maxWidth: "156px",
};

const content = {
  maxWidth: brand.maxWidth,
  margin: "0 auto",
  padding: `40px ${brand.contentPadding} 32px`,
  backgroundColor: "#FFFFFF",
};

const footer = {
  backgroundColor: "#FFFFFF",
  padding: `0 0 32px`,
};

const footerContainer = {
  maxWidth: brand.maxWidth,
  margin: "0 auto",
  padding: `0 ${brand.contentPadding}`,
};

const footerRule = {
  borderColor: "rgba(20, 35, 63, 0.08)",
  borderStyle: "solid",
  borderWidth: "1px 0 0 0",
  margin: "24px 0 16px",
};

const footerText = {
  color: brand.slate,
  fontSize: "12px",
  lineHeight: "1.6",
  margin: "0 0 8px",
};

const footerSmall = {
  color: brand.slateMeta,
  fontSize: "11px",
  lineHeight: "1.6",
  letterSpacing: "0.3px",
  margin: "0 0 4px",
};

const footerLink = {
  color: brand.slate,
  textDecoration: "underline",
};
