/**
 * Structural (not Mongoose-`Document`-bound) trip shape shared by every
 * constraint check — lets checks run against both a real `ITrip` and a
 * plain JSON fixture (backend/src/test/fixtures/*.json) with no mocking.
 */

export interface ConstraintActivity {
  name: string;
  location?: {
    coordinates?: [number, number];
    googlePlaceId?: string;
  };
  status?: string;
  requiresTransport?: boolean;
  distanceFromPrevious?: number;
}

export interface ConstraintDay {
  day: number;
  activities: ConstraintActivity[];
}

export interface ConstraintTrip {
  startDate: string | Date;
  endDate: string | Date;
  itinerary: ConstraintDay[];
}

export interface ConstraintResult {
  pass: boolean;
  summary: string;
  /** Numeric detail for aggregate reporting across many trips (a rate,
   * a count, or a signed delta — meaning is check-specific, see summary). */
  metric: number;
}
