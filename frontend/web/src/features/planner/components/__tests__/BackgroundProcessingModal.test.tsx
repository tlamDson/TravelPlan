import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { BackgroundProcessingModal } from "../BackgroundProcessingModal";

describe("BackgroundProcessingModal — 15s timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not show the modal before 15s have elapsed", () => {
    render(<BackgroundProcessingModal isProcessing={true} />);
    act(() => {
      vi.advanceTimersByTime(14000);
    });
    expect(screen.queryByText("AI is working")).not.toBeInTheDocument();
  });

  it("opens the modal after 15s of processing", () => {
    render(<BackgroundProcessingModal isProcessing={true} />);
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(screen.getByText("AI is working")).toBeInTheDocument();
  });

  it("never opens when isProcessing stays false", () => {
    render(<BackgroundProcessingModal isProcessing={false} />);
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(screen.queryByText("AI is working")).not.toBeInTheDocument();
  });

  it("only shows the modal once, even after it is dismissed and processing continues", () => {
    const { rerender } = render(
      <BackgroundProcessingModal isProcessing={true} />,
    );

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(screen.getByText("AI is working")).toBeInTheDocument();

    act(() => {
      screen.getByRole("button", { name: "Got it" }).click();
    });
    expect(screen.queryByText("AI is working")).not.toBeInTheDocument();

    rerender(
      <BackgroundProcessingModal
        isProcessing={true}
        currentStep="still going"
      />,
    );
    // No new 15s timer should reopen it — hasShownModal guards this.
    expect(screen.queryByText("AI is working")).not.toBeInTheDocument();
  });
});

describe("BackgroundProcessingModal — immediate open on retry step", () => {
  it("opens immediately (no 15s wait) when currentStep mentions retry", async () => {
    render(
      <BackgroundProcessingModal
        isProcessing={true}
        currentStep="AI timed out — retrying automatically..."
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("AI is working")).toBeInTheDocument(),
    );
  });

  it("matches 'retry' case-insensitively", async () => {
    render(
      <BackgroundProcessingModal isProcessing={true} currentStep="RETRY now" />,
    );
    await waitFor(() =>
      expect(screen.getByText("AI is working")).toBeInTheDocument(),
    );
  });
});
