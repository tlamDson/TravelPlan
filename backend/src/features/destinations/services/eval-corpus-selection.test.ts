import { describe, it, expect } from "vitest";
import {
  selectEvalCorpusCities,
  excludeAlreadyScraped,
} from "./eval-corpus-selection";
import type { CountrySeedPayload } from "./world-destinations.builder";

describe("selectEvalCorpusCities", () => {
  const vn: CountrySeedPayload = {
    idKey: "vn",
    name: "Việt Nam",
    nameEn: "Vietnam",
    isSupported: true,
    cities: [
      {
        idKey: "hanoi",
        name: "Hà Nội",
        nameEn: "Hanoi",
        timezone: "Asia/Ho_Chi_Minh",
      },
      {
        idKey: "hochiminh",
        name: "TP. Hồ Chí Minh",
        nameEn: "Ho Chi Minh City",
        timezone: "Asia/Ho_Chi_Minh",
      },
    ],
  };
  const fr: CountrySeedPayload = {
    idKey: "fr",
    name: "Pháp",
    nameEn: "France",
    isSupported: true,
    cities: [
      {
        idKey: "paris",
        name: "Paris",
        nameEn: "Paris",
        timezone: "Europe/Paris",
      },
    ],
  };
  const notSupported: CountrySeedPayload = {
    idKey: "zz",
    name: "Unsupported",
    nameEn: "Unsupported",
    isSupported: false,
    cities: [
      {
        idKey: "somewhere",
        name: "Somewhere",
        nameEn: "Somewhere",
        timezone: "UTC",
      },
    ],
  };

  it("picks exactly 1 representative city per isSupported (RAG_ISO2) country", () => {
    const selected = selectEvalCorpusCities([vn, fr, notSupported]);

    expect(selected).toHaveLength(2); // vn + fr, not the unsupported one
    expect(selected.map((s) => s.countryIdKey)).toEqual(["vn", "fr"]);
  });

  it("always picks the first city in the country's list (matches capital-first ordering from mergeCapitalIfMissing)", () => {
    const selected = selectEvalCorpusCities([vn]);
    expect(selected[0]).toEqual({
      countryIdKey: "vn",
      countryNameEn: "Vietnam",
      cityIdKey: "hanoi",
      cityNameEn: "Hanoi",
    });
  });

  it("skips a supported country that has no cities (should never happen, but must not crash)", () => {
    const empty: CountrySeedPayload = {
      idKey: "xx",
      name: "Empty",
      nameEn: "Empty",
      isSupported: true,
      cities: [],
    };
    const selected = selectEvalCorpusCities([empty]);
    expect(selected).toEqual([]);
  });

  it("returns an empty array when nothing is supported", () => {
    expect(selectEvalCorpusCities([notSupported])).toEqual([]);
  });
});

describe("excludeAlreadyScraped", () => {
  const targets = [
    {
      countryIdKey: "vn",
      countryNameEn: "Vietnam",
      cityIdKey: "hanoi",
      cityNameEn: "Hanoi",
    },
    {
      countryIdKey: "fr",
      countryNameEn: "France",
      cityIdKey: "paris",
      cityNameEn: "Paris",
    },
    {
      countryIdKey: "ae",
      countryNameEn: "United Arab Emirates",
      cityIdKey: "dubai",
      cityNameEn: "Dubai",
    },
  ];

  it("drops targets whose cityIdKey already has scraped data (makes re-running the seed idempotent and resumable)", () => {
    // Real incident 2026-08-22: a 26-city seed run exhausted the day's
    // Gemini quota partway through, with 7 cities already succeeded
    // (removeOnComplete:true, so they don't show up as "failed" jobs —
    // the only way to know they're done is PlaceInsight itself). Re-running
    // the naive select-all would waste quota re-scraping cities that
    // already have real data.
    const result = excludeAlreadyScraped(targets, ["dubai"]);

    expect(result.map((t) => t.cityIdKey)).toEqual(["hanoi", "paris"]);
  });

  it("returns everything unchanged when nothing has been scraped yet", () => {
    expect(excludeAlreadyScraped(targets, [])).toEqual(targets);
  });

  it("returns an empty array when everything has already been scraped", () => {
    expect(excludeAlreadyScraped(targets, ["hanoi", "paris", "dubai"])).toEqual(
      [],
    );
  });

  it("ignores already-scraped cityIdKeys that aren't in the target list", () => {
    const result = excludeAlreadyScraped(targets, ["tokyo", "dubai"]);
    expect(result.map((t) => t.cityIdKey)).toEqual(["hanoi", "paris"]);
  });
});
