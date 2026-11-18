import { describe, it, expect } from "vitest";
import { entitlementOf, decideTier } from "./subscription-tier";

describe("subscription-tier — entitlementOf", () => {
  it.each(["active", "trialing", "past_due"])(
    "%s keeps or grants PRO",
    (status) => {
      expect(entitlementOf(status)).toBe("pro");
    },
  );

  it.each(["canceled", "unpaid", "paused", "incomplete_expired"])(
    "%s revokes PRO",
    (status) => {
      expect(entitlementOf(status)).toBe("free");
    },
  );

  it.each(["incomplete", "something_new"])(
    "%s leaves the tier alone",
    (status) => {
      expect(entitlementOf(status)).toBeNull();
    },
  );
});

describe("subscription-tier — decideTier", () => {
  it("grants PRO when the event's subscription is active", () => {
    expect(decideTier("active", [])).toBe("pro");
  });

  it("revokes PRO when the event's subscription is cancelled and no other is active", () => {
    expect(decideTier("canceled", ["canceled", "unpaid"])).toBe("free");
  });

  it("stays PRO while any other subscription of the user is active", () => {
    expect(decideTier("canceled", ["active"])).toBe("pro");
    expect(decideTier("paused", ["canceled", "trialing"])).toBe("pro");
  });

  it("keeps PRO through past_due until Stripe cancels the subscription", () => {
    expect(decideTier("past_due", [])).toBe("pro");
  });

  it("returns null (no tier change) for a status with no clear meaning", () => {
    expect(decideTier("incomplete", [])).toBeNull();
    expect(decideTier("incomplete", ["canceled"])).toBeNull();
  });

  it("an active other subscription still wins over an unclear status", () => {
    expect(decideTier("incomplete", ["active"])).toBe("pro");
  });
});
