import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTripWizardStore } from "@/stores/trip-wizard.store";

const EXAMPLES = [
  "I am vegetarian and do not eat seafood",
  "My travel companion uses a wheelchair",
  "I am allergic to gluten",
  "I am traveling with a 2-year-old",
];

export function StepRequirements() {
  const { data, setData } = useTripWizardStore();
  const [exampleIx] = useState(
    () => Math.floor(Date.now() / 10_000) % EXAMPLES.length,
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-base font-semibold">
          ✏️ Special requirements (optional)
        </Label>
        <p className="text-sm text-muted-foreground">
          Do you have any special requirements for health, diet, or mobility?
          The AI will prioritize meeting them in every suggestion.
        </p>
      </div>

      <Textarea
        id="special-requirements"
        data-testid="trip-wizard-special-requirements"
        placeholder={`For example: "${EXAMPLES[exampleIx]}"`}
        value={data.specialRequirements}
        onChange={(e) =>
          setData({ specialRequirements: e.target.value.slice(0, 200) })
        }
        rows={3}
        className="resize-none"
      />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Leave blank if you have no special requirements</span>
        <span>{data.specialRequirements.length}/200</span>
      </div>

      {/* Quick-fill examples */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          Quick suggestions:
        </p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setData({ specialRequirements: ex })}
              className="rounded-full border px-3 py-1 text-xs hover:bg-muted/60 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
