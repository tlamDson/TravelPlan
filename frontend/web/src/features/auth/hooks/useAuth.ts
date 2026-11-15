/**
 * Auth Hooks
 *
 * Section 6: State Management
 * - Clerk for authentication
 * - TanStack Query for server state
 */

import { useAuth, useUser, useClerk } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { toastT } from "@/lib/toast-i18n";

// ============================================
// CLERK AUTH HOOKS
// ============================================

/**
 * Get current authenticated user from Clerk
 */
export function useCurrentUser() {
  const { user, isLoaded } = useUser();

  return {
    data: user
      ? {
          id: user.id,
          email: user.primaryEmailAddress?.emailAddress,
          name: user.fullName || user.firstName || "User",
          imageUrl: user.imageUrl,
          createdAt: user.createdAt,
        }
      : null,
    isLoading: !isLoaded,
    isError: false,
  };
}

/**
 * Check if user is authenticated
 */
export function useIsAuthenticated() {
  const { isSignedIn, isLoaded } = useAuth();
  const { data: user, isLoading } = useCurrentUser();

  return {
    isAuthenticated: !!isSignedIn,
    isLoading: !isLoaded || isLoading,
    user,
  };
}

/**
 * Sign out hook
 */
export function useSignOut() {
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      // Clear all cached data
      queryClient.clear();
      await signOut();
      toast.success(toastT("toast.auth.signedOut"));
      navigate("/");
    } catch (error) {
      console.error("Sign out error:", error);
      // Still clear local state even if Clerk fails
      queryClient.clear();
      navigate("/");
    }
  };

  return {
    mutate: handleSignOut,
    isPending: false,
  };
}

/**
 * Get Clerk session token for API calls
 */
export function useAuthToken() {
  const { getToken } = useAuth();

  return {
    getToken: async () => {
      try {
        return await getToken();
      } catch (error) {
        console.error("Failed to get auth token:", error);
        return null;
      }
    },
  };
}
