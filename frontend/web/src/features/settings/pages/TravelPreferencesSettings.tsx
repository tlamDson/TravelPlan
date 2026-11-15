import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useTranslationStore } from "@/stores/useTranslationStore";
import {
  getUserPreferences,
  saveUserPreferences,
  type FocusKey,
  type GroupTypeKey,
  type TransportModeKey,
  type UserPreferences,
} from "@/features/settings/types/user-preferences.types";

const FOCUS_OPTIONS: Array<{ value: FocusKey; labelKey: string }> = [
  { value: "Culture", labelKey: "pref.focusCulture" },
  { value: "Nature", labelKey: "pref.focusNature" },
  { value: "Gastronomy", labelKey: "pref.focusGastronomy" },
  { value: "Lifestyle", labelKey: "pref.focusLifestyle" },
];

const GROUP_OPTIONS: Array<{ value: GroupTypeKey; labelKey: string }> = [
  { value: "solo", labelKey: "pref.groupSolo" },
  { value: "couple", labelKey: "pref.groupCouple" },
  { value: "family_kids", labelKey: "pref.groupFamily" },
  { value: "friends", labelKey: "pref.groupFriends" },
  { value: "work", labelKey: "pref.groupWork" },
];

const TRANSPORT_OPTIONS: Array<{ value: TransportModeKey; labelKey: string }> =
  [
    { value: "walking", labelKey: "pref.transportWalking" },
    { value: "public_transport", labelKey: "pref.transportPublic" },
    { value: "car", labelKey: "pref.transportCar" },
  ];

const PACE_LABEL_KEYS = {
  relaxed: "pref.paceRelaxed",
  balanced: "pref.paceBalanced",
  packed: "pref.pacePacked",
} as const;

const SEAT_OPTIONS = [
  { value: "Aisle", labelKey: "pref.aisle" },
  { value: "Window", labelKey: "pref.window" },
  { value: "Middle", labelKey: "pref.middle" },
] as const;

const ROOM_OPTIONS = [
  { value: "1 Bed", labelKey: "pref.1bed" },
  { value: "2 Beds", labelKey: "pref.2beds" },
] as const;

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
      toast.success(t("pref.toastSaved"));
    } catch {
      toast.error(t("pref.toastSaveFailed"));
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
          <h4 className="text-sm font-semibold text-foreground">{t("pref.aiDefaultsTitle")}</h4>

          <div className="space-y-2">
            <Label>{t("pref.focusLabel")}</Label>
            <div className="flex flex-wrap gap-2">
              {FOCUS_OPTIONS.map((item) => {
                const active = focus.includes(item.value);
                const disabled = !active && focus.length >= 3;
                return (
                  <Button
                    key={item.value}
                    type="button"
                    variant={active ? "default" : "outline"}
                    disabled={disabled}
                    onClick={() => toggleFocus(item.value)}
                  >
                    {t(item.labelKey)}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("pref.groupLabel")}</Label>
            <div className="flex flex-wrap gap-2">
              {GROUP_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={groupType === opt.value ? "default" : "outline"}
                  onClick={() => setGroupType(opt.value)}
                >
                  {t(opt.labelKey)}
                </Button>
              ))}
              <Button
                type="button"
                variant={groupType === null ? "default" : "outline"}
                onClick={() => setGroupType(null)}
              >
                {t("pref.groupNone")}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("pref.transportLabel")}</Label>
            <div className="flex flex-wrap gap-2">
              {TRANSPORT_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={transportMode === opt.value ? "default" : "outline"}
                  onClick={() => setTransportMode(opt.value)}
                >
                  {t(opt.labelKey)}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("pref.paceLabel")}</Label>
            <div className="flex flex-wrap gap-2">
              {PACE_OPTIONS.map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={pace === item ? "default" : "outline"}
                  onClick={() => setPace(item)}
                >
                  {t(PACE_LABEL_KEYS[item])}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{t("pref.mobilityFriendly")}</Label>
              <Switch
                checked={constraints.mobility_friendly}
                onCheckedChange={(v) =>
                  setConstraints((prev) => ({ ...prev, mobility_friendly: v }))
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{t("pref.avoidCrowds")}</Label>
              <Switch
                checked={constraints.avoid_crowds}
                onCheckedChange={(v) =>
                  setConstraints((prev) => ({ ...prev, avoid_crowds: v }))
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
              <Label>{t("pref.foodAsMain")}</Label>
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
            <Label>{t("pref.specialRequirements")}</Label>
            <Textarea
              value={specialRequirements}
              onChange={(e) => setSpecialRequirements(e.target.value.slice(0, 400))}
              placeholder={t("pref.specialRequirementsPlaceholder")}
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
                {SEAT_OPTIONS.map((s) => (
                  <Button
                    key={s.value}
                    type="button"
                    variant={seatChoice === s.value ? "default" : "outline"}
                    onClick={() => setSeatChoice(s.value)}
                  >
                    {t(s.labelKey)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("pref.defaultAirport")}</Label>
              <Input
                placeholder={t("pref.airportPlaceholder")}
                value={defaultAirport}
                onChange={(e) => setDefaultAirport(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("pref.meals")}</Label>
              <Input
                placeholder={t("pref.mealsPlaceholder")}
                value={specialMeals}
                onChange={(e) => setSpecialMeals(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("pref.hotelRoom")}</Label>
              <div className="flex gap-2">
                {ROOM_OPTIONS.map((room) => (
                  <Button
                    key={room.value}
                    type="button"
                    variant={hotelRoom === room.value ? "default" : "outline"}
                    onClick={() => setHotelRoom(room.value)}
                  >
                    {t(room.labelKey)}
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
            {t("pref.loyaltyTitle")}
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
