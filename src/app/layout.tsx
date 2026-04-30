import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DSO Hire — Multi-location hiring, one flat fee.",
    template: "%s · DSO Hire",
  },
  description:
    "The job board built for mid-market Dental Support Organizations. Flat-fee, unlimited multi-location postings — no placement fees, no per-listing surcharges.",
  metadataBase: new URL("https://dsohire.com"),
  openGraph: {
    type: "website",
    siteName: "DSO Hire",
    locale: "en_US",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ivory text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
