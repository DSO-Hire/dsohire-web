/**
 * Shared nav data for the desktop lens menus (lens-toggle.tsx) and the
 * mobile drawer (mobile-menu.tsx). One list, so the two can't drift.
 * Role pages mirror src/lib/roles/role-config.ts; add a role in both.
 */
import { PRICING_TIERS, type PricingTier } from "@/lib/stripe/prices";

export type NavItem = { href: string; label: string; meta: string };

export const CLINICAL_ROLES: NavItem[] = [
  { href: "/for-dentists", label: "Dentists", meta: "DDS / DMD" },
  { href: "/for-specialists", label: "Specialists", meta: "Endo, perio, pedo, OS, ortho" },
  { href: "/for-hygienists", label: "Hygienists", meta: "RDH" },
  { href: "/for-dental-assistants", label: "Dental assistants", meta: "DA, EFDA" },
  { href: "/for-dental-therapists", label: "Dental therapists", meta: "Expanded-scope clinical" },
  { href: "/for-dental-lab-technicians", label: "Lab technicians", meta: "CDT, dental laboratory" },
  { href: "/for-sterilization-technicians", label: "Sterilization technicians", meta: "Instrument processing" },
];

export const OFFICE_ROLES: NavItem[] = [
  { href: "/for-front-desk", label: "Front desk & TCs", meta: "Treatment coordinators, patient-facing" },
  { href: "/for-office-managers", label: "Office managers", meta: "Operations leadership" },
  { href: "/for-practice-administrators", label: "Practice administrators", meta: "Non-clinical leadership" },
  // Corporate / non-clinical seekers: part of why the lens is "Job Candidates".
  { href: "/for-corporate", label: "Corporate & support center", meta: "DSO support center roles" },
];

const TIER_META: Record<PricingTier, string> = {
  solo: "Privately-owned, 2 to 5 locations",
  growth: "Growing groups and DSOs",
  scale: "Multi-region groups",
  enterprise: "35+ practices, account manager",
};

/** Tier rows with the enforced monthly price from PRICING_TIERS. */
export const TIER_ROWS = (Object.keys(TIER_META) as PricingTier[]).map((tier) => ({
  tier,
  href: `/pricing/${tier}`,
  label: PRICING_TIERS[tier].name,
  meta: TIER_META[tier],
  price: `$${PRICING_TIERS[tier].monthlyPrice.toLocaleString("en-US")}`,
}));
