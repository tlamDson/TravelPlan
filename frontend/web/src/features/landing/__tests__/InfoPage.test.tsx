import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppRouter } from "@/app/router";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
}));

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<AppRouter />);
}

describe("public info pages", () => {
  it.each([
    ["/about", "About TravelPlan"],
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms of Service"],
  ])("%s renders its page, not the 404", (path, heading) => {
    renderAt(path);
    expect(
      screen.getByRole("heading", { level: 1, name: heading }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to home/i })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
