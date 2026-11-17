import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";
import { resolveSubscriptionOwner } from "./subscription-owner.service";
import { userRepository } from "../../user/repositories/user.repository";
import { getStripe } from "./stripe.service";

vi.mock("../../user/repositories/user.repository", () => ({
  userRepository: { findByStripeCustomerId: vi.fn() },
}));
vi.mock("./stripe.service", () => ({ getStripe: vi.fn() }));

const listSessions = vi.fn();

function sub(fields: Partial<Stripe.Subscription>): Stripe.Subscription {
  return { id: "sub_test_1", metadata: {}, ...fields } as Stripe.Subscription;
}

describe("subscription-owner.service — resolveSubscriptionOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStripe).mockReturnValue({
      checkout: { sessions: { list: listSessions } },
    } as unknown as Stripe);
    listSessions.mockResolvedValue({ data: [] });
  });

  it("uses subscription.metadata.userId when present, without any lookup", async () => {
    const owner = await resolveSubscriptionOwner(
      sub({ metadata: { userId: "user_meta" }, customer: "cus_1" }),
    );

    expect(owner).toBe("user_meta");
    expect(userRepository.findByStripeCustomerId).not.toHaveBeenCalled();
    expect(listSessions).not.toHaveBeenCalled();
  });

  it("falls back to the user stored under the Stripe customer id", async () => {
    vi.mocked(userRepository.findByStripeCustomerId).mockResolvedValue({
      clerkUserId: "user_db",
    } as any);

    const owner = await resolveSubscriptionOwner(sub({ customer: "cus_2" }));

    expect(userRepository.findByStripeCustomerId).toHaveBeenCalledWith("cus_2");
    expect(owner).toBe("user_db");
    expect(listSessions).not.toHaveBeenCalled();
  });

  it("accepts an expanded customer object", async () => {
    vi.mocked(userRepository.findByStripeCustomerId).mockResolvedValue({
      clerkUserId: "user_db",
    } as any);

    await resolveSubscriptionOwner(
      sub({ customer: { id: "cus_3" } as Stripe.Customer }),
    );

    expect(userRepository.findByStripeCustomerId).toHaveBeenCalledWith("cus_3");
  });

  it("falls back to the customer's checkout session metadata for subscribers that predate the stored customer id", async () => {
    vi.mocked(userRepository.findByStripeCustomerId).mockResolvedValue(null);
    listSessions.mockResolvedValue({
      data: [{ id: "cs_old", metadata: { userId: "user_legacy" } }],
    });

    const owner = await resolveSubscriptionOwner(sub({ customer: "cus_4" }));

    expect(listSessions).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_4" }),
    );
    expect(owner).toBe("user_legacy");
  });

  it("returns null when nothing identifies the owner", async () => {
    vi.mocked(userRepository.findByStripeCustomerId).mockResolvedValue(null);

    const owner = await resolveSubscriptionOwner(sub({ customer: "cus_5" }));

    expect(owner).toBeNull();
  });

  it("returns null without lookups when the subscription has no customer", async () => {
    const owner = await resolveSubscriptionOwner(
      sub({ customer: undefined as unknown as string }),
    );

    expect(owner).toBeNull();
    expect(userRepository.findByStripeCustomerId).not.toHaveBeenCalled();
    expect(listSessions).not.toHaveBeenCalled();
  });
});
