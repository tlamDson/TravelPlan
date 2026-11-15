import { describe, it, expect } from "vitest";
import { localizeDestination } from "../country-name";

describe("localizeDestination", () => {
  it("shows the country in Vietnamese", () => {
    expect(localizeDestination("Kyoto, Japan", "Vietnamese")).toBe(
      "Kyoto, Nhật Bản",
    );
  });

  it("shows the country in French", () => {
    expect(localizeDestination("Paris, France", "French")).toBe(
      "Paris, France",
    );
    expect(localizeDestination("Kyoto, Japan", "French")).toBe("Kyoto, Japon");
  });

  it("leaves English unchanged", () => {
    expect(localizeDestination("Kyoto, Japan", "English (US)")).toBe(
      "Kyoto, Japan",
    );
  });

  it("localizes a bare country", () => {
    expect(localizeDestination("Japan", "Vietnamese")).toBe("Nhật Bản");
  });

  it("only touches the last comma segment and keeps the city as is", () => {
    expect(localizeDestination("Ho Chi Minh City, Vietnam", "Vietnamese")).toBe(
      "Ho Chi Minh City, Việt Nam",
    );
    expect(
      localizeDestination("Portland, Oregon, United States", "Vietnamese"),
    ).toBe("Portland, Oregon, Hoa Kỳ");
  });

  it("leaves text without a known country untouched", () => {
    expect(localizeDestination("Hội An", "Vietnamese")).toBe("Hội An");
    expect(localizeDestination("Atlantis, Narnia", "Vietnamese")).toBe(
      "Atlantis, Narnia",
    );
  });

  it("does not localize a city name that equals no country", () => {
    expect(localizeDestination("Georgia Aquarium", "Vietnamese")).toBe(
      "Georgia Aquarium",
    );
  });

  it("returns empty input as is", () => {
    expect(localizeDestination("", "Vietnamese")).toBe("");
  });
});
