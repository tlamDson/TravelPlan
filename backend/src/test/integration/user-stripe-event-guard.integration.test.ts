import { describe, it, expect } from "vitest";
import { seedUser } from "../integration-fixtures";
import User from "../../features/user/models/User";
import { userRepository } from "../../features/user/repositories/user.repository";

describe("userRepository.applyStripeEvent (real Mongo)", () => {
  it("applies an update once per Stripe event id, even when called again or concurrently", async () => {
    await seedUser("user-guard-1", { tier: "free" });

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        userRepository.applyStripeEvent("user-guard-1", "evt_g1", {
          tier: "pro",
        }),
      ),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);

    await User.updateOne({ clerkUserId: "user-guard-1" }, { tier: "free" });
    expect(
      await userRepository.applyStripeEvent("user-guard-1", "evt_g1", {
        tier: "pro",
      }),
    ).toBeNull();
    expect((await User.findOne({ clerkUserId: "user-guard-1" }))?.tier).toBe(
      "free",
    );
  });

  it("applies a different event id and keeps only a bounded history", async () => {
    await seedUser("user-guard-2", { tier: "free" });
    for (let i = 0; i < 60; i++) {
      await userRepository.applyStripeEvent("user-guard-2", `evt_${i}`, {
        tier: i % 2 ? "pro" : "free",
      });
    }

    const user = await User.findOne({ clerkUserId: "user-guard-2" }).lean();
    expect(user?.tier).toBe("pro");
    expect(user?.appliedStripeEventIds).toHaveLength(50);
    expect(user?.appliedStripeEventIds?.at(-1)).toBe("evt_59");
  });
});
