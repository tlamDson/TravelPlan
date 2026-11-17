import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// STRIPE_SECRET_KEY is set to a dummy value globally in vitest.config.ts —
// override it per-test via vi.stubEnv so we can exercise the "not
// configured" path without a full process restart.
describe("stripe.service — lazy init", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("does not throw on import when STRIPE_SECRET_KEY is empty", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    await expect(import("./stripe.service")).resolves.toBeDefined();
  });

  it("getStripe() throws STRIPE_NOT_CONFIGURED when the key is empty", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { getStripe } = await import("./stripe.service");
    expect(() => getStripe()).toThrow("STRIPE_NOT_CONFIGURED");
  });

  it("getStripe() returns a Stripe client when the key is set", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy_key_for_tests");
    const { getStripe } = await import("./stripe.service");
    expect(getStripe()).toBeDefined();
    expect(getStripe().checkout).toBeDefined();
  });
});

describe("stripe.service — createCheckoutSession", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("stamps userId on the subscription (subscription_data.metadata), not only on the session", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy_key_for_tests");
    const { getStripe, createCheckoutSession } =
      await import("./stripe.service");
    const create = vi
      .spyOn(getStripe().checkout.sessions, "create")
      .mockResolvedValue({ id: "cs_test_1" } as any);

    await createCheckoutSession("user_abc");

    const params = create.mock
      .calls[0]![0] as unknown as Stripe.Checkout.SessionCreateParams;
    expect(params.metadata).toEqual({ userId: "user_abc" });
    expect(params.subscription_data?.metadata).toEqual({ userId: "user_abc" });
  });
});
