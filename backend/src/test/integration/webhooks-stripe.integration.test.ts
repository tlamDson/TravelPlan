import { describe, it, expect } from "vitest";
import request from "supertest";
import Stripe from "stripe";
import { createApp } from "../../app";
import { seedUser } from "../integration-fixtures";
import User from "../../features/user/models/User";

const app = createApp();

// Pure crypto helper — no network call, no real Stripe API key needed.
// integration-setup.ts sets STRIPE_WEBHOOK_SECRET before config/env.ts (and
// hence webhook.controller.ts) is first imported, so this must match.
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
const signer = new Stripe("sk_test_dummy_key_for_signing");

function sign(payload: string) {
  return signer.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  });
}

function checkoutCompletedEvent(
  userId: string,
  paymentStatus: "paid" | "unpaid" = "paid",
) {
  return JSON.stringify({
    id: `evt_test_checkout_${paymentStatus}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        payment_status: paymentStatus,
        metadata: { userId },
      },
    },
  });
}

function checkoutCompletedForCustomer(userId: string, customer: string) {
  return JSON.stringify({
    id: "evt_test_checkout_customer",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_3",
        object: "checkout.session",
        payment_status: "paid",
        customer,
        metadata: { userId },
      },
    },
  });
}

function subscriptionDeletedForCustomer(customer: string) {
  return JSON.stringify({
    id: "evt_test_sub_deleted_customer",
    object: "event",
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_test_2",
        object: "subscription",
        customer,
        metadata: {},
      },
    },
  });
}

function subscriptionDeletedEvent(userId: string) {
  return JSON.stringify({
    id: "evt_test_sub_deleted",
    object: "event",
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_test_1",
        object: "subscription",
        metadata: { userId },
      },
    },
  });
}

describe("POST /api/webhooks/stripe", () => {
  it("rejects a request with no stripe-signature header", async () => {
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Content-Type", "application/json")
      .send(checkoutCompletedEvent("user-1"));

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/Missing stripe-signature/);
  });

  it("rejects a request with a garbage signature", async () => {
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=1,v1=not-a-real-signature")
      .send(checkoutCompletedEvent("user-1"));

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/Webhook Error/);
  });

  it("upgrades the user to pro on a valid checkout.session.completed event", async () => {
    // This is the load-bearing assertion for the raw-body-before-express.json()
    // middleware ordering in app.ts: if express.json() ever ran first,
    // req.body would already be a parsed object, constructEvent() would
    // throw on the signature check, and this would come back 400 instead.
    await seedUser("user-stripe-1", { tier: "free" });
    const payload = checkoutCompletedEvent("user-stripe-1");

    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", sign(payload))
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const user = await User.findOne({ clerkUserId: "user-stripe-1" });
    expect(user?.tier).toBe("pro");
  });

  it("keeps the user on free when checkout.session.completed arrives unpaid", async () => {
    await seedUser("user-stripe-5", { tier: "free" });
    const payload = checkoutCompletedEvent("user-stripe-5", "unpaid");

    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", sign(payload))
      .send(payload);

    expect(res.status).toBe(200);
    const user = await User.findOne({ clerkUserId: "user-stripe-5" });
    expect(user?.tier).toBe("free");
  });

  it("downgrades the user to free on customer.subscription.deleted", async () => {
    await seedUser("user-stripe-2", { tier: "pro" });
    const payload = subscriptionDeletedEvent("user-stripe-2");

    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", sign(payload))
      .send(payload);

    expect(res.status).toBe(200);

    const user = await User.findOne({ clerkUserId: "user-stripe-2" });
    expect(user?.tier).toBe("free");
  });

  it("downgrades by Stripe customer id when the deleted subscription has no metadata.userId", async () => {
    await seedUser("user-stripe-4", { tier: "free" });
    const checkout = checkoutCompletedForCustomer(
      "user-stripe-4",
      "cus_test_4",
    );
    const upgraded = await request(app)
      .post("/api/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", sign(checkout))
      .send(checkout);
    expect(upgraded.status).toBe(200);
    const pro = await User.findOne({ clerkUserId: "user-stripe-4" });
    expect(pro?.tier).toBe("pro");
    expect(pro?.stripeCustomerId).toBe("cus_test_4");

    const deleted = subscriptionDeletedForCustomer("cus_test_4");
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", sign(deleted))
      .send(deleted);

    expect(res.status).toBe(200);
    const user = await User.findOne({ clerkUserId: "user-stripe-4" });
    expect(user?.tier).toBe("free");
  });

  it("returns 200 and leaves the user untouched when metadata.userId is missing", async () => {
    await seedUser("user-stripe-3", { tier: "free" });
    const payload = JSON.stringify({
      id: "evt_test_no_metadata",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_2", object: "checkout.session" } },
    });

    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", sign(payload))
      .send(payload);

    expect(res.status).toBe(200);
    const user = await User.findOne({ clerkUserId: "user-stripe-3" });
    expect(user?.tier).toBe("free");
  });

  it("returns 200 no-op for an unhandled event type", async () => {
    const payload = JSON.stringify({
      id: "evt_test_unhandled",
      object: "event",
      type: "invoice.paid",
      data: { object: { id: "in_test_1", object: "invoice" } },
    });

    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", sign(payload))
      .send(payload);

    expect(res.status).toBe(200);
  });
});
