import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetEmail = vi.fn();
vi.mock("../../calendar/services/clerk-primary-email.service", () => ({
  getClerkUserPrimaryEmail: (...args: unknown[]) => mockGetEmail(...args),
}));

const mockIsSreAdminEmail = vi.fn();
vi.mock("./sre-admin-allowlist.service", () => ({
  isSreAdminEmail: (...args: unknown[]) => mockIsSreAdminEmail(...args),
}));

import { assertReliabilityAdminAccess } from "./reliability-admin-guard.service";

describe("assertReliabilityAdminAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok:false reason:no_email when Clerk has no email on file", async () => {
    mockGetEmail.mockResolvedValue(null);

    const result = await assertReliabilityAdminAccess("user-1");

    expect(result).toEqual({ ok: false, reason: "no_email" });
    expect(mockIsSreAdminEmail).not.toHaveBeenCalled();
  });

  it("returns ok:false reason:not_admin when the email isn't on the allowlist", async () => {
    mockGetEmail.mockResolvedValue("stranger@example.com");
    mockIsSreAdminEmail.mockReturnValue(false);

    const result = await assertReliabilityAdminAccess("user-1");

    expect(result).toEqual({ ok: false, reason: "not_admin" });
  });

  it("returns ok:true with the email when allowlisted", async () => {
    mockGetEmail.mockResolvedValue("you@example.com");
    mockIsSreAdminEmail.mockReturnValue(true);

    const result = await assertReliabilityAdminAccess("user-1");

    expect(result).toEqual({ ok: true, email: "you@example.com" });
  });
});
