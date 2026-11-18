/**
 * Sign Up Form Component
 *
 * Email/password registration form with validation and strength indicator
 */

import { useState, useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";
import {
  signUpFormSchema,
  type SignUpFormData,
  type SignUpError,
} from "../types";
import {
  checkPasswordStrength,
  type PasswordStrength,
} from "../utils/password";

interface SignUpFormProps {
  isLoaded: boolean;
  isSubmitting: boolean;
  signUpError: SignUpError | null;
  onSubmit: (data: SignUpFormData) => Promise<void>;
  onClearError: (field: "email" | "password") => void;
}

export function SignUpForm({
  isLoaded,
  isSubmitting,
  signUpError,
  onSubmit,
  onClearError,
}: SignUpFormProps) {
  const t = useTranslationStore((state) => state.t);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpFormSchema),
    mode: "onChange",
    reValidateMode: "onChange",
  });

  const watchedPassword = useWatch({ control, name: "password" });
  const passwordStrength = useMemo<PasswordStrength | null>(
    () => (watchedPassword ? checkPasswordStrength(watchedPassword) : null),
    [watchedPassword],
  );

  useEffect(() => {
    if (watchedPassword && signUpError?.field === "password") {
      onClearError("password");
    }
  }, [watchedPassword, signUpError?.field, onClearError]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Name Fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t("auth.signUp.firstName")}</Label>
          <Input
            id="firstName"
            type="text"
            placeholder="John"
            autoComplete="given-name"
            {...register("firstName")}
            aria-invalid={!!errors.firstName}
          />
          {errors.firstName && (
            <p className="text-sm text-destructive" role="alert">
              {t(errors.firstName.message ?? "")}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName">{t("auth.signUp.lastName")}</Label>
          <Input
            id="lastName"
            type="text"
            placeholder="Doe"
            autoComplete="family-name"
            {...register("lastName")}
            aria-invalid={!!errors.lastName}
          />
          {errors.lastName && (
            <p className="text-sm text-destructive" role="alert">
              {t(errors.lastName.message ?? "")}
            </p>
          )}
        </div>
      </div>

      {/* Email Field */}
      <div className="space-y-2">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          {...register("email")}
          aria-invalid={!!errors.email || signUpError?.field === "email"}
          className={
            signUpError?.field === "email"
              ? "border-destructive focus-visible:ring-destructive"
              : ""
          }
          onChange={() =>
            signUpError?.field === "email" && onClearError("email")
          }
        />
        {errors.email && (
          <p className="text-sm text-destructive" role="alert">
            {t(errors.email.message ?? "")}
          </p>
        )}
        {signUpError?.field === "email" && !errors.email && (
          <p className="text-sm text-destructive" role="alert">
            {t(signUpError.message)}
          </p>
        )}
      </div>

      {/* Password Field */}
      <div className="space-y-2">
        <Label htmlFor="password">{t("auth.password")}</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="new-password"
            {...register("password")}
            aria-invalid={
              !!errors.password || signUpError?.field === "password"
            }
            className={
              signUpError?.field === "password"
                ? "border-destructive focus-visible:ring-destructive"
                : ""
            }
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label={
              showPassword ? t("auth.hidePassword") : t("auth.showPassword")
            }
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p className="text-sm text-destructive" role="alert">
            {t(errors.password.message ?? "")}
          </p>
        )}
        {signUpError?.field === "password" && !errors.password && (
          <p className="text-sm text-destructive" role="alert">
            {t(signUpError.message)}
          </p>
        )}

        {/* Password Strength Indicator */}
        {watchedPassword && passwordStrength && !errors.password && (
          <PasswordStrengthIndicator strength={passwordStrength} />
        )}
      </div>

      {/* Confirm Password Field */}
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">
          {t("auth.signUp.confirmPassword")}
        </Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="new-password"
            {...register("confirmPassword")}
            aria-invalid={!!errors.confirmPassword}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label={
              showConfirmPassword
                ? t("auth.hidePassword")
                : t("auth.showPassword")
            }
          >
            {showConfirmPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="text-sm text-destructive" role="alert">
            {t(errors.confirmPassword.message ?? "")}
          </p>
        )}
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full"
        disabled={isSubmitting || !isLoaded}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("auth.signUp.submitting")}
          </>
        ) : (
          t("auth.signUp.submit")
        )}
      </Button>

      {/* Clerk CAPTCHA widget mount point */}
      <div id="clerk-captcha" className="mt-4" />
    </form>
  );
}
