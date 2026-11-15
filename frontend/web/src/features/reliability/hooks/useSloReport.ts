import { useQuery } from "@tanstack/react-query";
import {
  sloReportResponseSchema,
  type SloReportResponse,
} from "@travelplan/shared";
import { apiClient } from "@/lib/axios";
import { queryKeys } from "@/lib/query-client";
import { validateAPI } from "@/utils/validation";

/**
 * 60s poll, not the 10s a dashboard might reach for by default —
 * `/api/reliability/slo` sits behind the same IP-keyed `generalLimiter`
 * (100 req/15min) as normal browsing, and the 28-day compliance window
 * this reports on doesn't change meaning in a 10-second gap anyway.
 */
const REFETCH_INTERVAL_MS = 60_000;

async function fetchSloReport(): Promise<SloReportResponse> {
  const response = await apiClient.get("/reliability/slo");
  return validateAPI(sloReportResponseSchema, response.data, "fetchSloReport");
}

export function useSloReport() {
  return useQuery({
    queryKey: queryKeys.reliability.sloReport(),
    queryFn: fetchSloReport,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}
