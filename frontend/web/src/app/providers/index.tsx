/**
 * App Providers
 *
 * Centralized provider setup following Section 6: State Management
 * - Clerk for authentication
 * - TanStack Query for server state
 * - Zustand for client state (via stores)
 * - React Router for URL state
 */

import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { queryClient } from "@/lib/query-client";
import { ThemeProvider } from "./ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useEffect, type ReactNode } from "react";
import { registerAuthTokenGetter } from "@/lib/axios";
import { UpgradeModal } from "@/components/pro/UpgradeModal";
import { AnalyticsIdentity } from "@/features/analytics";

// Get Clerk publishable key from environment
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY environment variable");
}

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Root provider composition
 * Order matters: outer providers are initialized first
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ErrorBoundary>
      <ClerkProvider
        publishableKey={CLERK_PUBLISHABLE_KEY}
        signInUrl="/signin"
        signUpUrl="/signup"
        signInFallbackRedirectUrl="/dashboard"
        signUpFallbackRedirectUrl="/onboarding"
      >
        <ClerkTokenBridge />
        <AnalyticsIdentity />
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <TooltipProvider>
              {children}
              <Toaster />
              <Sonner />
              <UpgradeModal />
            </TooltipProvider>
          </ThemeProvider>
          {/* Only show devtools in development */}
          {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
      </ClerkProvider>
    </ErrorBoundary>
  );
}

/**
 * Bridge Clerk session tokens into axios requests so the backend
 * can authenticate users via Bearer tokens.
 */
function ClerkTokenBridge() {
  const { getToken, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    registerAuthTokenGetter(() => getToken());
  }, [getToken, isLoaded]);

  return null;
}
