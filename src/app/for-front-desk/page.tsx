import { RolePage } from "@/components/marketing/role-page";
import { ROLE_BY_SLUG } from "@/lib/roles/role-config";
import type { Metadata } from "next";

const config = ROLE_BY_SLUG["front-desk"];

export const metadata: Metadata = {
  title: `For ${config.label}`,
  description: config.metaDescription,
};

export default function ForFrontDeskPage() {
  return <RolePage config={config} />;
}
