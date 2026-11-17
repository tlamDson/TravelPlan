import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";
import { processStripeEvent } from "./webhook-event.service";
import { resolveSubscriptionOwner } from "./subscription-owner.service";
import { stripeEventRepository } from "../repositories/stripe-event.repository";
import { userRepository } from "../../user/repositories/user.repository";
import {
  DEFAULT_CREATED,
  checkoutSessionEvent,
  subscriptionEvent,
} from "../../../test/fixtures/stripe-events";

vi.mock("./subscription-owner.service", () => ({
  resolveSubscriptionOwner: vi.fn(),
}));
vi.mock("../repositories/stripe-event.repository", () => ({
  stripeEventRepository: { claim: vi.fn(), release: vi.fn() },
}));
vi.mock("../../user/repositories/user.repository", () => ({
  userRepository: { setTierFromStripe: vi.fn() },
}));

const EVENT_AT = new Date(DEFAULT_CREATED * 1000);

describe("webhook-event.service — processStripeEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stripeEventRepository.claim).mockResolvedValue(true);
    vi.mocked(stripeEventRepository.release).mockResolvedValue(undefined);
    vi.mocked(resolveSubscriptionOwner).mockResolvedValue("user_1");
  });

  it("upgrades to PRO, stamped with the event time, when the completed checkout session is paid", async () => {
    await processStripeEvent(
      checkoutSessionEvent("checkout.session.completed", "paid"),
    );

    expect(userRepository.setTierFromStripe).toHaveBeenCalledWith(
      "user_1",
      { tier: "pro", stripeCustomerId: "cus_test_1" },
      EVENT_AT,
    );
  });

  it.each(["unpaid", "no_payment_required"] as const)(
    "does not upgrade when the completed checkout session is %s",
    async (paymentStatus) => {
      await processStripeEvent(
        checkoutSessionEvent("checkout.session.completed", paymentStatus),
      );

      expect(userRepository.setTierFromStripe).not.toHaveBeenCalled();
    },
  );

  it("upgrades to PRO when a delayed payment succeeds", async () => {
    await processStripeEvent(
      checkoutSessionEvent("checkout.session.async_payment_succeeded", "paid"),
    );

    expect(userRepository.setTierFromStripe).toHaveBeenCalledWith(
      "user_1",
      { tier: "pro", stripeCustomerId: "cus_test_1" },
      EVENT_AT,
    );
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

      expect(userRepository.setTierFromStripe).toHaveBeenCalledWith(
        "user_1",
        { tier: "free" },
        EVENT_AT,
      );
    },
  );

  it.each(["active", "trialing"] as const)(
    "keeps the user on PRO when the subscription is updated to %s",
    async (status) => {
      await processStripeEvent(
        subscriptionEvent("customer.subscription.updated", status),
      );

      expect(userRepository.setTierFromStripe).toHaveBeenCalledWith(
        "user_1",
        { tier: "pro" },
        EVENT_AT,
      );
    },
  );

  it("leaves the tier alone while a new subscription is still incomplete", async () => {
    await processStripeEvent(
      subscriptionEvent("customer.subscription.updated", "incomplete"),
    );

    expect(userRepository.setTierFromStripe).not.toHaveBeenCalled();
  });

  it("downgrades to FREE when the subscription is deleted", async () => {
    await processStripeEvent(
      subscriptionEvent("customer.subscription.deleted", "canceled", {
        created: DEFAULT_CREATED + 60,
      }),
    );

    expect(userRepository.setTierFromStripe).toHaveBeenCalledWith(
      "user_1",
      { tier: "free" },
      new Date((DEFAULT_CREATED + 60) * 1000),
    );
  });

  it("does not touch any user when the updated subscription's owner cannot be resolved", async () => {
    vi.mocked(resolveSubscriptionOwner).mockResolvedValue(null);

    await processStripeEvent(
      subscriptionEvent("customer.subscription.updated", "past_due"),
    );

    expect(userRepository.setTierFromStripe).not.toHaveBeenCalled();
  });

  it("claims the event id before handling it", async () => {
    const outcome = await processStripeEvent(
      checkoutSessionEvent("checkout.session.completed", "paid", {
        id: "evt_new",
      }),
    );

    expect(outcome).toBe("processed");
    expect(stripeEventRepository.claim).toHaveBeenCalledWith(
      "evt_new",
      "checkout.session.completed",
    );
    expect(stripeEventRepository.release).not.toHaveBeenCalled();
  });

  it("skips an event id that is already claimed (redelivery or concurrent duplicate)", async () => {
    vi.mocked(stripeEventRepository.claim).mockResolvedValue(false);

    const outcome = await processStripeEvent(
      subscriptionEvent("customer.subscription.updated", "past_due", {
        id: "evt_dup",
      }),
    );

    expect(outcome).toBe("duplicate");
    expect(userRepository.setTierFromStripe).not.toHaveBeenCalled();
    expect(resolveSubscriptionOwner).not.toHaveBeenCalled();
  });

  it("releases the claim when handling throws, so Stripe's retry is processed", async () => {
    vi.mocked(resolveSubscriptionOwner).mockRejectedValue(new Error("boom"));

    await expect(
      processStripeEvent(
        subscriptionEvent("customer.subscription.updated", "past_due", {
          id: "evt_fail",
        }),
      ),
    ).rejects.toThrow("boom");
    expect(stripeEventRepository.release).toHaveBeenCalledWith("evt_fail");
  });

  it("ignores an event whose envelope has no created time, without claiming it", async () => {
    const event = {
      id: "evt_bad",
      type: "checkout.session.completed",
      data: { object: {} },
    } as unknown as Stripe.Event;

    const outcome = await processStripeEvent(event);

    expect(outcome).toBe("invalid");
    expect(stripeEventRepository.claim).not.toHaveBeenCalled();
    expect(userRepository.setTierFromStripe).not.toHaveBeenCalled();
  });

  it("ignores a checkout session with an unknown payment_status instead of upgrading", async () => {
    const event = checkoutSessionEvent("checkout.session.completed", "paid");
    (event.data.object as { payment_status: string }).payment_status = "weird";

    await processStripeEvent(event);

    expect(userRepository.setTierFromStripe).not.toHaveBeenCalled();
  });

  it("ignores a subscription with an unknown status instead of changing the tier", async () => {
    const event = subscriptionEvent("customer.subscription.updated", "active");
    (event.data.object as { status: string }).status = "weird";

    await processStripeEvent(event);

    expect(resolveSubscriptionOwner).not.toHaveBeenCalled();
    expect(userRepository.setTierFromStripe).not.toHaveBeenCalled();
  });

  it("claims unhandled event types too, without touching any user", async () => {
    const event = {
      id: "evt_other",
      type: "invoice.created",
      created: DEFAULT_CREATED,
      data: { object: {} },
    } as unknown as Stripe.Event;

    await processStripeEvent(event);

    expect(userRepository.setTierFromStripe).not.toHaveBeenCalled();
    expect(stripeEventRepository.claim).toHaveBeenCalledWith(
      "evt_other",
      "invoice.created",
    );
  });
});
