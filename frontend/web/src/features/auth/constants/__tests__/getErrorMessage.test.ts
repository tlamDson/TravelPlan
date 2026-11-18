import { describe, it, expect } from "vitest";
import { getErrorMessage } from "..";
import { AUTH_TRANSLATIONS } from "../auth-translations";

describe("getErrorMessage", () => {
  it("maps a known Clerk code to a translation key present in all languages", () => {
    const key = getErrorMessage("form_identifier_exists", "raw");
    expect(key).toBe("auth.clerkError.form_identifier_exists");
    for (const lang of ["en", "fr", "vi"] as const) {
      expect(AUTH_TRANSLATIONS[lang][key]).toBeDefined();
    }
  });

  it("returns the raw Clerk message for an unknown code", () => {
    expect(getErrorMessage("some_new_code", "Raw message")).toBe("Raw message");
  });
});
