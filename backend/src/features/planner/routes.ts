import { Router } from "express";
import {
  getJobStatus,
  retryJob,
  cancelJob,
} from "./controllers/planner.controller";
import {
  generateTrip,
  getTripById,
  getUserTrips,
  deleteTripById,
  updateTripById,
  undoTrip,
  reGeocodeTrip,
  updateTripLifecycle,
  reorderActivities,
  regenActivity,
  getTripChunk,
  cancelTrip,
} from "./controllers/trip.controller";
import { requireUserAuth } from "../../middlewares/auth";
import {
  jobStatusLimiter,
  tripCreationLimiter,
} from "../../middlewares/rate-limiter";
import { idempotencyMiddleware } from "../../middlewares/idempotency.middleware";

const router = Router();

/**
 * @swagger
 * /api/trips:
 *   post:
 *     summary: Generate new trip
 *     description: Creates a trip generation job with budget validation
 *     tags: [Trips]
 *     security:
 *       - ClerkAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               preferences:
 *                 type: object
 *                 required: true
 *     responses:
 *       202:
 *         description: Trip generation started
 *       400:
 *         description: Validation error (budget too low, invalid dates, etc.)
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/trips",
  requireUserAuth,
  tripCreationLimiter,
  idempotencyMiddleware,
  generateTrip,
);

/**
 * @swagger
 * /api/trips/{tripId}:
 *   get:
 *     summary: Get trip by ID
 *     description: Retrieve a specific trip (for polling)
 *     tags: [Trips]
 *     security:
 *       - ClerkAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trip data
 *       404:
 *         description: Trip not found
 *       403:
 *         description: Forbidden (not owner)
 */
router.get("/trips/:tripId", requireUserAuth, getTripById);

/**
 * @swagger
 * /api/trips:
 *   get:
 *     summary: Get user's trips
 *     description: Retrieve all trips for authenticated user
 *     tags: [Trips]
 *     security:
 *       - ClerkAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of trips
 */
router.get("/trips", requireUserAuth, getUserTrips);

/**
 * @swagger
 * /api/jobs/{jobId}:
 *   get:
 *     summary: Get job status
 *     description: Retrieve job status/progress for polling
 *     tags: [Jobs]
 *     security:
 *       - ClerkAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job status
 *       404:
 *         description: Job not found
 *       403:
 *         description: Forbidden (not owner)
 */
router.get("/jobs/:jobId", jobStatusLimiter, requireUserAuth, getJobStatus);

/**
 * @swagger
 * /api/jobs/{jobId}/retry:
 *   post:
 *     summary: Retry a failed job
 *     description: Re-queues a failed trip generation job
 *     tags: [Jobs]
 *     security:
 *       - ClerkAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       202:
 *         description: Retry queued
 *       400:
 *         description: Job not failed
 *       404:
 *         description: Job not found
 *       409:
 *         description: Trip locked
 */
router.post("/jobs/:jobId/retry", requireUserAuth, retryJob);

/**
 * @swagger
 * /api/jobs/{jobId}/cancel:
 *   post:
 *     summary: Cancel a running/queued job
 *     description: Removes a trip generation job from BullMQ and marks it CANCELLED
 *     tags: [Jobs]
 *     security:
 *       - ClerkAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job cancelled
 *       400:
 *         description: Job already finished
 *       404:
 *         description: Job not found
 *       403:
 *         description: Forbidden
 */
router.post("/jobs/:jobId/cancel", requireUserAuth, cancelJob);

/**
 * @swagger
 * /api/trips/{tripId}/cancel:
 *   post:
 *     summary: Cancel trip generation
 *     description: Cancels an ongoing AI trip generation by tripId
 *     tags: [Trips]
 *     security:
 *       - ClerkAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trip cancelled
 *       400:
 *         description: Trip not currently processing
 *       404:
 *         description: Trip not found
 *       403:
 *         description: Forbidden
 */
router.post("/trips/:tripId/cancel", requireUserAuth, cancelTrip);

/**
 * @swagger
 * /api/trips/{tripId}:
 *   delete:
 *     summary: Delete a trip
 *     tags: [Trips]
 *     security:
 *       - ClerkAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trip deleted
 *       403:
 *         description: Forbidden (not owner)
 *       404:
 *         description: Trip not found
 */
router.delete("/trips/:tripId", requireUserAuth, deleteTripById);

/**
 * PATCH /api/trips/:tripId - Update trip fields
 */
router.patch("/trips/:tripId", requireUserAuth, updateTripById);

/**
 * PATCH /api/trips/:tripId/undo — Restore most recent itinerary snapshot
 */
router.patch("/trips/:tripId/undo", requireUserAuth, undoTrip);

/**
 * PATCH /api/trips/:tripId/lifecycle — Update user lifecycle status
 */
router.patch("/trips/:tripId/lifecycle", requireUserAuth, updateTripLifecycle);

/**
 * POST /api/trips/:tripId/regeocode — Re-geocode all activities using Google Places / Mapbox
 * Use when a trip was generated before API keys were configured.
 */
router.post("/trips/:tripId/regeocode", requireUserAuth, reGeocodeTrip);

/**
 * PATCH /api/trips/:tripId/reorder-activities — Reorder activities within a day (drag-and-drop)
 * Body: { dayIndex: number, orderedActivityIds: string[] }
 */
router.patch(
  "/trips/:tripId/reorder-activities",
  requireUserAuth,
  reorderActivities,
);

/**
 * POST /api/trips/:tripId/regen-activity — Regenerate a single activity with a new AI suggestion
 * Body: { dayIndex: number, activityId: string }
 */
router.post("/trips/:tripId/regen-activity", requireUserAuth, regenActivity);

/**
 * GET /api/trips/:tripId/chunks/:chunkIndex — Get a specific 3-day chunk (Pro chunked trips)
 * Returns 202 if chunk is not yet ready (still being generated).
 */
router.get("/trips/:tripId/chunks/:chunkIndex", requireUserAuth, getTripChunk);

export default router;
