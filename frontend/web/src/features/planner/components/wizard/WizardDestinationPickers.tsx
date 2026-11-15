import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { useTripWizardStore } from "@/stores/trip-wizard.store";
import {
  useTranslationStore,
  type Language,
} from "@/stores/useTranslationStore";
import { localizeCountryName } from "@/utils/country-name";
import {
  fetchDestinations,
  type DestinationCity,
  type DestinationCountry,
} from "../../api/destinations.api";
import {
  DestinationSearchPicker,
  type SearchPickerItem,
} from "./destinationSearchPicker";

const MIN_DESTINATION = 2;

/** Country name in the UI language; the API `name` is often English-only. */
function lc(c: DestinationCountry, language: Language, vi: boolean) {
  const localized = localizeCountryName(c.nameEn, language);
  if (localized !== c.nameEn) return localized;
  return vi ? c.name : c.nameEn;
}

function lt(c: DestinationCity, vi: boolean) {
  return vi ? c.name : c.nameEn;
}

function sortDisp<T>(items: T[], f: (x: T) => string): T[] {
  return [...items].sort((a, b) =>
    f(a).localeCompare(f(b), undefined, { sensitivity: "base" }),
  );
}

export function WizardDestinationPickers() {
  const { data, setData } = useTripWizardStore();
  const { t, language } = useTranslationStore();
  const vi = language === "Vietnamese";
  const [countryId, setCountryId] = useState("");
  const [cityId, setCityId] = useState("");
  const [openC, setOpenC] = useState(false);
  const [openCity, setOpenCity] = useState(false);
  const [init, setInit] = useState(true);

  const { data: countries = [] } = useQuery({
    queryKey: ["destinations"],
    queryFn: fetchDestinations,
    staleTime: 600_000,
  });

  /** Dev-only: inspect API country coverage (idKey, names, RAG flag, city count). */
  useEffect(() => {
    if (!import.meta.env.DEV || countries.length === 0) return;
    console.groupCollapsed(
      `[Wizard] destinations loaded — ${countries.length} countries`,
    );
    console.table(
      countries.map((c) => ({
        idKey: c.idKey,
        nameEn: c.nameEn,
        isSupported: c.isSupported,
        cities: c.cities?.length ?? 0,
      })),
    );
    console.groupEnd();
  }, [countries]);

  const sortedC = useMemo(
    () => sortDisp(countries, (c) => lc(c, language, vi)),
    [countries, language, vi],
  );
  const rawCities = useMemo(
    () => countries.find((c) => c.idKey === countryId)?.cities ?? [],
    [countries, countryId],
  );
  const sortedT = useMemo(
    () => sortDisp(rawCities, (c) => lt(c, vi)),
    [rawCities, vi],
  );
  const selectedCountry = useMemo(
    () => countries.find((c) => c.idKey === countryId),
    [countries, countryId],
  );

  const countryItems: SearchPickerItem[] = useMemo(
    () =>
      sortedC.map((c) => ({
        value: c.idKey,
        filterText: `${c.nameEn} ${c.name} ${lc(c, language, vi)}`,
        highlight: c.isSupported,
        label: (
          <>
            {c.flagEmoji ? `${c.flagEmoji} ` : null}
            {lc(c, language, vi)}
          </>
        ),
      })),
    [sortedC, language, vi],
  );

  const cityItems: SearchPickerItem[] = useMemo(
    () =>
      sortedT.map((c) => ({
        value: c.idKey,
        filterText: `${c.nameEn} ${c.name}`,
        highlight: Boolean(selectedCountry?.isSupported),
        label: (
          <span className="flex w-full min-w-0 items-center justify-between gap-2">
            <span className="truncate">{lt(c, vi)}</span>
            {c.hasRagInsight ? (
              <span className="shrink-0 rounded-md bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                {t("wizard.insightsReady")}
              </span>
            ) : null}
          </span>
        ),
      })),
    [sortedT, vi, selectedCountry?.isSupported, t],
  );

  /* One-way sync: API destination list + wizard store → local picker state. */
  /* eslint-disable react-hooks/set-state-in-effect -- hydrate pickers when countries load; no external store subscription */
  useEffect(() => {
    if (!data.destination || countries.length === 0) {
      setInit(false);
      return;
    }
    if (data.countryIdKey && data.cityIdKey) {
      setCountryId(data.countryIdKey);
      setCityId(data.cityIdKey);
      setInit(false);
      return;
    }
    const parts = data.destination.split(",").map((s) => s.trim());
    const cityPart = parts[0] ?? "";
    const countryPart = parts[1] ?? "";
    const mc = countries.find(
      (c) =>
        c.nameEn.toLowerCase() === countryPart.toLowerCase() ||
        c.name.toLowerCase() === countryPart.toLowerCase(),
    );
    if (mc) {
      setCountryId(mc.idKey);
      const mct = mc.cities.find(
        (x) =>
          x.nameEn.toLowerCase() === cityPart.toLowerCase() ||
          x.name.toLowerCase() === cityPart.toLowerCase(),
      );
      if (mct) setCityId(mct.idKey);
      if (import.meta.env.DEV) {
        console.log("[Wizard] hydrated destination from free text", {
          destination: data.destination,
          country: { idKey: mc.idKey, nameEn: mc.nameEn },
          city: mct
            ? { idKey: mct.idKey, nameEn: mct.nameEn }
            : "(no city match)",
        });
      }
    } else if (import.meta.env.DEV && countryPart) {
      console.warn("[Wizard] country not in API list — check seed/backend", {
        destination: data.destination,
        parsedCountryPart: countryPart,
        parsedCityPart: cityPart,
        countryCount: countries.length,
      });
    }
    setInit(false);
  }, [countries, data.countryIdKey, data.cityIdKey, data.destination]);

  useEffect(() => {
    if (init) return;
    if (countryId && cityId) {
      const co = countries.find((c) => c.idKey === countryId);
      const ci = co?.cities.find((c) => c.idKey === cityId);
      if (co && ci) {
        if (import.meta.env.DEV) {
          console.log("[Wizard] destination set (picker)", {
            destination: `${ci.nameEn}, ${co.nameEn}`,
            country: {
              idKey: co.idKey,
              nameEn: co.nameEn,
              name: co.name,
              isSupported: co.isSupported,
            },
            city: {
              idKey: ci.idKey,
              nameEn: ci.nameEn,
              name: ci.name,
              hasRagInsight: ci.hasRagInsight,
            },
          });
        }
        setData({
          destination: `${ci.nameEn}, ${co.nameEn}`,
          countryIdKey: co.idKey,
          cityIdKey: ci.idKey,
        });
      }
    }
  }, [cityId, countries, countryId, init, setData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const destErr =
    data.destination.trim().length > 0 &&
    data.destination.trim().length < MIN_DESTINATION
      ? t("wizard.destError")
      : null;

  const coLabel = countryId
    ? countries.find((c) => c.idKey === countryId)
    : undefined;
  const ciLabel = cityId
    ? rawCities.find((c) => c.idKey === cityId)
    : undefined;

  return (
    <div className="space-y-2">
      <Label>{t("wizard.destination")}</Label>
      <DestinationSearchPicker
        items={countryItems}
        value={countryId}
        onValueChange={(id) => {
          if (import.meta.env.DEV) {
            const sel = countries.find((c) => c.idKey === id);
            console.log("[Wizard] country selected", sel ?? { idKey: id });
          }
          setCountryId(id);
          setCityId("");
          setData({
            destination: "",
            countryIdKey: undefined,
            cityIdKey: undefined,
          });
        }}
        triggerLabel={
          coLabel ? lc(coLabel, language, vi) : t("wizard.selectCountry")
        }
        searchPlaceholder={t("wizard.searchCountry")}
        emptyLabel={t("wizard.noResults")}
        open={openC}
        onOpenChange={setOpenC}
        testId="trip-wizard-country"
        itemTestIdPrefix="country-option"
      />
      {countryId ? (
        <div className="pt-2 animate-in fade-in slide-in-from-top-1">
          <DestinationSearchPicker
            items={cityItems}
            value={cityId}
            onValueChange={(id) => {
              if (import.meta.env.DEV) {
                const co = countries.find((c) => c.idKey === countryId);
                const city = co?.cities.find((c) => c.idKey === id);
                console.log("[Wizard] city selected", {
                  country: co
                    ? { idKey: co.idKey, nameEn: co.nameEn }
                    : undefined,
                  city: city ?? { idKey: id },
                });
              }
              setCityId(id);
            }}
            triggerLabel={ciLabel ? lt(ciLabel, vi) : t("wizard.selectCity")}
            searchPlaceholder={t("wizard.searchCity")}
            emptyLabel={t("wizard.noResults")}
            open={openCity}
            onOpenChange={setOpenCity}
            testId="trip-wizard-city"
            itemTestIdPrefix="city-option"
          />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t("wizard.destinationsHint")}
      </p>
      {destErr && !init ? (
        <p className="text-sm text-destructive">{destErr}</p>
      ) : null}
    </div>
  );
}
