import { env } from "../../../config/env";

function parseAdminEmails(raw: string): string[] {
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Allowlist for who can read `/api/reliability/*`. Deliberately a
 * separate env var from VIP_EMAILS (calendar-vip.service.ts) — a beta
 * tester and someone who can see internal reliability data are different
 * roles — but keeps the exact same semantics VIP_EMAILS already
 * documents (empty in production = nobody; empty outside production =
 * everyone) so there's one mental model for both allowlists in this repo.
 */
export function isSreAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const list = parseAdminEmails(env.SRE_ADMIN_EMAILS);
  if (list.length === 0) {
    return env.NODE_ENV !== "production";
  }
  return list.includes(normalized);
}
