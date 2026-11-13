import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const INITIAL = useTranslationStore.getState();

afterEach(() => {
  useTranslationStore.setState(INITIAL, true);
});

describe("close button label follows the UI language while mounted", () => {
  it("dialog close label switches from English to Vietnamese", () => {
    useTranslationStore.setState({ language: "English (US)" });
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();

    act(() => useTranslationStore.setState({ language: "Vietnamese" }));

    expect(screen.getByRole("button", { name: "Đóng" })).toBeInTheDocument();
  });

  it("sheet close label switches from English to French", () => {
    useTranslationStore.setState({ language: "English (US)" });
    render(
      <Sheet open>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Title</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();

    act(() => useTranslationStore.setState({ language: "French" }));

    expect(screen.getByRole("button", { name: "Fermer" })).toBeInTheDocument();
  });
});
