import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { toastT } from "@/lib/toast-i18n";
import { useTranslationStore } from "@/stores/useTranslationStore";
import {
  getUserPreferences,
  saveUserPreferences,
  type FocusKey,
  type GroupTypeKey,
  type TransportModeKey,
  type UserPreferences,
} from "@/features/settings/types/user-preferences.types";

const FOCUS_OPTIONS: FocusKey[] = [
  "Culture",
  "Nature",
  "Gastronomy",
  "Lifestyle",
];

const GROUP_OPTIONS: Array<{ value: GroupTypeKey; label: string }> = [
  { value: "solo", label: "Solo" },
  { value: "couple", label: "Couple" },
  { value: "family_kids", label: "Family" },
  { value: "friends", label: "Friends" },
  { value: "work", label: "Work" },
];

const TRANSPORT_OPTIONS: Array<{ value: TransportModeKey; label: string }> = [
  { value: "walking", label: "Walking" },
  { value: "public_transport", label: "Public Transport" },
  { value: "car", label: "Car" },
];

const PACE_OPTIONS: Array<"relaxed" | "balanced" | "packed"> = [
  "relaxed",
  "balanced",
  "packed",
];

export function TravelPreferencesSettings() {
  const { t } = useTranslationStore();
  const navigate = useNavigate();
  const showDevReset =
    import.meta.env.MODE === "development" ||
    import.meta.env.VITE_DEBUG === "true";

  const [focus, setFocus] = useState<FocusKey[]>([]);
  const [groupType, setGroupType] = useState<GroupTypeKey | null>(null);
  const [transportMode, setTransportMode] =
    useState<TransportModeKey>("walking");
  const [pace, setPace] = useState<"relaxed" | "balanced" | "packed">(
    "balanced",
  );
  const [constraints, setConstraints] = useState({
    mobility_friendly: false,
    avoid_crowds: false,
    foodAsMainActivities: false,
  });
  const [specialRequirements, setSpecialRequirements] = useState("");

  const [seatChoice, setSeatChoice] = useState<"Aisle" | "Window" | "Middle">(
    "Aisle",
  );
  const [defaultAirport, setDefaultAirport] = useState("");
  const [specialMeals, setSpecialMeals] = useState("");
  const [hotelRoom, setHotelRoom] = useState<"1 Bed" | "2 Beds">("1 Bed");
  const [smoking, setSmoking] = useState(false);

  const [loyaltyDelta, setLoyaltyDelta] = useState("");
  const [loyaltyUnited, setLoyaltyUnited] = useState("");
  const [loyaltyMarriott, setLoyaltyMarriott] = useState("");
  const [loyaltyHertz, setLoyaltyHertz] = useState("");
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidTraffic, setAvoidTraffic] = useState(false);

  const hydrateFromPrefs = (prefs: UserPreferences) => {
    setFocus(prefs.focus ?? []);
    setGroupType(prefs.groupType ?? null);
    setTransportMode(prefs.transportMode ?? "walking");
    setPace(prefs.pace ?? "balanced");
    setConstraints({
      mobility_friendly: prefs.constraints?.mobility_friendly ?? false,
      avoid_crowds: prefs.constraints?.avoid_crowds ?? false,
      foodAsMainActivities: prefs.constraints?.foodAsMainActivities ?? false,
    });
    setSpecialRequirements(prefs.specialRequirements ?? "");

    if (prefs.seatChoice) setSeatChoice(prefs.seatChoice);
    if (prefs.defaultAirport) setDefaultAirport(prefs.defaultAirport);
    if (prefs.specialMeals) setSpecialMeals(prefs.specialMeals);
    if (prefs.hotelRoom) setHotelRoom(prefs.hotelRoom);
    if (prefs.smoking !== undefined) setSmoking(prefs.smoking);

    if (prefs.loyaltyDelta) setLoyaltyDelta(prefs.loyaltyDelta);
    if (prefs.loyaltyUnited) setLoyaltyUnited(prefs.loyaltyUnited);
    if (prefs.loyaltyMarriott) setLoyaltyMarriott(prefs.loyaltyMarriott);
    if (prefs.loyaltyHertz) setLoyaltyHertz(prefs.loyaltyHertz);

    if (prefs.avoidTolls !== undefined) setAvoidTolls(prefs.avoidTolls);
    if (prefs.avoidTraffic !== undefined) setAvoidTraffic(prefs.avoidTraffic);
  };

  useEffect(() => {
    queueMicrotask(() => hydrateFromPrefs(getUserPreferences()));
  }, []);

  const toggleFocus = (value: FocusKey) => {
    setFocus((prev) => {
      if (prev.includes(value)) return prev.filter((x) => x !== value);
      if (prev.length >= 3) return prev;
      return [...prev, value];
    });
  };

  const handleSave = () => {
    try {
      saveUserPreferences({
        focus,
        groupType,
        transportMode,
        pace,
        constraints,
        specialRequirements,
        seatChoice,
        defaultAirport,
        specialMeals,
        hotelRoom,
        smoking,
        travelMode:
          transportMode === "public_transport"
            ? "Transit"
            : transportMode === "car"
              ? "Driving"
              : "Walking",
        avoidTolls,
        avoidTraffic,
        loyaltyDelta,
        loyaltyUnited,
        loyaltyMarriott,
        loyaltyHertz,
      });
      toast.success(toastT("toast.settings.preferencesSaved"));
    } catch {
      toast.error(toastT("toast.settings.preferencesFailed"));
    }
  };

  const handleDiscard = () => {
    hydrateFromPrefs(getUserPreferences());
  };

  const handleResetToOnboarding = () => {
    const redirect = encodeURIComponent(
      "/dashboard?openSettings=true&settingsTab=preferences",
    );
    navigate(`/onboarding?mode=reset&redirect=${redirect}`);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">
          {t("pref.pageTitle")}
        </h3>
        <p className="text-muted-foreground mt-1">{t("pref.pageSubtitle")}</p>
      </div>

      <Separator />

      <form className="space-y-10">
        <section className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">
            AI Trip Defaults
          </h4>

          <div className="space-y-2">
            <Label>Focus (max 3)</Label>
            <div className="flex flex-wrap gap-2">
              {FOCUS_OPTIONS.map((item) => {
                const active = focus.includes(item);
                const disabled = !active && focus.length >= 3;
                return (
                  <Button
                    key={item}
                    type="button"
                    variant={active ? "default" : "outline"}
                    disabled={disabled}
                    onClick={() => toggleFocus(item)}
                  >
                    {item}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Group Type</Label>
            <div className="flex flex-wrap gap-2">
              {GROUP_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={groupType === opt.value ? "default" : "outline"}
                  onClick={() => setGroupType(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
              <Button
                type="button"
                variant={groupType === null ? "default" : "outline"}
                onClick={() => setGroupType(null)}
              >
                None
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Transport Mode</Label>
            <div className="flex flex-wrap gap-2">
              {TRANSPORT_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={transportMode === opt.value ? "default" : "outline"}
                  onClick={() => setTransportMode(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pace</Label>
            <div className="flex flex-wrap gap-2">
              {PACE_OPTIONS.map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={pace === item ? "default" : "outline"}
                  onClick={() => setPace(item)}
                  className="capitalize"
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Mobility friendly</Label>
              <Switch
                checked={constraints.mobility_friendly}
                onCheckedChange={(v) =>
                  setConstraints((prev) => ({ ...prev, mobility_friendly: v }))
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Avoid crowds</Label>
              <Switch
                checked={constraints.avoid_crowds}
                onCheckedChange={(v) =>
                  setConstraints((prev) => ({ ...prev, avoid_crowds: v }))
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
              <Label>Food as main activities</Label>
              <Switch
                checked={constraints.foodAsMainActivities}
                onCheckedChange={(v) =>
                  setConstraints((prev) => ({
                    ...prev,
                    foodAsMainActivities: v,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Special Requirements</Label>
            <Textarea
              value={specialRequirements}
              onChange={(e) =>
                setSpecialRequirements(e.target.value.slice(0, 400))
              }
              placeholder="Dietary, accessibility, health, kid-friendly needs..."
              rows={4}
            />
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">
            {t("pref.bookingTitle")}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("pref.seatPref")}</Label>
              <div className="flex gap-2">
                {(["Aisle", "Window", "Middle"] as const).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant={seatChoice === s ? "default" : "outline"}
                    onClick={() => setSeatChoice(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("pref.defaultAirport")}</Label>
              <Input
                placeholder="e.g., JFK, LHR, SFO"
                value={defaultAirport}
                onChange={(e) => setDefaultAirport(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("pref.meals")}</Label>
              <Input
                placeholder="e.g., Vegetarian, Halal, Gluten-Free"
                value={specialMeals}
                onChange={(e) => setSpecialMeals(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("pref.hotelRoom")}</Label>
              <div className="flex gap-2">
                {(["1 Bed", "2 Beds"] as const).map((room) => (
                  <Button
                    key={room}
                    type="button"
                    variant={hotelRoom === room ? "default" : "outline"}
                    onClick={() => setHotelRoom(room)}
                  >
                    {room}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
              <Label>{t("pref.smoking")}</Label>
              <Switch checked={smoking} onCheckedChange={setSmoking} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">
            Loyalty Programs
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              placeholder="Delta SkyMiles"
              value={loyaltyDelta}
              onChange={(e) => setLoyaltyDelta(e.target.value)}
            />
            <Input
              placeholder="United MileagePlus"
              value={loyaltyUnited}
              onChange={(e) => setLoyaltyUnited(e.target.value)}
            />
            <Input
              placeholder="Marriott Bonvoy"
              value={loyaltyMarriott}
              onChange={(e) => setLoyaltyMarriott(e.target.value)}
            />
            <Input
              placeholder="Hertz Gold Plus"
              value={loyaltyHertz}
              onChange={(e) => setLoyaltyHertz(e.target.value)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{t("pref.avoidTolls")}</Label>
              <Switch checked={avoidTolls} onCheckedChange={setAvoidTolls} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{t("pref.avoidTraffic")}</Label>
              <Switch
                checked={avoidTraffic}
                onCheckedChange={setAvoidTraffic}
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-4 border-t pt-6 pb-20">
          {showDevReset && (
            <Button
              variant="outline"
              type="button"
              onClick={handleResetToOnboarding}
              className="border-dashed border-2 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white"
            >
              Dev: Reset to Onboarding
            </Button>
          )}
          <Button variant="outline" type="button" onClick={handleDiscard}>
            {t("loc.btnDiscard")}
          </Button>
          <Button type="button" onClick={handleSave}>
            {t("loc.btnSave")}
          </Button>
        </div>
      </form>
    </div>
  );
}
