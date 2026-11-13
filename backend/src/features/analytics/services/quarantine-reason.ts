import { analyticsEventSchema } from "@travelplan/shared";
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
  // Set only by client-event-policy.ts (schema-valid, but claims a userId
  // that is not the signed-in user).
  "user_mismatch",
] as const;
export type QuarantineReason = (typeof QUARANTINE_REASONS)[number];

/**
 * What is stored about one validation issue. Nothing here is copied from
 * the client: zod's `message` is dropped on purpose (it quotes unknown key
 * names and can quote values), and `path` / `code` are masked unless they
 * are names this codebase defines.
 */
export interface QuarantineIssue {
  /**
   * Dotted path into the raw event ("" for the event itself). A segment
   * that is not a catalog field name (a client-chosen key, an array index)
   * is stored as "*".
   */
  path: string;
  /** Zod issue code or a policy code; "unknown" when not code-shaped. */
  code: string;
}

export const QUARANTINE_MAX_ISSUES = 20;

type ZodIssue = z.core.$ZodIssue;

/** Every field name the catalog defines: envelope keys and property keys. */
const CATALOG_FIELDS: ReadonlySet<string> = new Set(
  analyticsEventSchema.options.flatMap((o) => [
    ...Object.keys(o.shape),
    ...Object.keys(o.shape.properties.shape),
  ]),
);
const MASKED_SEGMENT = "*";
const CODE_SHAPE = /^[a-z_]{1,40}$/;

function safePath(path: readonly PropertyKey[]): string {
  return path
    .map((key) =>
      typeof key === "string" && CATALOG_FIELDS.has(key) ? key : MASKED_SEGMENT,
    )
    .join(".");
}

function safeCode(code: unknown): string {
  return typeof code === "string" && CODE_SHAPE.test(code) ? code : "unknown";
}

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
      path: safePath(i.path),
      code: safeCode(i.code),
    })),
  };
}
