import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { getDateFnsLocale } from "@/utils/locale";
import { DatePicker } from "../wizard/DatePicker";
import { StepBasics } from "../wizard/StepBasics";

vi.mock("../wizard/WizardDestinationPickers", () => ({
  WizardDestinationPickers: () => null,
}));

const ENGLISH_DATE_WORDS =
  /Today|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|January|February|March|April|May|June|July|August|September|October|November|December|\d(st|nd|rd|th),/;

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
      expect(trigger).toHaveTextContent("20 thg 11 năm 2026");
      expect(trigger).not.toHaveTextContent("Nov");
    });

    it("shows the calendar caption, weekdays and day labels in Vietnamese", async () => {
      renderPicker();
      await userEvent.click(screen.getByTestId("picker"));

      const grid = await screen.findByRole("grid");
      expect(grid).toHaveAccessibleName(/Tháng Mười Một 2026/);
      expect(document.body.textContent).not.toContain("November");
      expect(document.body.textContent).not.toMatch(/\bSu\b|\bMo\b|\bTu\b/);
      expect(screen.queryByLabelText(/Saturday|November/)).toBeNull();
    });
  });

  describe("Vietnamese labels", () => {
    beforeEach(() => useTranslationStore.setState({ language: "Vietnamese" }));

    it("every day cell label is Vietnamese (no English month, weekday or ordinal)", async () => {
      renderPicker();
      await userEvent.click(screen.getByTestId("picker"));

      const grid = await screen.findByRole("grid");
      const labels = within(grid)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label") ?? "");
      expect(labels.length).toBeGreaterThanOrEqual(28);
      for (const label of labels) {
        expect(label).not.toBe("");
        expect(label).not.toMatch(ENGLISH_DATE_WORDS);
      }
      expect(labels.some((l) => /tháng 11 năm 2026/.test(l))).toBe(true);
    });

    it("the month navigation buttons are Vietnamese", async () => {
      renderPicker();
      await userEvent.click(screen.getByTestId("picker"));
      expect(
        await screen.findByRole("button", { name: "Đến tháng sau" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Về tháng trước" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Go to/ })).toBeNull();
    });

    it("the Clear button is Vietnamese", async () => {
      renderPicker();
      await userEvent.click(screen.getByTestId("picker"));
      expect(
        await screen.findByRole("button", { name: "Xóa ngày" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    });

    it("the wizard date triggers have Vietnamese aria-labels", () => {
      renderWithProviders(<StepBasics />);
      expect(screen.getByTestId("trip-wizard-start-date")).toHaveAttribute(
        "aria-label",
        "Ngày bắt đầu",
      );
      expect(screen.getByTestId("trip-wizard-end-date")).toHaveAttribute(
        "aria-label",
        "Ngày kết thúc",
      );
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
