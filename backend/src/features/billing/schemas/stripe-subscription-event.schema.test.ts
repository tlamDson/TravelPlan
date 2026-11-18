import { describe, it, expect } from "vitest";
import { stripeSubscriptionEventSchema } from "./stripe-subscription-event.schema";

const valid = {
  id: "evt_1",
  type: "customer.subscription.updated",
  created: 1_000,
  data: { object: { id: "sub_A", customer: "cus_1", status: "active" } },
};

describe("stripeSubscriptionEventSchema", () => {
  it("accepts an updated event and keeps unknown fields", () => {
    const parsed = stripeSubscriptionEventSchema.parse({
      ...valid,
      data: { object: { ...valid.data.object, items: { data: [] } } },
    });
    expect(parsed.data.object).toMatchObject({
      id: "sub_A",
      items: { data: [] },
    });
  });

  it("accepts an expanded customer and a deletion without status", () => {
    expect(
      stripeSubscriptionEventSchema.safeParse({
        ...valid,
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_A", customer: { id: "cus_1" } } },
      }).success,
    ).toBe(true);
  });

  it.each([
    [
      "an update without status",
      { ...valid, data: { object: { id: "sub_A" } } },
    ],
    [
      "a subscription id that is not a Stripe id",
      { ...valid, data: { object: { id: "sub.$x", status: "active" } } },
    ],
    [
      "a customer id that is not a Stripe id",
      {
        ...valid,
        data: { object: { id: "sub_A", customer: "a.b", status: "active" } },
      },
    ],
    ["a non-numeric created", { ...valid, created: "yesterday" }],
    ["another event type", { ...valid, type: "invoice.paid" }],
  ])("rejects %s", (_label, input) => {
    expect(stripeSubscriptionEventSchema.safeParse(input).success).toBe(false);
  });
});
