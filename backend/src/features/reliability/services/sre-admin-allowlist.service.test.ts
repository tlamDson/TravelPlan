import { describe, it, expect, vi, beforeEach } from "vitest";

describe("isSreAdminEmail", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns false for a null/undefined email", async () => {
    vi.doMock("../../../config/env", () => ({
      env: { SRE_ADMIN_EMAILS: "", NODE_ENV: "production" },
    }));
    const { isSreAdminEmail } = await import("./sre-admin-allowlist.service");
    expect(isSreAdminEmail(null)).toBe(false);
    expect(isSreAdminEmail(undefined)).toBe(false);
  });

  it("empty allowlist in production means nobody is admin", async () => {
    vi.doMock("../../../config/env", () => ({
      env: { SRE_ADMIN_EMAILS: "", NODE_ENV: "production" },
    }));
    const { isSreAdminEmail } = await import("./sre-admin-allowlist.service");
    expect(isSreAdminEmail("anyone@example.com")).toBe(false);
  });

  it("empty allowlist outside production allows everyone (local convenience) — same semantics as VIP_EMAILS", async () => {
    vi.doMock("../../../config/env", () => ({
      env: { SRE_ADMIN_EMAILS: "", NODE_ENV: "development" },
    }));
    const { isSreAdminEmail } = await import("./sre-admin-allowlist.service");
    expect(isSreAdminEmail("anyone@example.com")).toBe(true);
  });

  it("matches a listed email case-insensitively", async () => {
    vi.doMock("../../../config/env", () => ({
      env: { SRE_ADMIN_EMAILS: "you@example.com", NODE_ENV: "production" },
    }));
    const { isSreAdminEmail } = await import("./sre-admin-allowlist.service");
    expect(isSreAdminEmail("You@Example.com")).toBe(true);
  });

  it("rejects an email not on a non-empty allowlist, even outside production", async () => {
    vi.doMock("../../../config/env", () => ({
      env: { SRE_ADMIN_EMAILS: "you@example.com", NODE_ENV: "development" },
    }));
    const { isSreAdminEmail } = await import("./sre-admin-allowlist.service");
    expect(isSreAdminEmail("stranger@example.com")).toBe(false);
  });
});
