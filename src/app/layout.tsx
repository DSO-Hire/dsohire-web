import type { Metadata } from "next";
import { Manrope, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
      className={cn("h-full", "antialiased", manrope.variable, "font-sans", geist.variable)}
    >
      <body className="min-h-full flex flex-col bg-ivory text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
