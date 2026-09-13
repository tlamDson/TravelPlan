/**
 * Password Strength Indicator Component
 *
 * Real-time visual feedback for password strength
 */

import type { PasswordStrength } from "../utils/password";
import { STATUS_TONE_STYLES } from "@/features/planner/lib/statusStyles";

interface PasswordStrengthIndicatorProps {
  strength: PasswordStrength;
}

export function PasswordStrengthIndicator({
  strength,
}: PasswordStrengthIndicatorProps) {
  return (
    <div className="space-y-2">
      {/* Strength Bar */}
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className={`h-1.5 flex-1 rounded-full transition-all duration-200 ${
              index < strength.score ? strength.color : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Strength Label & Tips */}
      <div className="flex items-center justify-between text-xs">
        <span
          className={`font-medium ${
            strength.score < 2
              ? STATUS_TONE_STYLES.danger.textClassName
              : strength.score < 3
                ? STATUS_TONE_STYLES.warning.textClassName
                : STATUS_TONE_STYLES.success.textClassName
          }`}
        >
          {strength.label}
        </span>

        {/* Quick tips */}
        {strength.score < 3 && (
          <span className="text-muted-foreground">
            {!strength.checks.hasUppercase && "Add uppercase • "}
            {!strength.checks.hasNumber && "Add number • "}
            {!strength.checks.hasSpecial && "Add symbol"}
          </span>
        )}
      </div>
    </div>
  );
}
