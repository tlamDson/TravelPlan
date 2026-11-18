import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const INITIAL = useTranslationStore.getState();

afterEach(() => {
  useTranslationStore.setState(INITIAL, true);
});

describe("theme toggle accessible label follows the UI language", () => {
  it("is English in English", () => {
    useTranslationStore.setState({ language: "English (US)" });
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: "Toggle theme" }),
    ).toBeInTheDocument();
  });

  it("switches to French while mounted", () => {
    useTranslationStore.setState({ language: "English (US)" });
    render(<ThemeToggle />);

    act(() => useTranslationStore.setState({ language: "French" }));

    expect(
      screen.getByRole("button", { name: "Changer de thème" }),
    ).toBeInTheDocument();
  });

  it("is Vietnamese in Vietnamese", () => {
    useTranslationStore.setState({ language: "Vietnamese" });
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: "Chuyển đổi giao diện" }),
    ).toBeInTheDocument();
  });
});
