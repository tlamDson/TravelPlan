import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { handleStripeWebhook } from "./webhook.controller";
import type Stripe from "stripe";
import { getStripe } from "../services/stripe.service";
import { syncSubscriptionTier } from "../services/subscription-sync.service";
import { userRepository } from "../../user/repositories/user.repository";
import { processedStripeEventRepository } from "../repositories/processed-stripe-event.repository";

vi.mock("../services/stripe.service", () => ({
  getStripe: vi.fn(),
}));
vi.mock("../services/subscription-sync.service", () => ({
  syncSubscriptionTier: vi.fn(),
}));
vi.mock("../../user/repositories/user.repository", () => ({
  userRepository: { applyStripeEvent: vi.fn() },
}));

vi.mock("../repositories/processed-stripe-event.repository", () => {
  const done = new Set<string>();
  return {
    processedStripeEventRepository: {
      isProcessed: vi.fn(async (id: string) => done.has(id)),
      markProcessed: vi.fn(async (id: string) => {
        done.add(id);
      }),
      __reset: () => done.clear(),
    },
  };
});

function mockStripeEvent(event: unknown) {
  vi.mocked(getStripe).mockReturnValue({
    webhooks: {
      constructEvent: vi
        .fn()
        .mockReturnValue({ id: "evt_default", ...(event as object) }),
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
    (
      processedStripeEventRepository as unknown as { __reset: () => void }
    ).__reset();
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
          customer: "cus_9",
          payment_status: "paid",
          metadata: { userId: "u1" },
        },
      },
    });
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(userRepository.applyStripeEvent).toHaveBeenCalledWith(
      "u1",
      "evt_default",
      {
        tier: "pro",
        stripeCustomerId: "cus_9",
      },
    );
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  const sessionEvent = (type: string, payment_status?: string) => ({
    type,
    data: {
      object: {
        id: "cs_2",
        customer: "cus_9",
        payment_status,
        metadata: { userId: "u1" },
      },
    },
  });

  it("upgrades on checkout.session.completed when no payment is required", async () => {
    mockStripeEvent(
      sessionEvent("checkout.session.completed", "no_payment_required"),
    );
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(userRepository.applyStripeEvent).toHaveBeenCalledWith(
      "u1",
      "evt_default",
      {
        tier: "pro",
        stripeCustomerId: "cus_9",
      },
    );
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it("does not upgrade on checkout.session.completed while payment is unpaid, and still acks", async () => {
    mockStripeEvent(sessionEvent("checkout.session.completed", "unpaid"));
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(userRepository.applyStripeEvent).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it("upgrades on checkout.session.async_payment_succeeded when paid", async () => {
    mockStripeEvent(
      sessionEvent("checkout.session.async_payment_succeeded", "paid"),
    );
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(userRepository.applyStripeEvent).toHaveBeenCalledWith(
      "u1",
      "evt_default",
      {
        tier: "pro",
        stripeCustomerId: "cus_9",
      },
    );
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it("does not upgrade on checkout.session.async_payment_succeeded if the session is still unpaid", async () => {
    mockStripeEvent(
      sessionEvent("checkout.session.async_payment_succeeded", "unpaid"),
    );
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(userRepository.applyStripeEvent).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it("does not upgrade or downgrade on checkout.session.async_payment_failed, and still acks", async () => {
    mockStripeEvent(
      sessionEvent("checkout.session.async_payment_failed", "unpaid"),
    );
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(userRepository.applyStripeEvent).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it.each(["customer.subscription.updated", "customer.subscription.deleted"])(
    "syncs the tier from the subscription on %s and acks",
    async (type) => {
      const event = {
        id: "evt_sub",
        type,
        created: 1_000,
        data: { object: { id: "sub_1", customer: "cus_9", status: "paused" } },
      };
      mockStripeEvent(event);
      const res = makeRes();

      await handleStripeWebhook(signedReq(), res);

      expect(syncSubscriptionTier).toHaveBeenCalledWith(event);
      expect(processedStripeEventRepository.markProcessed).toHaveBeenCalledWith(
        "evt_sub",
      );
      expect(res.json).toHaveBeenCalledWith({ received: true });
    },
  );

  it("returns 500 (so Stripe retries) when the subscription sync throws", async () => {
    mockStripeEvent({
      type: "customer.subscription.updated",
      data: { object: { id: "sub_3", customer: "cus_y", status: "active" } },
    });
    vi.mocked(syncSubscriptionTier).mockRejectedValue(new Error("boom"));
    const res = makeRes();

    await handleStripeWebhook(signedReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(processedStripeEventRepository.markProcessed).not.toHaveBeenCalled();
  });
  describe("event.id de-duplication", () => {
    const checkoutEvent = {
      id: "evt_dup_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          customer: "cus_9",
          payment_status: "paid",
          metadata: { userId: "u1" },
        },
      },
    };

    it("applies the side effect once and acks 200 when the same event is delivered twice", async () => {
      mockStripeEvent(checkoutEvent);
      const first = makeRes();
      const second = makeRes();

      await handleStripeWebhook(signedReq(), first);
      await handleStripeWebhook(signedReq(), second);

      expect(userRepository.applyStripeEvent).toHaveBeenCalledTimes(1);
      expect(first.json).toHaveBeenCalledWith({ received: true });
      expect(second.json).toHaveBeenCalledWith({ received: true });
      expect(second.status).not.toHaveBeenCalled();
    });

    it("records the id only after the handler succeeded", async () => {
      mockStripeEvent(checkoutEvent);
      vi.mocked(userRepository.applyStripeEvent).mockImplementationOnce(
        async () => {
          expect(
            processedStripeEventRepository.markProcessed,
          ).not.toHaveBeenCalled();
          return null;
        },
      );

      await handleStripeWebhook(signedReq(), makeRes());

      expect(processedStripeEventRepository.markProcessed).toHaveBeenCalledWith(
        "evt_dup_1",
      );
    });

    it("acks an overlapping repeat with 200 and routes both through the per-event user guard", async () => {
      mockStripeEvent(checkoutEvent);
      let openGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });
      vi.mocked(userRepository.applyStripeEvent).mockImplementationOnce(
        async () => {
          await gate;
          return null;
        },
      );
      const first = makeRes();
      const second = makeRes();

      const firstDone = handleStripeWebhook(signedReq(), first);
      await vi.waitFor(() =>
        expect(userRepository.applyStripeEvent).toHaveBeenCalledTimes(1),
      );
      await handleStripeWebhook(signedReq(), second);
      openGate();
      await firstDone;

      expect(second.status).not.toHaveBeenCalled();
      expect(second.json).toHaveBeenCalledWith({ received: true });
      expect(first.json).toHaveBeenCalledWith({ received: true });
      for (const call of vi.mocked(userRepository.applyStripeEvent).mock
        .calls) {
        expect(call[1]).toBe("evt_dup_1");
      }
    });

    it("records nothing when the handler fails, so Stripe's retry is processed again", async () => {
      mockStripeEvent(checkoutEvent);
      vi.mocked(userRepository.applyStripeEvent).mockRejectedValueOnce(
        new Error("db down"),
      );
      const failed = makeRes();
      const retried = makeRes();

      await handleStripeWebhook(signedReq(), failed);
      expect(failed.status).toHaveBeenCalledWith(500);
      expect(
        processedStripeEventRepository.markProcessed,
      ).not.toHaveBeenCalled();

      await handleStripeWebhook(signedReq(), retried);

      expect(userRepository.applyStripeEvent).toHaveBeenCalledTimes(2);
      expect(retried.json).toHaveBeenCalledWith({ received: true });
      expect(processedStripeEventRepository.markProcessed).toHaveBeenCalledWith(
        "evt_dup_1",
      );
    });

    it("processes two different events with different ids", async () => {
      mockStripeEvent(checkoutEvent);
      await handleStripeWebhook(signedReq(), makeRes());
      mockStripeEvent({ ...checkoutEvent, id: "evt_dup_2" });
      await handleStripeWebhook(signedReq(), makeRes());

      expect(userRepository.applyStripeEvent).toHaveBeenCalledTimes(2);
    });
  });
});
