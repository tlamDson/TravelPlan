import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useTranslationStore } from "@/stores/useTranslationStore";
import SignUpPage from "../SignUpPage";

vi.mock("@clerk/clerk-react", () => ({
  useSignUp: () => ({ signUp: undefined, isLoaded: true, setActive: vi.fn() }),
  useAuth: () => ({ isSignedIn: false }),
}));

const ENGLISH_COPY = [
  "Create your account",
  "Get started with your free account today.",
  "Continue with Google",
  "Or sign up with email",
  "First name",
  "Last name",
  "Password",
  "Confirm password",
  "Create account",
  "Already have an account?",
  "Sign in",
  "Terms",
  "Privacy Policy",
  "Start planning your perfect journey today",
  "Join thousands of travelers who use AI to create unforgettable trips.",
  "AI-powered itinerary generation",
  "Real-time budget tracking",
  "Interactive maps with route planning",
  "Export and share your plans",
];

const INITIAL_STATE = useTranslationStore.getState();

describe("SignUpPage i18n", () => {
  beforeEach(() => useTranslationStore.setState(INITIAL_STATE, true));
  afterEach(() => useTranslationStore.setState(INITIAL_STATE, true));

  it.each([
    ["French", "Créez votre compte", "Confirmer le mot de passe", "Suivi du budget en temps réel"],
    ["Vietnamese", "Tạo tài khoản của bạn", "Xác nhận mật khẩu", "Theo dõi ngân sách theo thời gian thực"],
  ] as const)(
    "renders no English copy in %s",
    (language, heading, confirm, benefit) => {
      useTranslationStore.setState({ language });
      renderWithProviders(<SignUpPage />, { route: "/signup" });

      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
      expect(screen.getByText(confirm)).toBeInTheDocument();
      expect(screen.getByText(benefit)).toBeInTheDocument();
      for (const copy of ENGLISH_COPY) {
        expect(screen.queryByText(copy)).not.toBeInTheDocument();
      }
    },
  );
});
