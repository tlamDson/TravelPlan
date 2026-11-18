import mongoose, { Schema, Document } from "mongoose";
export interface IStripeSubscriptionState {
  customerId?: string;
  status: string;
  /** event.created (unix seconds) of the last event applied to it. */
  eventCreated: number;
}

//for type safety
export interface IUser extends Document {
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  gender: string;
  dateOfBirth: Date;
  tier: "free" | "pro";
  stripeCustomerId?: string;
  /** Recent Stripe event ids already applied to this user (bounded). */
  appliedStripeEventIds?: string[];
  /** Last applied state per Stripe subscription id (see applyStripeSubscriptionEvent). */
  stripeSubscriptions?: Map<string, IStripeSubscriptionState>;
  /** Bumped by every Stripe billing write; guards read-then-write tier sync. */
  stripeBillingRevision?: number;
  credits: number;
  quotaResetsAt?: Date;
  preferences: {
    currency: string;
    budgetRange?: number;
    travelStyle?: string[];
    travelDNA?: {
      travelFrequency?: "rarely" | "1-2_trips" | "3-5_trips" | "6+_trips";
      archetype?:
        "backpacker" | "luxury" | "digital_nomad" | "family" | "adventure";
      pacing?: "relaxed" | "balanced" | "packed";
      constraints?: {
        accessibility?: string[];
        dietary?: string[];
        avoidances?: string[];
      };
    };
  };
  notificationPreferences: {
    tripReminders: boolean;
    budgetAlerts: boolean;
    tripInvites: boolean;
    aiSuggestions: boolean;
    doNotDisturb: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    clerkUserId: {
      type: String,
      required: true,
      unique: true, // this prevent the duplicate
      index: true, //have index for faster queries
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    dateOfBirth: {
      type: Date,
    },
    gender: {
      type: String,
      default: "not_specified",
    },
    avatarUrl: String,
    tier: {
      type: String,
      enum: ["free", "pro"],
      default: "free",
    },
    credits: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Set on checkout.session.completed; lets customer.subscription.deleted
    // find the user when the subscription carries no metadata.userId.
    stripeCustomerId: {
      type: String,
      index: true,
      sparse: true,
    },
    // Written in the same atomic update as the billing change it guards, so a
    // replayed Stripe event can never apply twice (see applyStripeEvent).
    appliedStripeEventIds: {
      type: [String],
      default: undefined,
      select: false,
    },
    // Keyed by subscription id so a user with several subscriptions (or
    // Stripe customers) stays PRO while any of them is active.
    stripeSubscriptions: {
      type: Map,
      of: new Schema(
        {
          customerId: String,
          status: { type: String, required: true },
          eventCreated: { type: Number, required: true },
        },
        { _id: false },
      ),
      default: undefined,
      select: false,
    },
    stripeBillingRevision: {
      type: Number,
      default: undefined,
      select: false,
    },
    quotaResetsAt: {
      type: Date,
      default: () => {
        const nextMonth = new Date();
        nextMonth.setUTCDate(1);
        nextMonth.setUTCHours(0, 0, 0, 0);
        nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
        return nextMonth;
      },
    },
    notificationPreferences: {
      tripReminders: { type: Boolean, default: true },
      budgetAlerts: { type: Boolean, default: true },
      tripInvites: { type: Boolean, default: true },
      aiSuggestions: { type: Boolean, default: true },
      doNotDisturb: { type: Boolean, default: false },
    },
    preferences: {
      currency: {
        type: String,
        default: "USD",
      },
      budgetRange: Number,
      travelStyle: [String],
      travelDNA: {
        travelFrequency: {
          type: String,
          enum: ["rarely", "1-2_trips", "3-5_trips", "6+_trips"],
        },
        archetype: {
          type: String,
          enum: [
            "backpacker",
            "luxury",
            "digital_nomad",
            "family",
            "adventure",
          ],
        },
        pacing: {
          type: String,
          enum: ["relaxed", "balanced", "packed"],
        },
        constraints: {
          accessibility: [String],
          dietary: [String],
          avoidances: [String],
        },
      },
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<IUser>("User", UserSchema);
