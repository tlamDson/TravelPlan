//Why have this file : this is because instead of writing database queries in the routes oor controllers you abstract them in a repository. If you change databases, you only have to change this one file and the rest of the app doesnt care how the user is found, as long as findByEmail and findByClerkId return the user. And controllers stay skinny because the just call userRepository.create(data) instaed of dealing with mongoose-specific queries.
import { UpdateQuery } from "mongoose";
import User, { IStripeSubscriptionState, IUser } from "../models/User";

/** A user sees a handful of billing events; 50 covers any realistic replay window. */
const APPLIED_STRIPE_EVENT_HISTORY = 50;
/** Stripe ids are [A-Za-z0-9_]; anything else must never become a Mongo path. */
const STRIPE_ID = /^[A-Za-z0-9_]+$/;

/** A missing revision counts as 0 (users written before it existed). */
const revisionFilter = (revision: number) =>
  revision === 0 ? { $in: [null, 0] } : revision;

export interface StripeBillingState {
  tier: IUser["tier"];
  stripeCustomerId?: string;
  subscriptions: Record<string, IStripeSubscriptionState>;
  appliedEventIds: string[];
  revision: number;
}

export interface StripeSubscriptionUpdate extends IStripeSubscriptionState {
  subscriptionId: string;
  tier?: IUser["tier"];
}

export class UserRepository {
  //lok up a user by their email address
  async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email });
  }

  //Finds a user based on their Clerk ID
  async findByClerkId(clerkUserId: string): Promise<IUser | null> {
    return User.findOne({ clerkUserId });
  }
  async findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<IUser | null> {
    return User.findOne({ stripeCustomerId });
  }
  // Takes a partial user object and saves it to the db
  async create(userData: Partial<IUser>): Promise<IUser> {
    const user = new User(userData);
    return user.save();
  }
  //Finds a user by their _id and applies changes
  async update(
    id: string,
    updateData: UpdateQuery<IUser>,
  ): Promise<IUser | null> {
    return User.findByIdAndUpdate(id, updateData, { new: true });
  }

  async updateByClerkId(
    clerkUserId: string,
    updateData: UpdateQuery<IUser>,
  ): Promise<IUser | null> {
    return User.findOneAndUpdate({ clerkUserId }, updateData, { new: true });
  }

  /**
   * Apply a Stripe-driven update at most once per event id. The id is pushed
   * in the same single-document update as the change, so replays, concurrent
   * deliveries and lost completion records cannot apply it twice.
   * Returns null when the user is missing or the event was already applied.
   */
  async applyStripeEvent(
    clerkUserId: string,
    eventId: string,
    updateData: Partial<Pick<IUser, "tier" | "stripeCustomerId">>,
  ): Promise<IUser | null> {
    return User.findOneAndUpdate(
      { clerkUserId, appliedStripeEventIds: { $ne: eventId } },
      {
        $set: updateData,
        $inc: { stripeBillingRevision: 1 },
        $push: {
          appliedStripeEventIds: {
            $each: [eventId],
            $slice: -APPLIED_STRIPE_EVENT_HISTORY,
          },
        },
      },
      { new: true },
    );
  }

  async findStripeBillingState(
    clerkUserId: string,
  ): Promise<StripeBillingState | null> {
    const user = await User.findOne({ clerkUserId })
      .select({
        tier: 1,
        stripeCustomerId: 1,
        stripeSubscriptions: 1,
        appliedStripeEventIds: 1,
        stripeBillingRevision: 1,
      })
      .lean<{
        tier: IUser["tier"];
        stripeCustomerId?: string;
        stripeSubscriptions?: Record<string, IStripeSubscriptionState>;
        appliedStripeEventIds?: string[];
        stripeBillingRevision?: number;
      }>();
    if (!user) return null;
    return {
      tier: user.tier,
      ...(user.stripeCustomerId
        ? { stripeCustomerId: user.stripeCustomerId }
        : {}),
      subscriptions: user.stripeSubscriptions ?? {},
      appliedEventIds: user.appliedStripeEventIds ?? [],
      revision: user.stripeBillingRevision ?? 0,
    };
  }

  /**
   * Record a subscription's status (and the tier, when given) for one Stripe
   * event, atomically and at most once per event id. Returns null — nothing
   * written — when the event was already applied, an event at least as new
   * was already applied to that subscription, or another billing write
   * happened since `expectedRevision` was read (the caller re-reads).
   */
  async applyStripeSubscriptionEvent(
    clerkUserId: string,
    eventId: string,
    update: StripeSubscriptionUpdate,
    expectedRevision: number,
  ): Promise<IUser | null> {
    const { subscriptionId, tier, ...entry } = update;
    if (!STRIPE_ID.test(subscriptionId)) {
      throw new Error(`Invalid Stripe subscription id: ${subscriptionId}`);
    }
    const path = `stripeSubscriptions.${subscriptionId}`;
    return User.findOneAndUpdate(
      {
        clerkUserId,
        appliedStripeEventIds: { $ne: eventId },
        stripeBillingRevision: revisionFilter(expectedRevision),
        $nor: [{ [`${path}.eventCreated`]: { $gte: entry.eventCreated } }],
      },
      {
        $set: { [path]: entry, ...(tier ? { tier } : {}) },
        $inc: { stripeBillingRevision: 1 },
        $push: {
          appliedStripeEventIds: {
            $each: [eventId],
            $slice: -APPLIED_STRIPE_EVENT_HISTORY,
          },
        },
      },
      { new: true },
    );
  }

  async decrementCredit(clerkUserId: string): Promise<IUser | null> {
    return User.findOneAndUpdate(
      { clerkUserId, credits: { $gt: 0 } },
      { $inc: { credits: -1 } },
      { new: true },
    );
  }

  async incrementCredit(clerkUserId: string): Promise<IUser | null> {
    return User.findOneAndUpdate(
      { clerkUserId },
      { $inc: { credits: 1 } },
      { new: true },
    );
  }
}

export const userRepository = new UserRepository();
