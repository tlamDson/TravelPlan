import type { Request } from "express";
import { ipKeyGenerator } from "express-rate-limit";
import type { ClerkRequest } from "../types/express";

/**
 * Rate-limit key for routes open to anonymous visitors: the Clerk userId
 * when signed in, otherwise the client IP (IPv6 grouped by /56 subnet via
 * express-rate-limit's ipKeyGenerator, which takes the IP string itself).
 */
export function userOrIpRateLimitKey(req: Request): string {
  const userId = (req as ClerkRequest).auth?.()?.userId;
  if (userId) return `user:${userId}`;
  return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}
