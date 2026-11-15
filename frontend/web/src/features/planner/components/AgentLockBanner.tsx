/**
 * Agent Lock Banner Component
 *
 * Shows when AI is processing a trip
 * Prevents user edits during agent processing
 */

import { Loader2, XCircle, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { JobStatusIndicator } from "./JobStatusIndicator";
import type { JobStatus } from "@/utils/schemas";
import { useEffect, useState } from "react";

// Progressive loading messages — cycle through as seconds pass
const LOADING_MESSAGES = [
  { after: 0, text: "Analyzing your request..." },
  { after: 4, text: "Finding matching places..." },
  { after: 10, text: "Building your itinerary around your interests..." },
  { after: 18, text: "Optimizing the route by area..." },
  { after: 28, text: "Almost done, just a little longer..." },
];

function useProgressiveMessage(
  isActive: boolean,
  overrideStep?: string | null,
): string {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      clearInterval(interval);
      setElapsed(0);
    };
  }, [isActive]);

  if (overrideStep) return overrideStep;

  const active = [...LOADING_MESSAGES]
    .reverse()
    .find((m) => elapsed >= m.after);
  return active?.text ?? LOADING_MESSAGES[0]!.text;
}

interface AgentLockBannerProps {
  isLocked: boolean;
  currentStep?: string | null;
  status?: JobStatus;
  progress?: number;
  error?: string | null;
  jobId?: string | null;
  onRetry?: () => void;
  isRetrying?: boolean;
  onCancel?: () => void;
  isCancelling?: boolean;
  /** Show a yellow "fallback template" banner for free users when AI is unavailable */
  isFallback?: boolean;
  fallbackCity?: string;
}

export function AgentLockBanner({
  isLocked,
  currentStep,
  status,
  progress,
  error,
  jobId,
  onRetry,
  isRetrying = false,
  onCancel,
  isCancelling = false,
  isFallback = false,
  fallbackCity,
}: AgentLockBannerProps) {
  const showError = Boolean(error);
  const isCancelled = status === "CANCELLED";
  const isProcessing = isLocked && !showError && !isCancelled;
  const progressiveStep = useProgressiveMessage(isProcessing, currentStep);

  // Fallback template banner (free user, AI unavailable)
  if (isFallback) {
    return (
      <Alert className="border-tag-yellow-text/50 bg-tag-yellow">
        <AlertTriangle className="h-4 w-4 text-tag-yellow-text" />
        <AlertTitle className="text-tag-yellow-text">Fallback mode</AlertTitle>
        <AlertDescription className="text-tag-yellow-text/80">
          AI is under maintenance. This is a standard itinerary
          {fallbackCity ? ` for ${fallbackCity}` : ""}. Some features are
          limited.
        </AlertDescription>
      </Alert>
    );
  }

  if (!isLocked && !showError) return null;

  const resolvedStatus: JobStatus =
    status || (showError ? "FAILED" : "PROCESSING");
  const canRetry =
    Boolean(onRetry) && (showError || resolvedStatus === "FAILED");

  return (
    <Alert
      data-testid="agent-lock-banner"
      data-state={
        showError ? "error" : isCancelled ? "cancelled" : "processing"
      }
      className={
        showError
          ? "border-destructive/50 bg-destructive/5"
          : "border-primary/50 bg-primary/5"
      }
    >
      {showError ? (
        <XCircle className="h-4 w-4 text-destructive" />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      )}
      <AlertTitle
        data-testid="agent-lock-title"
        className={showError ? "text-destructive" : "text-primary"}
      >
        {showError
          ? "AI failed to generate your trip"
          : "AI is working on your trip"}
      </AlertTitle>
      <AlertDescription className="text-muted-foreground">
        {showError ? error : progressiveStep}
      </AlertDescription>

      <div className="mt-3 space-y-2">
        <JobStatusIndicator
          status={resolvedStatus}
          progress={progress}
          currentStep={currentStep}
          showProgress
        />
        {jobId && (
          <div
            className="text-xs text-muted-foreground"
            data-testid="agent-lock-job-id"
          >
            Job ID: {jobId}
          </div>
        )}
        {canRetry && (
          <div>
            <Button
              size="sm"
              variant="secondary"
              data-testid="agent-lock-retry"
              onClick={onRetry}
              disabled={isRetrying}
            >
              {isRetrying ? "Retrying..." : "Retry"}
            </Button>
          </div>
        )}
        {status !== "COMPLETED" && !showError && !isCancelled && onCancel && (
          <div>
            <Button
              size="sm"
              variant="outline"
              data-testid="agent-lock-cancel"
              onClick={onCancel}
              disabled={isCancelling}
              className="mt-2 text-muted-foreground hover:text-destructive"
            >
              {isCancelling ? "Cancelling..." : "Cancel Generation"}
            </Button>
          </div>
        )}
      </div>
    </Alert>
  );
}
