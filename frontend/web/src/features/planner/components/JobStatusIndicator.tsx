/**
 * Job Status Indicator Component
 *
 * Section 2.2: Real-Time Feedback
 * Displays "Intermediate Steps" (e.g., "Scanning Weather...", "Verifying Prices")
 * NOT just a generic "Loading..." spinner
 */

import { Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@/utils/schemas";
import {
  STATUS_TONE_STYLES,
  JOB_STATUS_TONE,
  JOB_STATUS_ICON,
} from "../lib/statusStyles";

interface JobStatusIndicatorProps {
  status: JobStatus;
  progress?: number;
  currentStep?: string | null;
  className?: string;
  /** Show detailed progress bar */
  showProgress?: boolean;
}

const statusLabel: Record<JobStatus, string> = {
  IDLE: "Ready",
  QUEUED: "In queue...",
  PROCESSING: "Processing...",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function JobStatusIndicator({
  status,
  progress = 0,
  currentStep,
  className,
  showProgress = true,
}: JobStatusIndicatorProps) {
  const Icon = JOB_STATUS_ICON[status];
  const textClassName =
    STATUS_TONE_STYLES[JOB_STATUS_TONE[status]].textClassName;
  const isAnimated = status === "PROCESSING" || status === "QUEUED";

  return (
    <div
      className={cn("space-y-2", className)}
      data-testid="job-status"
      data-status={status}
    >
      {/* Status Header */}
      <div className="flex items-center gap-2">
        <Icon
          className={cn("h-5 w-5", textClassName, isAnimated && "animate-spin")}
          aria-hidden="true"
        />
        <span className={cn("font-medium", textClassName)}>
          {statusLabel[status]}
        </span>
      </div>

      {/* Current Step - Section 2.2: Display intermediate steps */}
      {currentStep && status === "PROCESSING" && (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-testid="job-status-step"
        >
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>{currentStep}</span>
        </div>
      )}

      {/* Progress Bar */}
      {showProgress && (status === "PROCESSING" || status === "QUEUED") && (
        <Progress value={progress} className="h-2" />
      )}
    </div>
  );
}

/**
 * Inline version for compact displays
 */
export function JobStatusBadge({
  status,
  currentStep,
}: {
  status: JobStatus;
  currentStep?: string | null;
}) {
  const Icon = JOB_STATUS_ICON[status];
  const pillClassName =
    STATUS_TONE_STYLES[JOB_STATUS_TONE[status]].pillClassName;
  const isAnimated = status === "PROCESSING" || status === "QUEUED";

  return (
    <div
      data-testid="job-status-badge"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
        pillClassName,
      )}
    >
      <Icon
        className={cn("h-3 w-3", isAnimated && "animate-spin")}
        aria-hidden="true"
      />
      <span>{currentStep || statusLabel[status]}</span>
    </div>
  );
}
