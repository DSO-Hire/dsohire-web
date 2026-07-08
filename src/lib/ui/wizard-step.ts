"use client";

/**
 * Wizard-step signal — lets route-level chrome (the new-job launchpad hero,
 * cross-link banner, "Start from" chips) collapse once the user advances
 * past Step 1, without threading state through the 3,600-line wizard.
 * Same module-store + useSyncExternalStore pattern as floating-ui.ts.
 */

import { useSyncExternalStore } from "react";

let step = 0;
const subs = new Set<() => void>();

export function setWizardStep(n: number) {
  if (step === n) return;
  step = n;
  subs.forEach((f) => f());
}

export function useWizardStep(): number {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => step,
    () => 0
  );
}
