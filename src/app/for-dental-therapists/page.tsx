import { RolePage } from "@/components/marketing/role-page";
import { ROLE_BY_SLUG } from "@/lib/roles/role-config";
import type { Metadata } from "next";

const config = ROLE_BY_SLUG["dental-therapists"];

export const metadata: Metadata = {
  alternates: { canonical: "/for-dental-therapists" },
  title: `For ${config.label}`,
  description: config.metaDescription,
};

export default function ForDentalTherapistsPage() {
  return <RolePage config={config} />;
}
