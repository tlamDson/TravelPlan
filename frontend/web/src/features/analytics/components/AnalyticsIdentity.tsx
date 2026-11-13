import { useAuth } from "@clerk/clerk-react";
import { useEffect } from "react";
import { identify } from "../track";

/**
 * Keeps the analytics userId in step with the Clerk session. Renders
 * nothing; mount once inside ClerkProvider. Events tracked before Clerk
 * loads carry userId null.
 */
export function AnalyticsIdentity() {
  const { isLoaded, userId } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    identify(userId ?? null);
  }, [isLoaded, userId]);

  return null;
}
