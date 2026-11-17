import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { handleStripeWebhook } from "./webhook.controller";
import type Stripe from "stripe";
import { getStripe } from "../services/stripe.service";
import { resolveSubscriptionOwner } from "../services/subscription-owner.service";
import { syncSubscriptionEntitlement } from "../services/entitlement-sync.service";

vi.mock("../services/stripe.service", () => ({
  getStripe: vi.fn(),
}));
vi.mock("../services/subscription-owner.service", () => ({
  resolveSubscriptionOwner: vi.fn(),
}));
vi.mock("../repositories/stripe-event.repository", () => ({
  stripeEventRepository: {
    isProcessed: vi.fn().mockResolvedValue(false),
    markProcessed: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("../services/entitlement-sync.service", () => ({
  syncSubscriptionEntitlement: vi.fn(),
}));

const CREATED = 1_794_950_000;

function mockStripeEvent(event: unknown) {
  vi.mocked(getStripe).mockReturnValue({
    webhooks: {
      constructEvent: vi.fn().mockReturnValue({
        id: "evt_ctrl",
        created: CREATED,
        ...(event as object),
      }),
    },
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
        object: {
          id: "cs_1",
          payment_status: "paid",
          customer: "cus_9",
          subscription: "sub_9",
          metadata: { userId: "u1" },
        },
      },
    });
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(syncSubscriptionEntitlement).toHaveBeenCalledWith(
      "u1",
      {
        subscriptionId: "sub_9",
        entitled: true,
        ended: false,
        eventAt: new Date(CREATED * 1000),
      },
      "cus_9",
    );
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it("does not upgrade to PRO when checkout.session.completed arrives unpaid (delayed payment method)", async () => {
    mockStripeEvent({
      id: "evt_unpaid",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_2",
          payment_status: "unpaid",
          customer: "cus_9",
          subscription: "sub_9",
          metadata: { userId: "u1" },
        },
      },
    });
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(syncSubscriptionEntitlement).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it("downgrades the owner resolved by the fallback when the subscription has no metadata.userId", async () => {
    const subscription = {
      id: "sub_1",
      status: "canceled",
      customer: "cus_9",
      metadata: {},
    };
    mockStripeEvent({
      type: "customer.subscription.deleted",
      data: { object: subscription },
    });
    vi.mocked(resolveSubscriptionOwner).mockResolvedValue("u1");
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(resolveSubscriptionOwner).toHaveBeenCalledWith(subscription);
    expect(syncSubscriptionEntitlement).toHaveBeenCalledWith(
      "u1",
      {
        subscriptionId: "sub_1",
        entitled: false,
        ended: true,
        eventAt: new Date(CREATED * 1000),
      },
      "cus_9",
    );
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it("acks without touching any user when the subscription owner cannot be resolved", async () => {
    mockStripeEvent({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_2",
          status: "canceled",
          customer: "cus_x",
          metadata: {},
        },
      },
    });
    vi.mocked(resolveSubscriptionOwner).mockResolvedValue(null);
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(syncSubscriptionEntitlement).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it("returns 500 (so Stripe retries) when the owner lookup throws", async () => {
    mockStripeEvent({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_3",
          status: "canceled",
          customer: "cus_y",
          metadata: {},
        },
      },
    });
    vi.mocked(resolveSubscriptionOwner).mockRejectedValue(new Error("boom"));
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(syncSubscriptionEntitlement).not.toHaveBeenCalled();
  });
});
