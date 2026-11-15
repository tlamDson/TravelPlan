import { Job } from "bullmq";
import { logger } from "../../../lib/logger";
import { tripRepository } from "../repositories/trip.repository";
import { userRepository } from "../../user/repositories/user.repository";
import { budgetValidatorService } from "./budget-validator.service";
import { TripPreferences } from "../schemas/trip-request.schema";
import { tripQueue, TRIP_JOB_OPTIONS } from "../trip.queue";
import {
  getJobStatusForUser,
  retryTripJobForUser,
  getTripByIdFromRepo,
  getUserTripsList,
  cancelTripJobForUser,
  cancelTripForUser,
} from "./trip-status.service";

interface GenerateTripParams {
  userId: string;
  preferences: TripPreferences;
  language?: string;
  title?: string;
}

export class PlannerService {
  /**
   * Create trip generation job with CFO validation
   */
  async createTripGenerationJob(
    params: GenerateTripParams,
  ): Promise<{ jobId: string; tripId: string }> {
    const { userId, preferences } = params;

    try {
      const startDate = new Date(preferences.startDate);
      const endDate = new Date(preferences.endDate);

      const durationCheck = budgetValidatorService.validateDuration(
        startDate,
        endDate,
      );
      if (!durationCheck.isValid) {
        throw new Error(durationCheck.reason);
      }

      const tripDays = durationCheck.days!;

      const budgetCheck = budgetValidatorService.validate({
        totalBudget: preferences.budget.total,
        currency: preferences.budget.currency,
        tripDays,
        travelers: preferences.travelers,
      });

      if (!budgetCheck.isValid) {
        logger.warn(
          { userId, reason: budgetCheck.reason },
          "Budget validation failed - rejecting request",
        );
        throw new Error(budgetCheck.reason || "Budget validation failed");
      }

      // Enforce per-tier day cap before creating DB record
      const user = await userRepository.findByClerkId(userId);
      const maxDays = user?.tier === "pro" ? 30 : 5;
      if (tripDays > maxDays) {
        throw new Error(
          `Your plan allows a maximum of ${maxDays} days per trip. Upgrade to Pro for up to 30 days.`,
        );
      }

      // DB-FIRST: Create trip record BEFORE queueing
      const tripData: any = {
        userId,
        title: params.title || `Trip to ${preferences.destination}`,
        destination: preferences.destination,
        description: `${tripDays}-day trip`,
        startDate,
        endDate,
        budget: {
          currency: preferences.budget.currency,
          totalLimit: preferences.budget.total,
          totalSpent: 0,
          breakdown: [],
        },
        itinerary: [],
        cities: [],
        status: "QUEUED",
      };

      if (preferences.purpose) tripData.purpose = preferences.purpose;
      if (preferences.groupType) tripData.groupType = preferences.groupType;
      if (preferences.priorities) tripData.priorities = preferences.priorities;
      if (preferences.mood) tripData.mood = preferences.mood;
      if (preferences.dealBreakers)
        tripData.dealBreakers = preferences.dealBreakers;

      const trip = await tripRepository.create(tripData);

      // Pro users get priority 1 (processed first), free users get priority 10
      const priority = user?.tier === "pro" ? 1 : 10;

      const job: Job = await tripQueue.add(
        "generate-trip",
        {
          userId,
          tripId: trip._id.toString(),
          preferences,
          language: params.language,
          userTier: user?.tier ?? "free",
        },
        {
          priority,
          ...TRIP_JOB_OPTIONS,
        },
      );

      await tripRepository.acquireLock(trip._id, job.id as string);

      logger.info(
        {
          jobId: job.id,
          tripId: trip._id,
          userId,
          budgetPerDay: budgetCheck.dailyBudgetPerPerson,
          priority,
          tier: user?.tier ?? "free",
        },
        "Trip generation job queued (CFO validation passed)",
      );

      return {
        jobId: job.id as string,
        tripId: trip._id.toString(),
      };
    } catch (error: any) {
      logger.error(
        { error: error.message, stack: error.stack, userId },
        "Failed to create trip generation job",
      );
      throw error;
    }
  }

  /**
   * Update user-managed trip lifecycle securely
   */
  async updateTripLifecycle(
    tripId: string,
    userId: string,
    lifecycle: import("@travelplan/shared").TripLifecycle,
  ): Promise<import("../models/Trip").ITrip> {
    logger.info(
      { tripId, userId, lifecycle },
      "[lifecycle] updateTripLifecycle called",
    );

    const trip = await tripRepository.findById(tripId);

    if (!trip) {
      logger.warn({ tripId, userId }, "[lifecycle] Trip not found");
      throw new Error("Trip not found");
    }
    if (trip.userId !== userId) {
      logger.warn(
        { tripId, userId, ownerId: trip.userId },
        "[lifecycle] Forbidden — userId mismatch",
      );
      throw new Error("Forbidden");
    }

    logger.info(
      { tripId, oldLifecycle: trip.lifecycle, newLifecycle: lifecycle },
      "[lifecycle] Updating lifecycle in DB",
    );

    const updated = await tripRepository.updateLifecycle(tripId, lifecycle);
    if (!updated) {
      logger.error({ tripId }, "[lifecycle] DB update returned null");
      throw new Error("Failed to update trip lifecycle");
    }

    logger.info(
      { tripId, lifecycle: updated.lifecycle },
      "[lifecycle] Successfully persisted lifecycle change",
    );

    return updated;
  }

  // Delegate status/retry/query/cancel operations to trip-status.service
  getJobStatusForUser = getJobStatusForUser;
  retryTripJobForUser = retryTripJobForUser;
  cancelTripJobForUser = cancelTripJobForUser;
  cancelTripForUser = cancelTripForUser;
  getTripById = getTripByIdFromRepo;
  getUserTrips = getUserTripsList;
}

export const plannerService = new PlannerService();
