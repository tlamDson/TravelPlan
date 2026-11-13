/**
 * Sign Up Page
 *
 * Manual registration with email/password + optional Google OAuth
 * Refactored to follow Rule of 200 (< 200 lines)
 */

import { useState, useEffect, useCallback } from "react";
import { useSignUp, useAuth } from "@clerk/clerk-react";
import { Link, useNavigate } from "react-router-dom";
import { Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { toast } from "sonner";

// Feature-specific imports
import {
  GoogleIcon,
  OTPVerificationForm,
  SignUpBenefitsPanel,
  SignUpForm,
} from "../components";
import { checkPasswordStrength } from "../utils/password";
import { RESEND_COOLDOWN, getErrorMessage, getErrorField } from "../constants";
import type { SignUpFormData, SignUpError, ClerkError } from "../types";

export default function SignUpPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState<string[]>([
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  const [userEmail, setUserEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationError, setVerificationError] = useState("");
  const [signUpError, setSignUpError] = useState<SignUpError | null>(null);

  const { signUp, isLoaded, setActive } = useSignUp();
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  // Redirect if already signed in
  useEffect(() => {
    if (isSignedIn) navigate("/dashboard");
  }, [isSignedIn, navigate]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(
        () => setResendCooldown(resendCooldown - 1),
        1000,
      );
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Clear specific error field
  const handleClearError = useCallback(
    (field: "email" | "password") => {
      if (signUpError?.field === field) setSignUpError(null);
    },
    [signUpError?.field],
  );

  // Handle manual sign up
  const handleSignUp = async (data: SignUpFormData) => {
    setSignUpError(null);

    // Password rules enforced in Zod (signUpFormSchema); keep breach guard before API
    const strength = checkPasswordStrength(data.password);
    if (!strength.checks.notCommon || strength.score < 3) {
      toast.error("Please fix password strength before continuing.");
      return;
    }

    if (!isLoaded || !signUp) return;

    setIsSubmitting(true);

    try {
      const result = await signUp.create({
        firstName: data.firstName,
        lastName: data.lastName,
        emailAddress: data.email,
        password: data.password,
      });

      if (result.status === "complete") {
        // No email verification required (e.g. Clerk config skips it)
        await setActive({ session: result.createdSessionId });
        navigate("/onboarding");
        return;
      }

      // "needs_first_factor"/"needs_second_factor" are sign-in-only statuses
      // and never appear on a sign-up result — Clerk's SignUpResource.status
      // type is narrower ("missing_requirements" | "complete" | "abandoned").
      if (
        result.status === "missing_requirements" ||
        result.unverifiedFields.includes("email_address")
      ) {
        await signUp.prepareEmailAddressVerification({
          strategy: "email_code",
        });
        setUserEmail(data.email);
        setResendCooldown(RESEND_COOLDOWN);
        setPendingVerification(true);
        toast.info("Check your email for a verification code");
        return;
      }

      // Any unhandled status — surface to user instead of staying stuck
      toast.error(
        `Unexpected sign-up status: ${result.status}. Please try again.`,
      );
    } catch (error: unknown) {
      const clerkError = error as ClerkError;
      if (clerkError.errors?.[0]) {
        const firstError = clerkError.errors[0];
        const friendlyMessage = getErrorMessage(
          firstError.code,
          firstError.message,
        );
        const errorField = getErrorField(firstError.code);
        setSignUpError({ field: errorField, message: friendlyMessage });
        toast.error(friendlyMessage);
      } else {
        toast.error("Failed to create account. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle verification submission
  const handleVerificationSubmit = async (code?: string) => {
    if (!isLoaded || !signUp) return;
    const codeToVerify = code || verificationCode.join("");
    if (codeToVerify.length !== 6) return;

    setIsSubmitting(true);
    setVerificationError("");

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: codeToVerify,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        toast.success("Account created! Welcome to TravelPlan.");
        navigate("/onboarding");
      }
    } catch (error: unknown) {
      const clerkError = error as ClerkError;
      setVerificationError(
        clerkError.errors?.[0]?.message || "Invalid verification code",
      );
      setVerificationCode(["", "", "", "", "", ""]);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle resend code
  const handleResendCode = async () => {
    if (!isLoaded || !signUp || resendCooldown > 0) return;
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setResendCooldown(RESEND_COOLDOWN);
      setVerificationError("");
      toast.success("Verification code sent!");
    } catch (error: unknown) {
      const clerkError = error as ClerkError;
      toast.error(clerkError.errors?.[0]?.message || "Failed to resend code");
    }
  };

  // Handle back to sign up
  const handleBackToSignUp = () => {
    setPendingVerification(false);
    setVerificationCode(["", "", "", "", "", ""]);
    setVerificationError("");
    setResendCooldown(0);
    setUserEmail("");
  };

  // Handle Google sign up
  const handleGoogleSignUp = async () => {
    if (!isLoaded || !signUp) return;
    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/onboarding",
      });
    } catch {
      toast.error("Failed to sign up with Google. Please try again.");
    }
  };

  // Verification screen
  if (pendingVerification) {
    return (
      <OTPVerificationForm
        email={userEmail}
        code={verificationCode}
        error={verificationError}
        isSubmitting={isSubmitting}
        resendCooldown={resendCooldown}
        onCodeChange={setVerificationCode}
        onSubmit={handleVerificationSubmit}
        onResend={handleResendCode}
        onBack={handleBackToSignUp}
      />
    );
  }

  // Main sign up screen
  return (
    <div className="min-h-screen flex">
      <SignUpBenefitsPanel />

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm">
          {/* Mobile Header */}
          <div className="flex items-center justify-between mb-8 lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <Plane className="h-6 w-6 text-primary" />
              <span className="font-bold text-xl">TravelPlan</span>
            </Link>
            <ThemeToggle />
          </div>
          <div className="hidden lg:flex lg:justify-end mb-8">
            <ThemeToggle />
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold">Create your account</h1>
            <p className="text-muted-foreground mt-2">
              Get started with your free account today.
            </p>
          </div>

          {/* Google Sign Up */}
          <Button
            variant="outline"
            className="w-full h-11 mb-6"
            onClick={handleGoogleSignUp}
            disabled={!isLoaded}
          >
            <GoogleIcon />
            <span className="ml-3">Continue with Google</span>
          </Button>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-background px-2 text-muted-foreground">
                Or sign up with email
              </span>
            </div>
          </div>

          {/* Sign Up Form */}
          <SignUpForm
            isLoaded={isLoaded}
            isSubmitting={isSubmitting}
            signUpError={signUpError}
            onSubmit={handleSignUp}
            onClearError={handleClearError}
          />

          {/* Terms */}
          <p className="mt-4 text-center text-xs text-muted-foreground">
            By signing up, you agree to our{" "}
            <Link to="/terms" className="text-primary hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </p>

          {/* Sign In Link */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/signin"
              className="text-primary hover:underline font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
