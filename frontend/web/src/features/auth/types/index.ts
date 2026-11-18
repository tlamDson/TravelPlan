/**
 * Auth Feature Types
 *
 * Zod schemas and TypeScript interfaces for authentication
 */

import { z } from "zod";
import { checkPasswordStrength } from "../utils/password";

// Messages are translation keys; render them through t().
// Sign Up Form Schema — align with Clerk + block submit before API (avoids 422 after CAPTCHA)
export const signUpFormSchema = z
  .object({
    firstName: z.string().min(1, "auth.validation.firstNameRequired"),
    lastName: z.string().min(1, "auth.validation.lastNameRequired"),
    email: z.string().email("auth.validation.emailInvalid"),
    password: z.string().min(8, "auth.validation.passwordMin"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "auth.validation.passwordMismatch",
    path: ["confirmPassword"],
  })
  .superRefine((data, ctx) => {
    const s = checkPasswordStrength(data.password);
    if (!s.checks.notCommon) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "auth.validation.passwordCommon",
        path: ["password"],
      });
      return;
    }
    if (s.score < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "auth.validation.passwordWeak",
        path: ["password"],
      });
    }
  });

export type SignUpFormData = z.infer<typeof signUpFormSchema>;

// Sign In Form Schema
export const signInFormSchema = z.object({
  email: z.string().email("auth.validation.emailInvalid"),
  password: z.string().min(1, "auth.validation.passwordRequired"),
});

export type SignInFormData = z.infer<typeof signInFormSchema>;

// Sign Up Error
export interface SignUpError {
  field: "email" | "password" | "general";
  message: string;
}

// Clerk Error Type
export interface ClerkError {
  errors?: Array<{
    message: string;
    code: string;
    longMessage?: string;
    meta?: Record<string, unknown>;
  }>;
}
