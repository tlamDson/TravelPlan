/**
 * App Router
 *
 * Centralized routing configuration
 * Section 6: URL State via React Router
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense } from "react";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { PageLoader } from "@/components/PageLoader";

// Public pages (can be eagerly loaded for better UX)
import LandingPage from "@/features/landing/pages/LandingPage";
import InfoPage from "@/features/landing/pages/InfoPage";

// Section 5: Performance - lazy-loaded pages, see ./lazy-pages.ts
import {
  SignInPage,
  SignUpPage,
  SSOCallbackPage,
  OnBoardingPage,
  DashboardPage,
  TripsPage,
  TripDetailPage,
  MapPage,
  ReliabilityPage,
  NotFound,
  InDevelopment,
} from "./lazy-pages";

/**
 * Suspense wrapper for lazy loaded routes
 */
function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ================================ */}
        {/* PUBLIC ROUTES */}
        {/* ================================ */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<InfoPage page="about" />} />
        <Route path="/privacy" element={<InfoPage page="privacy" />} />
        <Route path="/terms" element={<InfoPage page="terms" />} />

        <Route
          path="/signin"
          element={
            <LazyRoute>
              <SignInPage />
            </LazyRoute>
          }
        />

        <Route
          path="/signup"
          element={
            <LazyRoute>
              <SignUpPage />
            </LazyRoute>
          }
        />

        {/* SSO Callback for Clerk OAuth */}
        <Route
          path="/sso-callback"
          element={
            <LazyRoute>
              <SSOCallbackPage />
            </LazyRoute>
          }
        />

        <Route
          path="/onboarding"
          element={
            <LazyRoute>
              <OnBoardingPage />
            </LazyRoute>
          }
        />

        {/* ================================ */}
        {/* PROTECTED ROUTES */}
        {/* ================================ */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <LazyRoute>
                <DashboardPage />
              </LazyRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/trips"
          element={
            <ProtectedRoute>
              <LazyRoute>
                <TripsPage />
              </LazyRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/trips/:tripId"
          element={
            <ProtectedRoute>
              <LazyRoute>
                <TripDetailPage />
              </LazyRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/ai-assistant"
          element={
            <ProtectedRoute>
              <LazyRoute>
                <InDevelopment />
              </LazyRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/assistant"
          element={
            <ProtectedRoute>
              <LazyRoute>
                <InDevelopment />
              </LazyRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/map"
          element={
            <ProtectedRoute>
              <LazyRoute>
                <MapPage />
              </LazyRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/map/:tripId"
          element={
            <ProtectedRoute>
              <LazyRoute>
                <MapPage />
              </LazyRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/reliability"
          element={
            <ProtectedRoute>
              <LazyRoute>
                <ReliabilityPage />
              </LazyRoute>
            </ProtectedRoute>
          }
        />

        {/* ================================ */}
        {/* 404 CATCH-ALL */}
        {/* ================================ */}
        <Route
          path="*"
          element={
            <LazyRoute>
              <NotFound />
            </LazyRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
