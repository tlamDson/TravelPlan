import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentLockBanner } from "../AgentLockBanner";

describe("AgentLockBanner — visibility", () => {
  it("renders nothing when not locked and no error", () => {
    const { container } = render(<AgentLockBanner isLocked={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AgentLockBanner — fallback branch", () => {
  it("shows the fallback banner regardless of isLocked", () => {
    render(<AgentLockBanner isLocked={false} isFallback />);
    expect(screen.getByText("Chế độ dự phòng")).toBeInTheDocument();
  });

  it("uses the shared tag-yellow tokens for the fallback banner, not raw yellow", () => {
    render(<AgentLockBanner isLocked={false} isFallback />);
    const title = screen.getByText("Chế độ dự phòng");

    expect(title.className).toContain("text-tag-yellow-text");
    expect(title.className).not.toMatch(/text-yellow-700/);
  });

  it("includes the fallback city when given", () => {
    render(
      <AgentLockBanner isLocked={false} isFallback fallbackCity="Hanoi" />,
    );
    expect(screen.getByText(/cho Hanoi/)).toBeInTheDocument();
  });
});

describe("AgentLockBanner — error branch", () => {
  it("shows the error title/message and a working Retry button, no Cancel button", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <AgentLockBanner
        isLocked={true}
        error="AI generation failed"
        onRetry={onRetry}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.getByText("AI failed to generate your trip"),
    ).toBeInTheDocument();
    expect(screen.getByText("AI generation failed")).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(
      screen.queryByRole("button", { name: /Cancel Generation/ }),
    ).not.toBeInTheDocument();

    await user.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables the Retry button and shows Retrying... while isRetrying", () => {
    render(
      <AgentLockBanner
        isLocked={true}
        error="boom"
        onRetry={vi.fn()}
        isRetrying
      />,
    );
    const button = screen.getByRole("button", { name: "Retrying..." });
    expect(button).toBeDisabled();
  });
});

describe("AgentLockBanner — processing branch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the processing title and jobId", () => {
    render(
      <AgentLockBanner isLocked={true} status="PROCESSING" jobId="job-123" />,
    );
    expect(screen.getByText("AI is working on your trip")).toBeInTheDocument();
    expect(screen.getByText(/job-123/)).toBeInTheDocument();
  });

  it("cycles the progressive message as elapsed seconds pass", () => {
    render(<AgentLockBanner isLocked={true} status="PROCESSING" />);
    expect(screen.getByText("Đang phân tích yêu cầu...")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(
      screen.getByText("Đang tìm các địa điểm phù hợp..."),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(6000); // total 10s
    });
    expect(
      screen.getByText("Đang lên lịch trình theo sở thích..."),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(8000); // total 18s
    });
    expect(
      screen.getByText("Đang tối ưu hoá hành trình theo khu vực..."),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10000); // total 28s
    });
    expect(
      screen.getByText("Sắp hoàn tất, chờ thêm chút nữa nhé..."),
    ).toBeInTheDocument();
  });

  it("shows the given currentStep instead of the progressive message", () => {
    render(
      <AgentLockBanner
        isLocked={true}
        status="PROCESSING"
        currentStep="Validating places with Google..."
      />,
    );
    // Appears twice: once as the AlertDescription (progressiveStep), once
    // inside the nested JobStatusIndicator's own currentStep display.
    expect(
      screen.getAllByText("Validating places with Google..."),
    ).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(
      screen.getAllByText("Validating places with Google..."),
    ).toHaveLength(2);
    expect(
      screen.queryByText("Đang phân tích yêu cầu..."),
    ).not.toBeInTheDocument();
  });

  it("shows a working Cancel button while processing", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <AgentLockBanner
        isLocked={true}
        status="PROCESSING"
        onCancel={onCancel}
      />,
    );
    const cancelButton = screen.getByRole("button", {
      name: "Cancel Generation",
    });
    await user.click(cancelButton);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("hides the Cancel button when the job is already CANCELLED", () => {
    render(
      <AgentLockBanner isLocked={true} status="CANCELLED" onCancel={vi.fn()} />,
    );
    expect(
      screen.queryByRole("button", { name: /Cancel Generation/ }),
    ).not.toBeInTheDocument();
  });
});
