import { RolePage } from "@/components/marketing/role-page";
import { ROLE_BY_SLUG } from "@/lib/roles/role-config";
import type { Metadata } from "next";

const config = ROLE_BY_SLUG["sterilization-technicians"];

export const metadata: Metadata = {
  alternates: { canonical: "/for-sterilization-technicians" },
  title: `For ${config.label}`,
  description: config.metaDescription,
};

export default function ForSterilizationTechniciansPage() {
  return <RolePage config={config} />;
}
