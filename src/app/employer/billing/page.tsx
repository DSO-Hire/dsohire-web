import { EmployerShell } from "@/components/employer/employer-shell";
import { ComingSoon } from "@/components/employer/coming-soon";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage() {
  return (
    <EmployerShell active="billing">
      <ComingSoon
        title="Billing & subscription"
        blurb="Current tier, next invoice, payment method, upgrade/downgrade, cancel. Powered by Stripe Customer Portal embedded inline."
        phase="Phase 2 Week 5"
      />
    </EmployerShell>
  );
}
