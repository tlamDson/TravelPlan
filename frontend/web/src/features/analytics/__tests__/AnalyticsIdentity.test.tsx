import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsIdentity } from "../components/AnalyticsIdentity";

const auth = vi.hoisted(() => ({
  state: { isLoaded: false, userId: null as string | null | undefined },
}));
const identify = vi.hoisted(() => vi.fn());

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => auth.state,
}));
vi.mock("../track", () => ({ identify }));

beforeEach(() => {
  identify.mockClear();
  auth.state = { isLoaded: false, userId: null };
});

describe("AnalyticsIdentity", () => {
  it("waits for Clerk to load before identifying", () => {
    render(<AnalyticsIdentity />);

    expect(identify).not.toHaveBeenCalled();
  });

  it("identifies the signed-in Clerk user", () => {
    auth.state = { isLoaded: true, userId: "user_1" };

    render(<AnalyticsIdentity />);

    expect(identify).toHaveBeenCalledWith("user_1");
  });

  it("clears the user after sign-out", () => {
    auth.state = { isLoaded: true, userId: "user_1" };
    const { rerender } = render(<AnalyticsIdentity />);

    auth.state = { isLoaded: true, userId: null };
    rerender(<AnalyticsIdentity />);

    expect(identify).toHaveBeenLastCalledWith(null);
  });

  it("treats a loaded anonymous visitor as null, not undefined", () => {
    auth.state = { isLoaded: true, userId: undefined };

    render(<AnalyticsIdentity />);

    expect(identify).toHaveBeenCalledWith(null);
  });
});
