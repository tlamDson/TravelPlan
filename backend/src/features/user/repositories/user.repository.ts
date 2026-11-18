//Why have this file : this is because instead of writing database queries in the routes oor controllers you abstract them in a repository. If you change databases, you only have to change this one file and the rest of the app doesnt care how the user is found, as long as findByEmail and findByClerkId return the user. And controllers stay skinny because the just call userRepository.create(data) instaed of dealing with mongoose-specific queries.
import { UpdateQuery } from "mongoose";
import User, { IUser } from "../models/User";

/** A user sees a handful of billing events; 50 covers any realistic replay window. */
const APPLIED_STRIPE_EVENT_HISTORY = 50;

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
