import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { corsOptions } from "./cors";

type OriginCallback = (err: Error | null, allow?: boolean) => void;
type OriginFn = (origin: string | undefined, callback: OriginCallback) => void;

function checkOrigin(origin: string | undefined): Promise<boolean> {
  return new Promise((resolve, reject) => {
    (corsOptions.origin as OriginFn)(origin, (err, allow) => {
      if (err) reject(err);
      else resolve(!!allow);
    });
  });
}

describe("corsOptions.origin", () => {
  it("allows requests with no Origin header (server-to-server)", async () => {
    await expect(checkOrigin(undefined)).resolves.toBe(true);
  });

  it("allows known local dev origins", async () => {
    await expect(checkOrigin("http://localhost:5173")).resolves.toBe(true);
    await expect(checkOrigin("http://127.0.0.1:3000")).resolves.toBe(true);
  });

  it("normalizes a trailing slash before matching", async () => {
    await expect(checkOrigin("http://localhost:5173/")).resolves.toBe(true);
  });

  it("blocks an arbitrary *.vercel.app origin when no Vercel project is configured", async () => {
    await expect(checkOrigin("https://attacker.vercel.app")).resolves.toBe(
      false,
    );
    await expect(
      checkOrigin("https://travelplan-preview.vercel.app"),
    ).resolves.toBe(false);
  });

  it("blocks a domain that merely contains .vercel.app as a suffix trick", async () => {
    await expect(
      checkOrigin("https://evil-vercel.app.attacker.com"),
    ).resolves.toBe(false);
  });

  it("blocks an unrecognized origin", async () => {
    await expect(checkOrigin("https://not-allowed.example.com")).resolves.toBe(
      false,
    );
  });
});

describe("corsOptions.allowedHeaders", () => {
  it("includes x-idempotency-key (required for POST /api/trips)", () => {
    expect(corsOptions.allowedHeaders).toContain("x-idempotency-key");
  });
});

describe("corsOptions.origin — env-driven allowlist", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("allows an origin listed in CORS_ALLOWED_ORIGINS", async () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://partner.example.com";
    const { corsOptions: freshCorsOptions } = await import("./cors");
    const result = await new Promise<boolean>((resolve, reject) => {
      (freshCorsOptions.origin as OriginFn)(
        "https://partner.example.com",
        (err, allow) => (err ? reject(err) : resolve(!!allow)),
      );
    });
    expect(result).toBe(true);
  });

  it("allows the configured FRONTEND_URL even when not in the local set", async () => {
    process.env.FRONTEND_URL = "https://app.travelplan.example";
    const { corsOptions: freshCorsOptions } = await import("./cors");
    const result = await new Promise<boolean>((resolve, reject) => {
      (freshCorsOptions.origin as OriginFn)(
        "https://app.travelplan.example",
        (err, allow) => (err ? reject(err) : resolve(!!allow)),
      );
    });
    expect(result).toBe(true);
  });
});

describe("corsOptions.origin — Vercel preview pattern", () => {
  const ORIGINAL_ENV = { ...process.env };

  async function checkFresh(origin: string): Promise<boolean> {
    const { corsOptions: fresh } = await import("./cors");
    return new Promise<boolean>((resolve, reject) => {
      (fresh.origin as OriginFn)(origin, (err, allow) =>
        err ? reject(err) : resolve(!!allow),
      );
    });
  }

  beforeEach(() => {
    vi.resetModules();
    process.env.CORS_VERCEL_PROJECT = "travelplan-web";
    process.env.CORS_VERCEL_SCOPE = "lam-phams-projects-44c4677b";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("allows a preview deployment of the configured project and scope", async () => {
    await expect(
      checkFresh(
        "https://travelplan-web-k3j9x2abc-lam-phams-projects-44c4677b.vercel.app",
      ),
    ).resolves.toBe(true);
  });

  it("allows the develop branch alias of the configured project and scope", async () => {
    await expect(
      checkFresh(
        "https://travelplan-web-git-develop-lam-phams-projects-44c4677b.vercel.app",
      ),
    ).resolves.toBe(true);
  });

  it("blocks an attacker-owned Vercel project", async () => {
    await expect(checkFresh("https://attacker.vercel.app")).resolves.toBe(
      false,
    );
  });

  it("blocks the right project name under another scope", async () => {
    await expect(
      checkFresh("https://travelplan-web-abc123-attacker-scope.vercel.app"),
    ).resolves.toBe(false);
  });

  it("blocks a lookalike that only embeds the pattern in a longer host", async () => {
    await expect(
      checkFresh(
        "https://evil-travelplan-web-abc123-lam-phams-projects-44c4677b.vercel.app",
      ),
    ).resolves.toBe(false);
    await expect(
      checkFresh(
        "https://travelplan-web-abc123-lam-phams-projects-44c4677b.vercel.app.attacker.com",
      ),
    ).resolves.toBe(false);
  });

  it("blocks plain http for a preview host", async () => {
    await expect(
      checkFresh(
        "http://travelplan-web-abc123-lam-phams-projects-44c4677b.vercel.app",
      ),
    ).resolves.toBe(false);
  });
});
