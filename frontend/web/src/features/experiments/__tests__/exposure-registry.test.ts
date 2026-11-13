import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXPOSURE_STORAGE_PREFIX,
  claimExposure,
  releaseExposure,
  resetExposureRegistryForTests,
} from "../lib/exposure-registry";

const scope = { sessionId: "sess-1", userId: "user_1" };

afterEach(() => {
  resetExposureRegistryForTests();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("claimExposure()", () => {
  it("claims an experiment once per session and user", () => {
    expect(claimExposure({ ...scope, experimentKey: "cta-v1" })).toBe(true);
    expect(claimExposure({ ...scope, experimentKey: "cta-v1" })).toBe(false);
  });

  it("claims separately per experiment, session and user", () => {
    claimExposure({ ...scope, experimentKey: "cta-v1" });

    expect(claimExposure({ ...scope, experimentKey: "hero-v2" })).toBe(true);
    expect(
      claimExposure({ ...scope, sessionId: "sess-2", experimentKey: "cta-v1" }),
    ).toBe(true);
    expect(
      claimExposure({ ...scope, userId: "user_2", experimentKey: "cta-v1" }),
    ).toBe(true);
  });

  it("survives a reload in the same tab through sessionStorage", () => {
    claimExposure({ ...scope, experimentKey: "cta-v1" });
    resetExposureRegistryForTests({ keepStorage: true });

    expect(claimExposure({ ...scope, experimentKey: "cta-v1" })).toBe(false);
    expect(
      Object.keys(sessionStorage).some((k) =>
        k.startsWith(EXPOSURE_STORAGE_PREFIX),
      ),
    ).toBe(true);
  });

  it("falls back to memory when sessionStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(claimExposure({ ...scope, experimentKey: "cta-v1" })).toBe(true);
    expect(claimExposure({ ...scope, experimentKey: "cta-v1" })).toBe(false);
  });

  it("can be claimed again after a failed send is released", () => {
    const claim = { ...scope, experimentKey: "cta-v1" };
    claimExposure(claim);
    releaseExposure(claim);

    expect(claimExposure(claim)).toBe(true);
  });
});
