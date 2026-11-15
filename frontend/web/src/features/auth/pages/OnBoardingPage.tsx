/**
 * Onboarding Page
 *
 * Post-signup user preferences configuration
 * Refactored to follow Rule of 200 (< 200 lines)
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { Check, ChevronLeft, ChevronRight, Loader2, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { toastT } from "@/lib/toast-i18n";
import {
  DEFAULT_USER_PREFERENCES,
  getUserPreferences,
  mapFocusToInterests,
  mapGroupToTravelStyle,
} from "@/features/settings/types/user-preferences.types";

import {
  ProfileStep,
  PreferencesStep,
  FirstTripStep,
} from "../components/onboarding";
import {
  mapInterestsToFocus,
  TRAVEL_STYLE_TO_GROUP,
} from "../constants/onboarding";

const TOTAL_STEPS = 3;

export default function OnBoardingPage() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoaded } = useUser();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const isResetMode = searchParams.get("mode") === "reset";

  // Step 1 - Profile
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");

  // Step 2 - Preferences
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [travelStyle, setTravelStyle] = useState("");

  // Step 3 - First Trip
  const [destination, setDestination] = useState("");
  const [travelers, setTravelers] = useState(1);

  useEffect(() => {
    if (isLoaded && user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from Clerk's async `user` once it loads, not a per-render derivation
      setName(user.fullName || user.firstName || "");
    }

    if (isResetMode) {
      setCurrency("USD");
      setSelectedInterests([]);
      setTravelStyle("");
      setDestination("");
      setTravelers(1);
      return;
    }

    const prefs = getUserPreferences();
    setCurrency(prefs.currency || "USD");
    setSelectedInterests(mapFocusToInterests(prefs.focus));
    setTravelStyle(mapGroupToTravelStyle(prefs.groupType));
    if (prefs.firstTrip?.destination) {
      setDestination(prefs.firstTrip.destination);
      setTravelers(prefs.firstTrip.travelers || 1);
    }
  }, [isLoaded, isResetMode, user]);

  const toggleInterest = (id: string) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleComplete = async () => {
    setIsLoading(true);

    const current = getUserPreferences();
    const onboardingFocus = mapInterestsToFocus(selectedInterests);
    const onboardingGroupType = travelStyle
      ? (TRAVEL_STYLE_TO_GROUP[travelStyle] ?? null)
      : null;

    const preferences = {
      ...DEFAULT_USER_PREFERENCES,
      ...current,
      displayName: name.trim(),
      currency,
      focus: onboardingFocus,
      groupType: onboardingGroupType,
      firstTrip: destination ? { destination, travelers } : null,
      onboardingDefaults: {
        focus: onboardingFocus,
        groupType: onboardingGroupType,
        transportMode: "walking" as const,
        pace: "balanced" as const,
        constraints: {
          mobility_friendly: false,
          avoid_crowds: false,
          foodAsMainActivities: false,
        },
        specialRequirements: "",
      },
    };

    localStorage.setItem("user-preferences", JSON.stringify(preferences));
    await new Promise((resolve) => setTimeout(resolve, 800));

    toast.success(
      isResetMode
        ? toastT("toast.onboarding.updated")
        : toastT("toast.onboarding.welcome"),
    );
    navigate(redirectTo);
    setIsLoading(false);
  };

  const handleSkip = () => navigate(redirectTo);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plane className="h-6 w-6 text-primary" />
          <span className="font-bold text-xl">TravelPlan</span>
        </div>
        <Button variant="ghost" onClick={handleSkip}>
          Skip for now
        </Button>
      </header>

      {/* Progress */}
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-medium transition-colors ${
                  s <= step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s < step ? <Check className="h-5 w-5" /> : s}
              </div>
              {s < TOTAL_STEPS && (
                <div
                  className={`w-24 sm:w-32 h-1 mx-2 rounded-full transition-colors ${
                    s < step ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-card rounded-2xl border border-border p-6 md:p-8">
          {step === 1 && (
            <ProfileStep
              name={name}
              currency={currency}
              onNameChange={setName}
              onCurrencyChange={setCurrency}
            />
          )}

          {step === 2 && (
            <PreferencesStep
              selectedInterests={selectedInterests}
              travelStyle={travelStyle}
              onToggleInterest={toggleInterest}
              onTravelStyleChange={setTravelStyle}
            />
          )}

          {step === 3 && (
            <FirstTripStep
              destination={destination}
              travelers={travelers}
              onDestinationChange={setDestination}
              onTravelersChange={setTravelers}
            />
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            <Button variant="ghost" onClick={handleBack} disabled={step === 1}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            {step < TOTAL_STEPS ? (
              <Button onClick={handleNext}>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleComplete} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  "Complete Setup"
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
