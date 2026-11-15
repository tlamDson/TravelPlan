import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import SignUpPage from "../SignUpPage";

vi.mock("@clerk/clerk-react", () => ({
  useSignUp: () => ({ signUp: undefined, isLoaded: true, setActive: vi.fn() }),
  useAuth: () => ({ isSignedIn: false }),
}));

describe("SignUpPage legal links", () => {
  it("links Terms and Privacy Policy to the real pages", () => {
    renderWithProviders(<SignUpPage />, { route: "/signup" });
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", "/privacy");
  });
});
