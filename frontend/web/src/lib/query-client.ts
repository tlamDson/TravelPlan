/**
 * TanStack Query Client Configuration
 *
 * Section 6: State Management
 * - TanStack Query for Server State
 * - Configured for optimal caching and refetching
 */

import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";

// ============================================
// QUERY CLIENT CONFIGURATION
// ============================================

const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      // Stale time: Data is considered fresh for 30 seconds
      staleTime: 30 * 1000,

      // Cache time: Keep unused data for 5 minutes
      gcTime: 5 * 60 * 1000,

      // Retry failed queries up to 3 times
      retry: 3,

      // Exponential backoff for retries
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch on window focus (useful for stale data)
      refetchOnWindowFocus: true,

      // Don't refetch on mount if data is fresh
      refetchOnMount: true,

      // Refetch on reconnect
      refetchOnReconnect: true,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,

      // Network mode: online means mutations only fire when online
      networkMode: "online",
    },
  },
};

// ============================================
// QUERY CLIENT INSTANCE
// ============================================

export const queryClient = new QueryClient(queryClientConfig);

// ============================================
// QUERY KEYS FACTORY
// Section 2.1: Consistent key patterns for polling
// ============================================

export const queryKeys = {
  // Auth
  auth: {
    all: ["auth"] as const,
    user: () => [...queryKeys.auth.all, "user"] as const,
    session: () => [...queryKeys.auth.all, "session"] as const,
  },

  // Users
  users: {
    all: ["users"] as const,
    me: () => [...queryKeys.users.all, "me"] as const,
  },

  // Trips
  trips: {
    all: ["trips"] as const,
    lists: () => [...queryKeys.trips.all, "list"] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.trips.lists(), filters] as const,
    details: () => [...queryKeys.trips.all, "detail"] as const,
    detail: (id: string) => [...queryKeys.trips.details(), id] as const,
  },

  // Jobs (for polling pattern - Section 2.1)
  jobs: {
    all: ["jobs"] as const,
    detail: (jobId: string) => [...queryKeys.jobs.all, jobId] as const,
  },

  // Places
  places: {
    all: ["places"] as const,
    search: (query: string) =>
      [...queryKeys.places.all, "search", query] as const,
    nearby: (lat: number, lng: number) =>
      [...queryKeys.places.all, "nearby", lat, lng] as const,
    detail: (id: string) => [...queryKeys.places.all, "detail", id] as const,
  },

  // AI Sessions
  ai: {
    all: ["ai"] as const,
    sessions: () => [...queryKeys.ai.all, "sessions"] as const,
    session: (id: string) => [...queryKeys.ai.sessions(), id] as const,
  },

  // Reliability (SRE dashboard)
  reliability: {
    all: ["reliability"] as const,
    sloReport: () => [...queryKeys.reliability.all, "slo"] as const,
  },
} as const;
