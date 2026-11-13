import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { userOrIpRateLimitKey } from "./rate-limit-key";

function req(ip: string | undefined, userId?: string): Request {
  return {
    ip,
    auth: () => (userId ? { userId } : { userId: null }),
  } as unknown as Request;
}

describe("userOrIpRateLimitKey", () => {
  it("keys a signed-in request by Clerk userId", () => {
    expect(userOrIpRateLimitKey(req("1.2.3.4", "user_1"))).toBe("user:user_1");
  });

  it("keys anonymous requests by IP, so two visitors never share a bucket", () => {
    const a = userOrIpRateLimitKey(req("1.2.3.4"));
    const b = userOrIpRateLimitKey(req("5.6.7.8"));
    expect(a).toBe("ip:1.2.3.4");
    expect(b).toBe("ip:5.6.7.8");
  });

  it("groups an IPv6 visitor by /56 subnet", () => {
    expect(userOrIpRateLimitKey(req("2001:db8:abcd:12ff::1"))).toBe(
      "ip:2001:db8:abcd:1200::/56",
    );
  });

  it("works when Clerk middleware never ran (no auth function)", () => {
    expect(userOrIpRateLimitKey({ ip: "9.9.9.9" } as Request)).toBe(
      "ip:9.9.9.9",
    );
  });
});
