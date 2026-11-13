import { describe, it, expect, vi, beforeEach } from "vitest";

async function load(value: string) {
  vi.doMock("../../config/env", () => ({
    env: { EXPERIMENTS_ENABLED: value },
  }));
  return import("./experiments-flag");
}

describe("isExperimentsEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("is on only for the exact string 'true'", async () => {
    expect((await load("true")).isExperimentsEnabled()).toBe(true);
  });

  it.each(["", "false", "TRUE", "1", "yes"])("is off for %j", async (value) => {
    expect((await load(value)).isExperimentsEnabled()).toBe(false);
  });
});
