import { describe, it, expect } from "vitest";
import request from "supertest";
import Stripe from "stripe";
import { createApp } from "../../app";
import { seedUser } from "../integration-fixtures";
import User from "../../features/user/models/User";
import { userRepository } from "../../features/user/repositories/user.repository";

const app = createApp();
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
const signer = new Stripe("sk_test_dummy_key_for_signing");

function subscriptionEvent(opts: {
  id: string;
  type: "customer.subscription.updated" | "customer.subscription.deleted";
  created: number;
  subId: string;
  customer: string;
  status: string;
}) {
  return JSON.stringify({
    id: opts.id,
    object: "event",
    type: opts.type,
    created: opts.created,
    data: {
      object: {
        id: opts.subId,
        object: "subscription",
        customer: opts.customer,
        status: opts.status,
        metadata: {},
      },
    },
  });
}

async function post(payload: string) {
  return request(app)
    .post("/api/webhooks/stripe")
    .set("Content-Type", "application/json")
    .set(
      "stripe-signature",
      signer.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret,
      }),
    )
    .send(payload);
}

async function tierOf(clerkUserId: string) {
  return (await User.findOne({ clerkUserId }))?.tier;
}

describe("userRepository.applyStripeSubscriptionEvent (real Mongo)", () => {
  it("stores the subscription state and ignores older or tied events for that subscription", async () => {
    await seedUser("user-subsync-1", { tier: "free" });

    const applied = await userRepository.applyStripeSubscriptionEvent(
      "user-subsync-1",
      "evt_ss_1",
      {
        subscriptionId: "sub_ss_1",
        customerId: "cus_ss_1",
        status: "active",
        eventCreated: 2_000,
        tier: "pro",
      },
    );
    expect(applied?.tier).toBe("pro");

    const older = await userRepository.applyStripeSubscriptionEvent(
      "user-subsync-1",
      "evt_ss_2",
      {
        subscriptionId: "sub_ss_1",
        customerId: "cus_ss_1",
        status: "canceled",
        eventCreated: 1_000,
        tier: "free",
      },
    );
    const tied = await userRepository.applyStripeSubscriptionEvent(
      "user-subsync-1",
      "evt_ss_3",
      {
        subscriptionId: "sub_ss_1",
        customerId: "cus_ss_1",
        status: "canceled",
        eventCreated: 2_000,
        tier: "free",
      },
    );
    expect(older).toBeNull();
    expect(tied).toBeNull();
    expect(await tierOf("user-subsync-1")).toBe("pro");

    const state = await userRepository.findStripeBillingState("user-subsync-1");
    expect(state).toEqual({
      tier: "pro",
      subscriptions: {
        sub_ss_1: {
          customerId: "cus_ss_1",
          status: "active",
          eventCreated: 2_000,
        },
      },
    });
  });

  it("applies one event id at most once", async () => {
    await seedUser("user-subsync-2", { tier: "pro" });
    const update = {
      subscriptionId: "sub_ss_2",
      status: "canceled",
      eventCreated: 1_000,
      tier: "free" as const,
    };

    const first = await userRepository.applyStripeSubscriptionEvent(
      "user-subsync-2",
      "evt_ss_dup",
      update,
    );
    await User.updateOne({ clerkUserId: "user-subsync-2" }, { tier: "pro" });
    const replay = await userRepository.applyStripeSubscriptionEvent(
      "user-subsync-2",
      "evt_ss_dup",
      { ...update, eventCreated: 1_001 },
    );

    expect(first?.tier).toBe("free");
    expect(replay).toBeNull();
    expect(await tierOf("user-subsync-2")).toBe("pro");
  });
});

describe("POST /api/webhooks/stripe — subscription status sync", () => {
  it("downgrades a PRO user when the subscription is updated to paused", async () => {
    await seedUser("user-subsync-3", {
      tier: "pro",
      stripeCustomerId: "cus_ss_3",
    });

    const res = await post(
      subscriptionEvent({
        id: "evt_ss_paused",
        type: "customer.subscription.updated",
        created: 1_000,
        subId: "sub_ss_3",
        customer: "cus_ss_3",
        status: "paused",
      }),
    );

    expect(res.status).toBe(200);
    expect(await tierOf("user-subsync-3")).toBe("free");
  });

  it("keeps a legacy PRO user with no stored subscription id PRO on past_due", async () => {
    await seedUser("user-subsync-4", {
      tier: "pro",
      stripeCustomerId: "cus_ss_4",
    });

    const res = await post(
      subscriptionEvent({
        id: "evt_ss_past_due",
        type: "customer.subscription.updated",
        created: 1_000,
        subId: "sub_ss_4",
        customer: "cus_ss_4",
        status: "past_due",
      }),
    );

    expect(res.status).toBe(200);
    expect(await tierOf("user-subsync-4")).toBe("pro");
  });

  it("ignores a cancellation older than the reactivation already applied", async () => {
    await seedUser("user-subsync-5", {
      tier: "free",
      stripeCustomerId: "cus_ss_5",
    });
    const base = {
      subId: "sub_ss_5",
      customer: "cus_ss_5",
      type: "customer.subscription.updated" as const,
    };

    await post(
      subscriptionEvent({
        ...base,
        id: "evt_ss_new",
        created: 2_000,
        status: "active",
      }),
    );
    const stale = await post(
      subscriptionEvent({
        ...base,
        id: "evt_ss_old",
        created: 1_000,
        status: "canceled",
      }),
    );

    expect(stale.status).toBe(200);
    expect(await tierOf("user-subsync-5")).toBe("pro");
  });

  it("stays PRO while another subscription of the user is active", async () => {
    await seedUser("user-subsync-6", {
      tier: "free",
      stripeCustomerId: "cus_ss_6",
    });

    await post(
      subscriptionEvent({
        id: "evt_ss_6a",
        type: "customer.subscription.updated",
        created: 1_000,
        subId: "sub_ss_6a",
        customer: "cus_ss_6",
        status: "active",
      }),
    );
    await post(
      subscriptionEvent({
        id: "evt_ss_6b",
        type: "customer.subscription.updated",
        created: 1_100,
        subId: "sub_ss_6b",
        customer: "cus_ss_6",
        status: "trialing",
      }),
    );
    await post(
      subscriptionEvent({
        id: "evt_ss_6c",
        type: "customer.subscription.deleted",
        created: 1_200,
        subId: "sub_ss_6a",
        customer: "cus_ss_6",
        status: "canceled",
      }),
    );

    expect(await tierOf("user-subsync-6")).toBe("pro");
  });
});
