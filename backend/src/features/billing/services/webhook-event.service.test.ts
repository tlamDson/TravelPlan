import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";
import { processStripeEvent } from "./webhook-event.service";
import { resolveSubscriptionOwner } from "./subscription-owner.service";
import { syncSubscriptionEntitlement } from "./entitlement-sync.service";
import { stripeEventRepository } from "../repositories/stripe-event.repository";
import {
  DEFAULT_CREATED,
  checkoutSessionEvent,
  subscriptionEvent,
} from "../../../test/fixtures/stripe-events";

vi.mock("./subscription-owner.service", () => ({
  resolveSubscriptionOwner: vi.fn(),
}));
vi.mock("./entitlement-sync.service", () => ({
  syncSubscriptionEntitlement: vi.fn(),
}));
vi.mock("../repositories/stripe-event.repository", () => ({
  stripeEventRepository: { isProcessed: vi.fn(), markProcessed: vi.fn() },
}));

const EVENT_AT = new Date(DEFAULT_CREATED * 1000);
const change = (entitled: boolean, ended: boolean, eventAt = EVENT_AT) => ({
  subscriptionId: "sub_test_1",
  entitled,
  ended,
  eventAt,
});

describe("webhook-event.service — processStripeEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stripeEventRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(stripeEventRepository.markProcessed).mockResolvedValue(
      undefined,
    );
    vi.mocked(syncSubscriptionEntitlement).mockResolvedValue("applied");
    vi.mocked(resolveSubscriptionOwner).mockResolvedValue("user_1");
  });

  it("grants the checkout's subscription, stamped with the event time, when the session is paid", async () => {
    await processStripeEvent(
      checkoutSessionEvent("checkout.session.completed", "paid"),
    );

    expect(syncSubscriptionEntitlement).toHaveBeenCalledWith(
      "user_1",
      change(true, false),
      "cus_test_1",
    );
  });

  it.each(["unpaid", "no_payment_required"] as const)(
    "does not grant when the completed checkout session is %s",
    async (paymentStatus) => {
      await processStripeEvent(
        checkoutSessionEvent("checkout.session.completed", paymentStatus),
      );

      expect(syncSubscriptionEntitlement).not.toHaveBeenCalled();
    },
  );

  it("grants when a delayed payment succeeds", async () => {
    await processStripeEvent(
      checkoutSessionEvent("checkout.session.async_payment_succeeded", "paid"),
    );

    expect(syncSubscriptionEntitlement).toHaveBeenCalledWith(
      "user_1",
      change(true, false),
      "cus_test_1",
    );
  });

  it("does not grant a paid checkout that names no subscription", async () => {
    await processStripeEvent(
      checkoutSessionEvent("checkout.session.completed", "paid", {
        subscription: null,
      }),
    );

    expect(syncSubscriptionEntitlement).not.toHaveBeenCalled();
  });

  it.each(["past_due", "unpaid", "paused"] as const)(
    "revokes (not ends) the subscription when it is updated to %s",
    async (status) => {
      await processStripeEvent(
        subscriptionEvent("customer.subscription.updated", status),
      );

      expect(syncSubscriptionEntitlement).toHaveBeenCalledWith(
        "user_1",
        change(false, false),
      );
    },
  );

  it.each(["canceled", "incomplete_expired"] as const)(
    "ends the subscription when it is updated to %s",
    async (status) => {
      await processStripeEvent(
        subscriptionEvent("customer.subscription.updated", status),
      );

      expect(syncSubscriptionEntitlement).toHaveBeenCalledWith(
        "user_1",
        change(false, true),
      );
    },
  );

  it.each(["active", "trialing"] as const)(
    "grants the subscription when it is updated to %s",
    async (status) => {
      await processStripeEvent(
        subscriptionEvent("customer.subscription.updated", status),
      );

      expect(syncSubscriptionEntitlement).toHaveBeenCalledWith(
        "user_1",
        change(true, false),
      );
    },
  );

  it("leaves the tier alone while a new subscription is still incomplete", async () => {
    await processStripeEvent(
      subscriptionEvent("customer.subscription.updated", "incomplete"),
    );

    expect(syncSubscriptionEntitlement).not.toHaveBeenCalled();
  });

  it("ends the subscription when it is deleted", async () => {
    await processStripeEvent(
      subscriptionEvent("customer.subscription.deleted", "canceled", {
        created: DEFAULT_CREATED + 60,
      }),
    );

    expect(syncSubscriptionEntitlement).toHaveBeenCalledWith(
      "user_1",
      change(false, true, new Date((DEFAULT_CREATED + 60) * 1000)),
    );
  });

  it("does not touch any user when the updated subscription's owner cannot be resolved", async () => {
    vi.mocked(resolveSubscriptionOwner).mockResolvedValue(null);

    await processStripeEvent(
      subscriptionEvent("customer.subscription.updated", "past_due"),
    );

    expect(syncSubscriptionEntitlement).not.toHaveBeenCalled();
  });

  it("records the event id only after handling succeeded", async () => {
    const outcome = await processStripeEvent(
      checkoutSessionEvent("checkout.session.completed", "paid", {
        id: "evt_new",
      }),
    );

    expect(outcome).toBe("processed");
    expect(stripeEventRepository.markProcessed).toHaveBeenCalledWith(
      "evt_new",
      "checkout.session.completed",
    );
    expect(
      vi.mocked(syncSubscriptionEntitlement).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(stripeEventRepository.markProcessed).mock
        .invocationCallOrder[0],
    );
  });

  it("skips an event id that was already processed", async () => {
    vi.mocked(stripeEventRepository.isProcessed).mockResolvedValue(true);

    const outcome = await processStripeEvent(
      subscriptionEvent("customer.subscription.updated", "past_due", {
        id: "evt_dup",
      }),
    );

    expect(outcome).toBe("duplicate");
    expect(stripeEventRepository.isProcessed).toHaveBeenCalledWith("evt_dup");
    expect(syncSubscriptionEntitlement).not.toHaveBeenCalled();
    expect(resolveSubscriptionOwner).not.toHaveBeenCalled();
  });

  it("does not record an event whose handling threw, so Stripe's retry is processed", async () => {
    vi.mocked(syncSubscriptionEntitlement).mockRejectedValue(new Error("boom"));

    await expect(
      processStripeEvent(
        subscriptionEvent("customer.subscription.updated", "past_due", {
          id: "evt_fail",
        }),
      ),
    ).rejects.toThrow("boom");
    expect(stripeEventRepository.markProcessed).not.toHaveBeenCalled();
  });

  it("ignores an event whose envelope has no created time, without recording it", async () => {
    const event = {
      id: "evt_bad",
      type: "checkout.session.completed",
      data: { object: {} },
    } as unknown as Stripe.Event;

    const outcome = await processStripeEvent(event);

    expect(outcome).toBe("invalid");
    expect(stripeEventRepository.isProcessed).not.toHaveBeenCalled();
    expect(stripeEventRepository.markProcessed).not.toHaveBeenCalled();
    expect(syncSubscriptionEntitlement).not.toHaveBeenCalled();
  });

  it("ignores a checkout session with an unknown payment_status instead of granting", async () => {
    const event = checkoutSessionEvent("checkout.session.completed", "paid");
    (event.data.object as { payment_status: string }).payment_status = "weird";

    await processStripeEvent(event);

    expect(syncSubscriptionEntitlement).not.toHaveBeenCalled();
  });

  it("ignores a subscription with an unknown status instead of changing the tier", async () => {
    const event = subscriptionEvent("customer.subscription.updated", "active");
    (event.data.object as { status: string }).status = "weird";

    await processStripeEvent(event);

    expect(resolveSubscriptionOwner).not.toHaveBeenCalled();
    expect(syncSubscriptionEntitlement).not.toHaveBeenCalled();
  });

  it("records unhandled event types too, without touching any user", async () => {
    const event = {
      id: "evt_other",
      type: "invoice.created",
      created: DEFAULT_CREATED,
      data: { object: {} },
    } as unknown as Stripe.Event;

    await processStripeEvent(event);

    expect(syncSubscriptionEntitlement).not.toHaveBeenCalled();
    expect(stripeEventRepository.markProcessed).toHaveBeenCalledWith(
      "evt_other",
      "invoice.created",
    );
  });
});
