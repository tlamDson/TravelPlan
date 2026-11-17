import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";
import { processStripeEvent } from "./webhook-event.service";
import { resolveSubscriptionOwner } from "./subscription-owner.service";
import { stripeEventRepository } from "../repositories/stripe-event.repository";
import { userRepository } from "../../user/repositories/user.repository";
import {
  checkoutSessionEvent,
  subscriptionEvent,
} from "../../../test/fixtures/stripe-events";

vi.mock("./subscription-owner.service", () => ({
  resolveSubscriptionOwner: vi.fn(),
}));
vi.mock("../repositories/stripe-event.repository", () => ({
  stripeEventRepository: {
    isProcessed: vi.fn(),
    markProcessed: vi.fn(),
  },
}));
vi.mock("../../user/repositories/user.repository", () => ({
  userRepository: { updateByClerkId: vi.fn() },
}));

describe("webhook-event.service — processStripeEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stripeEventRepository.isProcessed).mockResolvedValue(false);
    vi.mocked(resolveSubscriptionOwner).mockResolvedValue("user_1");
  });

  it("upgrades to PRO when the completed checkout session is paid", async () => {
    await processStripeEvent(
      checkoutSessionEvent("checkout.session.completed", "paid"),
    );

    expect(userRepository.updateByClerkId).toHaveBeenCalledWith("user_1", {
      tier: "pro",
      stripeCustomerId: "cus_test_1",
    });
  });

  it("upgrades to PRO when the checkout needed no payment (e.g. a free trial)", async () => {
    await processStripeEvent(
      checkoutSessionEvent("checkout.session.completed", "no_payment_required"),
    );

    expect(userRepository.updateByClerkId).toHaveBeenCalledWith("user_1", {
      tier: "pro",
      stripeCustomerId: "cus_test_1",
    });
  });

  it("does not upgrade when the completed checkout session is still unpaid (delayed payment method)", async () => {
    await processStripeEvent(
      checkoutSessionEvent("checkout.session.completed", "unpaid"),
    );

    expect(userRepository.updateByClerkId).not.toHaveBeenCalled();
  });

  it("upgrades to PRO when a delayed payment succeeds", async () => {
    await processStripeEvent(
      checkoutSessionEvent("checkout.session.async_payment_succeeded", "paid"),
    );

    expect(userRepository.updateByClerkId).toHaveBeenCalledWith("user_1", {
      tier: "pro",
      stripeCustomerId: "cus_test_1",
    });
  });

  it.each([
    "past_due",
    "unpaid",
    "paused",
    "canceled",
    "incomplete_expired",
  ] as const)(
    "downgrades to FREE when the subscription is updated to %s",
    async (status) => {
      await processStripeEvent(
        subscriptionEvent("customer.subscription.updated", status),
      );

      expect(userRepository.updateByClerkId).toHaveBeenCalledWith("user_1", {
        tier: "free",
      });
    },
  );

  it.each(["active", "trialing"] as const)(
    "keeps the user on PRO when the subscription is updated to %s",
    async (status) => {
      await processStripeEvent(
        subscriptionEvent("customer.subscription.updated", status),
      );

      expect(userRepository.updateByClerkId).toHaveBeenCalledWith("user_1", {
        tier: "pro",
      });
    },
  );

  it("leaves the tier alone while a new subscription is still incomplete", async () => {
    await processStripeEvent(
      subscriptionEvent("customer.subscription.updated", "incomplete"),
    );

    expect(userRepository.updateByClerkId).not.toHaveBeenCalled();
  });

  it("does not touch any user when the updated subscription's owner cannot be resolved", async () => {
    vi.mocked(resolveSubscriptionOwner).mockResolvedValue(null);

    await processStripeEvent(
      subscriptionEvent("customer.subscription.updated", "past_due"),
    );

    expect(userRepository.updateByClerkId).not.toHaveBeenCalled();
  });

  it("skips an event id that was already processed (Stripe redelivery)", async () => {
    vi.mocked(stripeEventRepository.isProcessed).mockResolvedValue(true);

    const outcome = await processStripeEvent(
      subscriptionEvent("customer.subscription.updated", "past_due", {
        id: "evt_dup",
      }),
    );

    expect(outcome).toBe("duplicate");
    expect(stripeEventRepository.isProcessed).toHaveBeenCalledWith("evt_dup");
    expect(userRepository.updateByClerkId).not.toHaveBeenCalled();
    expect(stripeEventRepository.markProcessed).not.toHaveBeenCalled();
  });

  it("records the event id after handling it", async () => {
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
  });

  it("does not record the event id when handling throws, so Stripe's retry is processed", async () => {
    vi.mocked(resolveSubscriptionOwner).mockRejectedValue(new Error("boom"));

    await expect(
      processStripeEvent(
        subscriptionEvent("customer.subscription.updated", "past_due"),
      ),
    ).rejects.toThrow("boom");
    expect(stripeEventRepository.markProcessed).not.toHaveBeenCalled();
  });

  it("records unhandled event types too, without touching any user", async () => {
    const event = {
      id: "evt_other",
      type: "invoice.created",
      data: { object: {} },
    } as unknown as Stripe.Event;

    await processStripeEvent(event);

    expect(userRepository.updateByClerkId).not.toHaveBeenCalled();
    expect(stripeEventRepository.markProcessed).toHaveBeenCalledWith(
      "evt_other",
      "invoice.created",
    );
  });
});
