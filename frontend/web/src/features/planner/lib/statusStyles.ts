import {
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { TripStatus, JobStatus } from "@/utils/schemas";

/**
 * Single source of truth for trip/job status colors. Previously
 * TripStatusBadge, JobStatusIndicator/JobStatusBadge, and TripCard each
 * hand-rolled their own raw-Tailwind-palette scheme for the same status
 * vocabulary (e.g. QUEUED was blue in one, yellow in another). Every
 * status now maps to one of 5 semantic tones, and each tone carries the
 * 3 class strings the 3 different render contexts need:
 *
 * - pillClassName: light pill (bg-tag-gray, text-tag-gray-text, etc.) for
 *   badges on a plain card/page background — reuses the tag-* CSS tokens
 *   exposed in PR #66, which are already themed for exactly this (pale bg
 *   + dark text in light mode, solid bg + white text in dark mode), so no
 *   `dark:` prefix is needed here at all.
 * - textClassName: icon/label-only (no background), for a status row
 *   sitting directly on the page — kept as the same plain Tailwind
 *   shades JobStatusIndicator already used (they're legible in both
 *   themes without a dark: pair), not yet tokenized. That's Wave 1 color
 *   sweep scope, not this status-unification PR.
 * - overlayPillClassName: solid dark pill at reduced opacity, for
 *   TripCard's status badge which sits on top of a trip cover photo and
 *   needs guaranteed contrast regardless of the photo underneath.
 */

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export interface StatusToneStyle {
  pillClassName: string;
  textClassName: string;
  overlayPillClassName: string;
}

export const STATUS_TONE_STYLES: Record<StatusTone, StatusToneStyle> = {
  neutral: {
    pillClassName: "bg-tag-gray text-tag-gray-text",
    textClassName: "text-muted-foreground",
    overlayPillClassName: "bg-slate-700/80 text-slate-200",
  },
  info: {
    pillClassName: "bg-tag-blue text-tag-blue-text",
    textClassName: "text-blue-500",
    overlayPillClassName: "bg-blue-700/80 text-blue-100",
  },
  warning: {
    pillClassName: "bg-tag-yellow text-tag-yellow-text",
    textClassName: "text-yellow-500",
    overlayPillClassName: "bg-amber-600/80 text-amber-100",
  },
  success: {
    pillClassName: "bg-tag-green text-tag-green-text",
    textClassName: "text-green-500",
    overlayPillClassName: "bg-emerald-700/80 text-emerald-100",
  },
  danger: {
    pillClassName: "bg-tag-red text-tag-red-text",
    textClassName: "text-destructive",
    overlayPillClassName: "bg-red-700/80 text-red-100",
  },
};

export const TRIP_STATUS_TONE: Record<TripStatus, StatusTone> = {
  DRAFT: "neutral",
  QUEUED: "info",
  PROCESSING: "warning",
  PROCESSING_STEP_1: "warning",
  PROCESSING_STEP_2: "warning",
  COMPLETED: "success",
  FAILED: "danger",
  FALLBACK: "warning",
  CANCELLED: "neutral",
};

export const JOB_STATUS_TONE: Record<JobStatus, StatusTone> = {
  IDLE: "neutral",
  QUEUED: "info",
  PROCESSING: "warning",
  COMPLETED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

export const JOB_STATUS_ICON: Record<JobStatus, LucideIcon> = {
  IDLE: Clock,
  QUEUED: Clock,
  PROCESSING: Loader2,
  COMPLETED: CheckCircle,
  FAILED: XCircle,
  CANCELLED: XCircle,
};
