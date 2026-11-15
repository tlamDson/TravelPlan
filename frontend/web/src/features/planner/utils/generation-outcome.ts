import type { ClientEventProperties } from "@/features/analytics";
import type { Job } from "@/utils/schemas";

type GenerationCompleted = ClientEventProperties<"trip_generation_completed">;

function isFallbackResult(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as { status?: unknown }).status === "FALLBACK"
  );
}

/**
 * trip_generation_completed properties for a job in a final state. Outcome
 * follows the backend's job metrics (FALLBACK return value = "fallback");
 * duration runs from enqueue (createdAt) to finish (updatedAt).
 */
export function toGenerationCompleted(
  job: Job,
  tripId: string,
): GenerationCompleted {
  const outcome =
    job.status === "FAILED"
      ? "failed"
      : isFallbackResult(job.result)
        ? "fallback"
        : "completed";
  const durationMs = Math.max(
    0,
    Date.parse(job.updatedAt) - Date.parse(job.createdAt),
  );
  return { jobId: job.jobId, tripId, outcome, durationMs };
}
