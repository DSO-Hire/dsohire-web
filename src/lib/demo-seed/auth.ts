/**
 * Idempotent demo auth-user provisioning. Demo accounts must survive a reset
 * (stable credentials), so we NEVER delete auth users in the wipe — instead we
 * look each one up by email and reuse its id, refreshing password + metadata.
 *
 * EVERY seeded candidate gets a real auth user: the candidates_auth_or_guest
 * check forces an auth-less candidate to be is_guest=true, and discovery /
 * talent-pool / sequences all filter is_guest=false — so a discoverable demo
 * candidate MUST be a registered (non-guest) account. The two "login"
 * candidates (Maria, Jordan) get the shared demo password; the rest are
 * passwordless profile accounts (they exist only to be discoverable).
 */

import { DEMO_EMAIL_DOMAIN, DEMO_PASSWORD, SEED_BATCH, SEED_BATCH_KEY, type Supa } from "./constants";

export interface DemoLoginSpec {
  local: string; // full email = `${local}@demo.dsohire.com`
  fullName: string;
  kind: "employer" | "candidate";
  tierOrRole: string;
}

export interface ProvisionedLogin extends DemoLoginSpec {
  email: string;
  authUserId: string;
}

export function demoEmail(local: string): string {
  return `${local}@${DEMO_EMAIL_DOMAIN}`;
}

/** Page through every auth user → map email(lowercased) → id. */
export async function loadAuthUserMap(supa: Supa): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 1;
  for (;;) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`[demo-seed] listUsers failed: ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) if (u.email) map.set(u.email.toLowerCase(), u.id);
    if (users.length < 1000) break;
    page += 1;
  }
  return map;
}

/**
 * Ensure one auth user exists with the given email. Reuses an existing user
 * (refreshing password when provided + metadata), else creates. Updates `map`.
 */
export async function ensureAuthUser(
  supa: Supa,
  map: Map<string, string>,
  email: string,
  password: string | null,
  metadata: Record<string, unknown>
): Promise<string> {
  const found = map.get(email.toLowerCase());
  if (found) {
    const { error } = await supa.auth.admin.updateUserById(found, {
      ...(password ? { password } : {}),
      user_metadata: metadata,
      email_confirm: true,
    });
    if (error) throw new Error(`[demo-seed] updateUser ${email} failed: ${error.message}`);
    return found;
  }
  const { data, error } = await supa.auth.admin.createUser({
    email,
    ...(password ? { password } : {}),
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data?.user) {
    throw new Error(`[demo-seed] createUser ${email} failed: ${error?.message ?? "no user"}`);
  }
  map.set(email.toLowerCase(), data.user.id);
  return data.user.id;
}

/** Provision the named LOGIN accounts (employers + the two candidate logins). */
export async function ensureDemoAuthUsers(
  supa: Supa,
  map: Map<string, string>,
  specs: DemoLoginSpec[]
): Promise<ProvisionedLogin[]> {
  const out: ProvisionedLogin[] = [];
  for (const spec of specs) {
    const email = demoEmail(spec.local);
    const authUserId = await ensureAuthUser(supa, map, email, DEMO_PASSWORD, {
      full_name: spec.fullName,
      [SEED_BATCH_KEY]: SEED_BATCH,
      role_during_signup: spec.kind,
    });
    out.push({ ...spec, email, authUserId });
  }
  return out;
}
