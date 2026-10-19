"use client";

import { useEffect } from "react";

export type CrmPrefValues = { density: "comfortable" | "compact"; motion: "full" | "reduced" };

export const CRM_PREFS_KEY = "dsohire-crm-prefs";
export const CRM_PREFS_DEFAULT: CrmPrefValues = { density: "comfortable", motion: "full" };

export function readPrefs(): CrmPrefValues {
  try {
    const raw = localStorage.getItem(CRM_PREFS_KEY);
    if (!raw) return CRM_PREFS_DEFAULT;
    return { ...CRM_PREFS_DEFAULT, ...(JSON.parse(raw) as Partial<CrmPrefValues>) };
  } catch {
    return CRM_PREFS_DEFAULT;
  }
}

export function applyPrefs(p: CrmPrefValues) {
  const root = document.querySelector<HTMLElement>(".crm-root");
  if (!root) return;
  root.dataset.density = p.density;
  root.dataset.motion = p.motion;
}

export function savePrefs(p: CrmPrefValues) {
  try {
    localStorage.setItem(CRM_PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private windows etc.: prefs just do not persist */
  }
  applyPrefs(p);
}

/* Mounted once in the app layout so stored prefs apply on every page.
   localStorage applies first (no flash), then the account's saved prefs
   from Postgres win and are written back to localStorage, so a change
   made in one browser follows Cam or Dave to the next. */
export default function CrmPrefs({ server }: { server?: CrmPrefValues | null }) {
  const density = server?.density;
  const motion = server?.motion;
  useEffect(() => {
    const local = readPrefs();
    applyPrefs(local);
    if (!density || !motion) return;
    if (density !== local.density || motion !== local.motion) savePrefs({ density, motion });
  }, [density, motion]);
  return null;
}
