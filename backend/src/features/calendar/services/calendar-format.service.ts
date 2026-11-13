/**
 * Calendar Format Service
 *
 * Converts TravelPlan IItineraryDay[] into Google Calendar event format.
 * Uses activity._id as the idempotency key (Entity ID, not index) to avoid
 * Index Shifting issues when the user reorders activities.
 */

import type { IItineraryDay } from "../../planner/models/Trip.types";
import { getTimezoneForDestination } from "../data/destination-timezone";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { Types } from "mongoose";

const APP_URL = process.env.FRONTEND_URL || "http://localhost:5173";

export interface GoogleCalendarEventInput {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: string;
}

export interface EventWithKey {
  /** activity._id.toString() — Entity ID, not index. Reorder-safe. */
  key: string;
  event: GoogleCalendarEventInput;
}

/**
 * Parse "HH:MM" or "H:MM" string into [hour, minute] tuple
 */
function parseTime(s: string): [number, number] {
  const m = s.match(/(\d{1,2}):(\d{2})/);
  return m ? [parseInt(m[1]!, 10), parseInt(m[2]!, 10)] : [9, 0];
}

/**
 * Convert the entire itinerary into a flat list of Google Calendar events,
 * each tagged with its activity._id as the idempotency key.
 */
export function itineraryToGoogleEvents(
  itinerary: IItineraryDay[],
  tripId: string,
  destination?: string,
  _tripTitle?: string,
): EventWithKey[] {
  const tz = getTimezoneForDestination(destination);
  const events: EventWithKey[] = [];
  const tripLink = `${APP_URL}/trips/${tripId}`;
  const footer = `\n\n✨ View trip details: ${tripLink}`;

  for (let dayIdx = 0; dayIdx < itinerary.length; dayIdx++) {
    const day = itinerary[dayIdx]!;
    const dayDate = new Date(day.date);
    const y = dayDate.getUTCFullYear();
    const m = dayDate.getUTCMonth();
    const d = dayDate.getUTCDate();

    for (let actIdx = 0; actIdx < day.activities.length; actIdx++) {
      const act = day.activities[actIdx]!;

      // ✅ Entity ID as key — stable when the user reorders activities
      const actWithId = act as IItineraryDay["activities"][0] & {
        _id?: Types.ObjectId;
      };
      const key = actWithId._id?.toString();
      if (!key) {
        throw new Error(
          `Activity at day ${dayIdx} idx ${actIdx} is missing _id — cannot generate idempotency key`,
        );
      }

      const nextAct = day.activities[actIdx + 1];

      const [startHour, startMin] = parseTime(act.time ?? "09:00");
      let endHour, endMin;

      if (act.endTime) {
        [endHour, endMin] = parseTime(act.endTime);
      } else if (nextAct && nextAct.time) {
        [endHour, endMin] = parseTime(nextAct.time);
      } else {
        endHour = startHour + 2;
        endMin = startMin;
      }

      // Use UTC to isolate year/month/day wall-time values from the server's local timezone (e.g. EDT)
      const startWall = new Date(Date.UTC(y, m, d, startHour, startMin, 0));
      const endWall = new Date(Date.UTC(y, m, d, endHour, endMin, 0));

      const startLocalStr = `${startWall.getUTCFullYear()}-${String(startWall.getUTCMonth() + 1).padStart(2, "0")}-${String(startWall.getUTCDate()).padStart(2, "0")}T${String(startWall.getUTCHours()).padStart(2, "0")}:${String(startWall.getUTCMinutes()).padStart(2, "0")}:00`;
      const endLocalStr = `${endWall.getUTCFullYear()}-${String(endWall.getUTCMonth() + 1).padStart(2, "0")}-${String(endWall.getUTCDate()).padStart(2, "0")}T${String(endWall.getUTCHours()).padStart(2, "0")}:${String(endWall.getUTCMinutes()).padStart(2, "0")}:00`;

      // Assign the destination timezone to the isolated wall-time string
      const startUtc = fromZonedTime(startLocalStr, tz);
      const endUtc = fromZonedTime(endLocalStr, tz);

      const startStr = formatInTimeZone(
        startUtc,
        tz,
        "yyyy-MM-dd'T'HH:mm:ssXXX",
      );
      const endStr = formatInTimeZone(endUtc, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");

      const description = (act.notes ?? "") + footer;
      const location = act.location?.coordinates
        ? `${act.location.coordinates[1]},${act.location.coordinates[0]}`
        : undefined;

      events.push({
        key,
        event: {
          summary: act.name,
          description,
          start: { dateTime: startStr, timeZone: tz },
          end: { dateTime: endStr, timeZone: tz },
          ...(location && { location }),
        },
      });
    }
  }

  return events;
}
