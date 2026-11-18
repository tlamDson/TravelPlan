/**
 * Auth Constants
 *
 * Static values and error message mappings
 */

// Resend cooldown in seconds
export const RESEND_COOLDOWN = 60;

// Sign up page benefits list (translation keys, see auth-translations.ts)
export const SIGN_UP_BENEFITS = [
  "auth.signUp.benefit.itinerary",
  "auth.signUp.benefit.budget",
  "auth.signUp.benefit.maps",
  "auth.signUp.benefit.share",
];

// Map Clerk error codes to translation keys (see auth-translations.ts);
// unknown codes fall back to Clerk's own message.
const KNOWN_CLERK_ERRORS = new Set([
  "form_password_pwned",
  "form_password_length_too_short",
  "form_password_no_uppercase",
  "form_password_no_lowercase",
  "form_password_no_number",
  "form_identifier_exists",
  "form_param_format_invalid",
  "form_param_nil",
]);

export const getErrorMessage = (
  code: string,
  defaultMessage: string,
): string =>
  KNOWN_CLERK_ERRORS.has(code) ? `auth.clerkError.${code}` : defaultMessage;

// Determine which field the error relates to
export const getErrorField = (
  code: string,
): "email" | "password" | "general" => {
  if (code.includes("password")) return "password";
  if (code.includes("identifier") || code.includes("email")) return "email";
  return "general";
};
