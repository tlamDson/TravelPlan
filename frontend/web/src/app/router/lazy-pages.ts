/**
 * Lazy-loaded route components. Split out of index.tsx to keep the route
 * tree itself under the Rule of 200 as routes accumulate — this file has
 * no logic, just the lazy() declarations.
 */
import { lazy } from "react";

// Auth pages
export const SignInPage = lazy(
  () => import("@/features/auth/pages/SignInPage"),
);
export const SignUpPage = lazy(
  () => import("@/features/auth/pages/SignUpPage"),
);
export const SSOCallbackPage = lazy(
  () => import("@/features/auth/pages/SSOCallbackPage"),
);
export const OnBoardingPage = lazy(
  () => import("@/features/auth/pages/OnBoardingPage"),
);

// Protected pages
export const DashboardPage = lazy(
  () => import("@/features/dashboard/pages/DashboardPage"),
);
export const TripsPage = lazy(
  () => import("@/features/planner/pages/TripsPage"),
);
export const TripDetailPage = lazy(
  () => import("@/features/planner/pages/TripDetailPage"),
);
export const MapPage = lazy(() => import("@/features/map/pages/MapPage"));
// URL-only — no nav link; access is controlled by the backend's
// SRE_ADMIN_EMAILS allowlist (reliability plan Phase 6), not UI hiding.
export const ReliabilityPage = lazy(
  () => import("@/features/reliability/pages/ReliabilityPage"),
);

// Error pages
export const NotFound = lazy(() => import("@/app/pages/NotFound"));
export const InDevelopment = lazy(() => import("@/app/pages/InDevelopment"));
