/**
 * GeoValidatorService
 * Pure math functions — no API calls, no side effects, fully testable.
 *
 * Validates distances between consecutive activities based on the user's
 * chosen transport mode and flags activities that are too far apart.
 */

export type TransportMode = "walking" | "public_transport" | "car";

export interface DistanceResult {
  km: number;
  requiresTransport: boolean;
  warningMessage?: string;
}

// Max comfortable distances per mode (per user decision)
const THRESHOLDS_KM: Record<TransportMode, number> = {
  walking: 1.5, // > 1.5km walking is uncomfortable
  public_transport: 10, // > 10km on public transport is a long ride
  car: 15, // > 15km by car between two city attractions is too far
};

const MODE_LABEL: Record<TransportMode, string> = {
  walking: "walk",
  public_transport: "take public transport",
  car: "drive",
};

export class GeoValidatorService {
  /**
   * Haversine formula — calculates straight-line distance between two
   * [lng, lat] coordinates in kilometres.
   */
  haversineKm(a: [number, number], b: [number, number]): number {
    const R = 6371; // Earth radius in km
    const [lng1, lat1] = a;
    const [lng2, lat2] = b;

    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);

    const haversine =
      sinDLat * sinDLat +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        sinDLng *
        sinDLng;

    return R * 2 * Math.asin(Math.sqrt(haversine));
  }

  /**
   * Validates distance between two activities.
   * Returns requiresTransport = true when the gap exceeds the threshold
   * for the chosen transport mode, and a localized warning message.
   */
  validateDistance(
    a: [number, number],
    b: [number, number],
    mode: TransportMode,
  ): DistanceResult {
    const km = this.haversineKm(a, b);
    const threshold = THRESHOLDS_KM[mode];
    const requiresTransport = km > threshold;

    const result: DistanceResult = {
      km: Math.round(km * 10) / 10,
      requiresTransport,
    };

    if (requiresTransport) {
      result.warningMessage = `The next stop is ${km.toFixed(1)} km away — quite far to ${MODE_LABEL[mode]}, consider a taxi.`;
    }

    return result;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}

export const geoValidatorService = new GeoValidatorService();
