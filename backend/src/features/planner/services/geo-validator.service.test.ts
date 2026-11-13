import { describe, it, expect } from "vitest";
import { geoValidatorService } from "./geo-validator.service";

// Hanoi and Da Nang city centers — real-world distance ≈ 605 km.
const HANOI: [number, number] = [105.8342, 21.0278];
const DA_NANG: [number, number] = [108.2208, 16.0544];

describe("geoValidatorService.haversineKm", () => {
  it("returns 0 for identical coordinates", () => {
    expect(geoValidatorService.haversineKm(HANOI, HANOI)).toBe(0);
  });

  it("is symmetric", () => {
    const a = geoValidatorService.haversineKm(HANOI, DA_NANG);
    const b = geoValidatorService.haversineKm(DA_NANG, HANOI);
    expect(a).toBe(b);
  });

  it("matches the known real-world distance within 1%", () => {
    const km = geoValidatorService.haversineKm(HANOI, DA_NANG);
    expect(km).toBeGreaterThan(600 * 0.99);
    expect(km).toBeLessThan(605 * 1.01);
  });
});

describe("geoValidatorService.validateDistance", () => {
  const near: [number, number] = [105.85, 21.03];

  it("rounds km to 1 decimal place", () => {
    const { km } = geoValidatorService.validateDistance(HANOI, near, "walking");
    expect(km).toBe(Math.round(km * 10) / 10);
  });

  it.each([
    ["walking", 1.5],
    ["public_transport", 10],
    ["car", 15],
  ] as const)(
    "flags requiresTransport=true only when distance exceeds the %s threshold (%dkm)",
    (mode, thresholdKm) => {
      // Two points ~ exactly at the threshold distance apart (rough lng offset).
      const farPoint: [number, number] = [
        HANOI[0] + thresholdKm / 111 + 1, // well beyond threshold
        HANOI[1],
      ];
      const result = geoValidatorService.validateDistance(
        HANOI,
        farPoint,
        mode,
      );
      expect(result.requiresTransport).toBe(true);
      expect(result.warningMessage).toMatch(
        /^The next stop is \d+\.\d km away — quite far to .+, consider a taxi\.$/,
      );
    },
  );

  it("does not set a warningMessage when under the threshold", () => {
    const result = geoValidatorService.validateDistance(HANOI, near, "car");
    expect(result.requiresTransport).toBe(false);
    expect(result.warningMessage).toBeFalsy();
  });
});
