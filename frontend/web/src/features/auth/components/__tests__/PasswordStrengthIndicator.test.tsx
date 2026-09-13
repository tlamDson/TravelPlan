import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PasswordStrengthIndicator } from "../PasswordStrengthIndicator";
import { checkPasswordStrength } from "../../utils/password";
import { STATUS_TONE_STYLES } from "@/features/planner/lib/statusStyles";

/**
 * [Guard] The strength label previously used raw text-yellow-600/
 * text-green-600 for the "Fair" and "Good"/"Strong" cases (the
 * "Very Weak"/"Weak" case already used the semantic text-destructive).
 * Now all 3 branches read from the shared statusStyles tones.
 */

describe("PasswordStrengthIndicator label color", () => {
  it("uses the shared danger tone for a weak password", () => {
    render(
      <PasswordStrengthIndicator strength={checkPasswordStrength("abc")} />,
    );
    const label = screen.getByText(/weak/i);
    expect(label.className).toContain(STATUS_TONE_STYLES.danger.textClassName);
  });

  it("uses the shared warning tone for a fair password, not raw yellow", () => {
    render(
      <PasswordStrengthIndicator
        strength={checkPasswordStrength("abcdefg1")}
      />,
    );
    const label = screen.getByText(/fair/i);
    expect(label.className).toContain(STATUS_TONE_STYLES.warning.textClassName);
    expect(label.className).not.toMatch(/text-yellow-600/);
  });

  it("uses the shared success tone for a strong password, not raw green", () => {
    render(
      <PasswordStrengthIndicator
        strength={checkPasswordStrength("Abcdefg1!")}
      />,
    );
    const label = screen.getByText(/strong/i);
    expect(label.className).toContain(STATUS_TONE_STYLES.success.textClassName);
    expect(label.className).not.toMatch(/text-green-600/);
  });
});
