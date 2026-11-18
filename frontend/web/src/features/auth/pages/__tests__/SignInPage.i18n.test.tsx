import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useTranslationStore } from "@/stores/useTranslationStore";
import SignInPage from "../SignInPage";

vi.mock("@clerk/clerk-react", () => ({
  useSignIn: () => ({ signIn: undefined, isLoaded: true, setActive: vi.fn() }),
  useAuth: () => ({ isSignedIn: false }),
}));

const ENGLISH_COPY = [
  "Welcome back",
  "Sign in to your account to continue planning your adventures.",
  "Continue with Google",
  "Or sign in with email",
  "Password",
  "Forgot password?",
  "Sign in",
  "Don't have an account?",
  "Sign up",
  "Start Your Adventure",
];

const INITIAL_STATE = useTranslationStore.getState();

describe("SignInPage i18n", () => {
  beforeEach(() => useTranslationStore.setState(INITIAL_STATE, true));
  afterEach(() => useTranslationStore.setState(INITIAL_STATE, true));

  it("renders the English copy by default", () => {
    useTranslationStore.setState({ language: "English (US)" });
    renderWithProviders(<SignInPage />, { route: "/signin" });
    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Forgot password?")).toBeInTheDocument();
  });

  it.each([
    ["French", "Bon retour", "Mot de passe oublié ?", "Continuer avec Google"],
    [
      "Vietnamese",
      "Chào mừng trở lại",
      "Quên mật khẩu?",
      "Tiếp tục với Google",
    ],
  ] as const)(
    "renders no English copy in %s",
    (language, heading, forgot, google) => {
      useTranslationStore.setState({ language });
      renderWithProviders(<SignInPage />, { route: "/signin" });

      expect(
        screen.getByRole("heading", { name: heading }),
      ).toBeInTheDocument();
      expect(screen.getByText(forgot)).toBeInTheDocument();
      expect(screen.getByText(google)).toBeInTheDocument();
      for (const copy of ENGLISH_COPY) {
        expect(screen.queryByText(copy)).not.toBeInTheDocument();
      }
    },
  );
});

describe("SignInPage validation i18n", () => {
  afterEach(() => useTranslationStore.setState(INITIAL_STATE, true));

  it("shows validation errors in Vietnamese", async () => {
    useTranslationStore.setState({ language: "Vietnamese" });
    renderWithProviders(<SignInPage />, { route: "/signin" });
    fireEvent.submit(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(
      await screen.findByText("Vui lòng nhập địa chỉ email hợp lệ"),
    ).toBeInTheDocument();
    expect(screen.getByText("Vui lòng nhập mật khẩu")).toBeInTheDocument();
    expect(
      screen.queryByText(/valid email|Password is required/),
    ).not.toBeInTheDocument();
  });
});
