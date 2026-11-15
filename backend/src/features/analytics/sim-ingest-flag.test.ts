import { describe, it, expect, vi, beforeEach } from "vitest";

async function load(env: Record<string, string>) {
  vi.doMock("../../config/env", () => ({ env }));
  return import("./sim-ingest-flag");
}

describe("isSimIngestEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns true only when ANALYTICS_SIM_INGEST is exactly 'true'", async () => {
    const on = await load({ ANALYTICS_SIM_INGEST: "true" });
    expect(on.isSimIngestEnabled()).toBe(true);
  });

  it("is off when unset and for loosely-truthy values", async () => {
    for (const value of ["", "1", "TRUE", "yes"]) {
      vi.resetModules();
      const mod = await load({ ANALYTICS_SIM_INGEST: value });
      expect(mod.isSimIngestEnabled()).toBe(false);
    }
  });
});

describe("assertSimIngestAllowed", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("allows development and test processes", async () => {
    for (const NODE_ENV of ["development", "test"]) {
      vi.resetModules();
      const mod = await load({ ANALYTICS_SIM_INGEST: "true", NODE_ENV });
      expect(() => mod.assertSimIngestAllowed()).not.toThrow();
    }
  });

  it("refuses NODE_ENV=production, which staging runs as too", async () => {
    const mod = await load({
      ANALYTICS_SIM_INGEST: "true",
      NODE_ENV: "production",
      APP_ENV: "staging",
    });
    expect(() => mod.assertSimIngestAllowed()).toThrow(/ANALYTICS_SIM_INGEST/);
  });
});
