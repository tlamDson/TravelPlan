import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const requireFromHere = createRequire(import.meta.url);

/** Resolve proxy-addr exactly as express does (from express's own location). */
function loadProxyAddrFromExpress() {
  const expressDir = path.dirname(requireFromHere.resolve("express/package.json"));
  const requireFromExpress = createRequire(path.join(expressDir, "package.json"));
  const pkg = requireFromExpress("proxy-addr/package.json") as { version: string };
  return { version: pkg.version };
}

function parse(version: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
  return [major, minor, patch];
}

describe("proxy-addr (CVE-2026-90711, IPv4-mapped IPv6 trust subnet spoofing)", () => {
  it("is resolved at 2.0.8 or later (the fixed release) through express", () => {
    const { version } = loadProxyAddrFromExpress();
    const [major, minor, patch] = parse(version);
    expect(major).toBe(2);
    expect(minor * 1000 + patch).toBeGreaterThanOrEqual(8);
  });
});
