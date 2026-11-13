import type { z } from "zod";

/**
 * Why an event was quarantined. Ordered most specific first: when an event
 * has several issues, the earliest reason in this list labels it.
 */
export const QUARANTINE_REASONS = [
  "unknown_event",
  "wrong_source",
  "missing_field",
  "unknown_field",
  "wrong_type",
] as const;
export type QuarantineReason = (typeof QUARANTINE_REASONS)[number];

export interface QuarantineIssue {
  /** Dotted path into the raw event ("" for the event itself). */
  path: string;
  code: string;
  message: string;
}

export const QUARANTINE_MAX_ISSUES = 20;

type ZodIssue = z.core.$ZodIssue;

function valueAt(raw: unknown, path: readonly PropertyKey[]): unknown {
  let cur: unknown = raw;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[key];
  }
  return cur;
}

function reasonOf(raw: unknown, issue: ZodIssue): QuarantineReason {
  const [head] = issue.path;
  if (issue.code === "invalid_union" && head === "name") return "unknown_event";
  if (issue.path.length === 1 && head === "source") return "wrong_source";
  if (issue.code === "invalid_type" && valueAt(raw, issue.path) === undefined) {
    return "missing_field";
  }
  if (issue.code === "unrecognized_keys") return "unknown_field";
  return "wrong_type";
}

/** Labels a failed `analyticsEventSchema` parse for the quarantine store. */
export function classifyQuarantine(
  raw: unknown,
  issues: readonly ZodIssue[],
): { reason: QuarantineReason; issues: QuarantineIssue[] } {
  const reasons = new Set(issues.map((i) => reasonOf(raw, i)));
  const reason = QUARANTINE_REASONS.find((r) => reasons.has(r)) ?? "wrong_type";
  return {
    reason,
    issues: issues.slice(0, QUARANTINE_MAX_ISSUES).map((i) => ({
      path: i.path.map(String).join("."),
      code: i.code,
      message: i.message,
    })),
  };
}
