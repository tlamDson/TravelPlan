import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { getDateFnsLocale } from "@/utils/locale";
import { DatePicker } from "../wizard/DatePicker";

function renderPicker() {
  return renderWithProviders(
    <DatePicker
      value="2026-11-20"
      onChange={() => {}}
      minDate={new Date(2026, 10, 1)}
      testId="picker"
    />,
  );
}

describe("DatePicker follows the UI language", () => {
  afterEach(() => useTranslationStore.setState({ language: "English (US)" }));

  describe("Vietnamese", () => {
    beforeEach(() => useTranslationStore.setState({ language: "Vietnamese" }));

    it("formats the chosen date in Vietnamese", () => {
      renderPicker();
      const trigger = screen.getByTestId("picker");
      expect(trigger).toHaveTextContent("20 thg 11, 2026");
      expect(trigger).not.toHaveTextContent("Nov");
    });

    it("shows the calendar caption, weekdays and day labels in Vietnamese", async () => {
      renderPicker();
      await userEvent.click(screen.getByTestId("picker"));

      const grid = await screen.findByRole("grid");
      expect(grid).toHaveAccessibleName(/tháng 11/i);
      expect(document.body.textContent).not.toContain("November");
      expect(document.body.textContent).not.toMatch(/\bSu\b|\bMo\b|\bTu\b/);
      expect(screen.queryByLabelText(/Saturday|November/)).toBeNull();
    });
  });

  it("keeps English output for English (US)", async () => {
    renderPicker();
    expect(screen.getByTestId("picker")).toHaveTextContent("Nov 20, 2026");
    await userEvent.click(screen.getByTestId("picker"));
    expect(await screen.findByRole("grid")).toHaveAccessibleName(/November/);
  });
});

describe("getDateFnsLocale", () => {
  it("maps each app language to its date-fns locale", () => {
    expect(getDateFnsLocale("Vietnamese").code).toBe("vi");
    expect(getDateFnsLocale("French").code).toBe("fr");
    expect(getDateFnsLocale("English (US)").code).toBe("en-US");
    expect(getDateFnsLocale(undefined).code).toBe("en-US");
  });
});
