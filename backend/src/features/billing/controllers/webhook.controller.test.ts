import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { handleStripeWebhook } from "./webhook.controller";
import type Stripe from "stripe";
import { getStripe } from "../services/stripe.service";
import { resolveSubscriptionOwner } from "../services/subscription-owner.service";
import { userRepository } from "../../user/repositories/user.repository";

vi.mock("../services/stripe.service", () => ({
  getStripe: vi.fn(),
}));
vi.mock("../services/subscription-owner.service", () => ({
  resolveSubscriptionOwner: vi.fn(),
}));
vi.mock("../../user/repositories/user.repository", () => ({
  userRepository: { updateByClerkId: vi.fn() },
}));

function mockStripeEvent(event: unknown) {
  vi.mocked(getStripe).mockReturnValue({
    webhooks: { constructEvent: vi.fn().mockReturnValue(event) },
  } as unknown as Stripe);
}

function signedReq(): Request {
  return {
    headers: { "stripe-signature": "t=1,v1=x" },
    body: Buffer.from("{}"),
  } as unknown as Request;
}

function makeRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe("webhook.controller — handleStripeWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 (not a boot/request crash) when Stripe is not configured, before touching the signature header", async () => {
    vi.mocked(getStripe).mockImplementation(() => {
      throw new Error("STRIPE_NOT_CONFIGURED");
    });
    // No stripe-signature header at all — if this were checked first, the
    // failure would be a 400 "Missing stripe-signature header" instead,
    // masking the real STRIPE_NOT_CONFIGURED cause.
    const req = { headers: {}, body: Buffer.from("{}") } as unknown as Request;
    const res = makeRes();

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it("stores the Stripe customer id on checkout.session.completed so a later cancellation can find the user", async () => {
    mockStripeEvent({
      type: "checkout.session.completed",
      data: {
        object: { id: "cs_1", customer: "cus_9", metadata: { userId: "u1" } },
      },
    });
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(userRepository.updateByClerkId).toHaveBeenCalledWith("u1", {
      tier: "pro",
      stripeCustomerId: "cus_9",
    });
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it("downgrades the owner resolved by the fallback when the subscription has no metadata.userId", async () => {
    const subscription = { id: "sub_1", customer: "cus_9", metadata: {} };
    mockStripeEvent({
      type: "customer.subscription.deleted",
      data: { object: subscription },
    });
    vi.mocked(resolveSubscriptionOwner).mockResolvedValue("u1");
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(resolveSubscriptionOwner).toHaveBeenCalledWith(subscription);
    expect(userRepository.updateByClerkId).toHaveBeenCalledWith("u1", {
      tier: "free",
    });
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it("acks without touching any user when the subscription owner cannot be resolved", async () => {
    mockStripeEvent({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_2", customer: "cus_x", metadata: {} } },
    });
    vi.mocked(resolveSubscriptionOwner).mockResolvedValue(null);
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(userRepository.updateByClerkId).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it("returns 500 (so Stripe retries) when the owner lookup throws", async () => {
    mockStripeEvent({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_3", customer: "cus_y", metadata: {} } },
    });
    vi.mocked(resolveSubscriptionOwner).mockRejectedValue(new Error("boom"));
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(userRepository.updateByClerkId).not.toHaveBeenCalled();
  });
});
