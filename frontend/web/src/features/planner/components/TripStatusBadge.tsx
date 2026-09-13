/**
 * Trip Status Badge Component
 *
 * Feature-specific component for displaying trip status
 */

import { cn } from "@/lib/utils";
import type { TripStatus } from "@/utils/schemas";
import { STATUS_TONE_STYLES, TRIP_STATUS_TONE } from "../lib/statusStyles";

interface TripStatusBadgeProps {
  status: TripStatus;
  className?: string;
}

const statusLabel: Record<TripStatus, string> = {
  DRAFT: "Draft",
  QUEUED: "Queued",
  PROCESSING: "Processing",
  PROCESSING_STEP_1: "Processing (Plan)",
  PROCESSING_STEP_2: "Processing (Verify)",
  COMPLETED: "Completed",
  FAILED: "Failed",
  FALLBACK: "Dự phòng",
  CANCELLED: "Đã hủy",
};

export function TripStatusBadge({ status, className }: TripStatusBadgeProps) {
  const pillClassName =
    STATUS_TONE_STYLES[TRIP_STATUS_TONE[status]].pillClassName;

  return (
    <span
      data-testid="trip-status-badge"
      data-status={status}
      className={cn(
        "px-2 py-1 rounded-full text-xs font-medium",
        pillClassName,
        className,
      )}
    >
      {statusLabel[status]}
    </span>
  );
}
