import { RolePage } from "@/components/marketing/role-page";
import { ROLE_BY_SLUG } from "@/lib/roles/role-config";
import type { Metadata } from "next";

const config = ROLE_BY_SLUG["dental-lab-technicians"];

export const metadata: Metadata = {
  title: `For ${config.label}`,
  description: config.metaDescription,
};

export default function ForDentalLabTechniciansPage() {
  return <RolePage config={config} />;
}
