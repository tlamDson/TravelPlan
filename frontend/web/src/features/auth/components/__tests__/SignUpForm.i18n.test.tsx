import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { SignUpForm } from "../SignUpForm";

const INITIAL_STATE = useTranslationStore.getState();

const renderForm = (
  signUpError: {
    field: "email" | "password" | "general";
    message: string;
  } | null = null,
) =>
  render(
    <SignUpForm
      isLoaded
      isSubmitting={false}
      signUpError={signUpError}
      onSubmit={vi.fn()}
      onClearError={vi.fn()}
    />,
  );

describe("SignUpForm i18n", () => {
  beforeEach(() =>
    useTranslationStore.setState(
      { ...INITIAL_STATE, language: "French" },
      true,
    ),
  );
  afterEach(() => useTranslationStore.setState(INITIAL_STATE, true));

  it("shows the password strength label and tips in French", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "abcdefg" },
    });

    expect(await screen.findByText("Très faible")).toBeInTheDocument();
    expect(
      screen.queryByText(/Very Weak|Weak|Add uppercase|Add number|Add symbol/),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Ajoutez une majuscule/)).toBeInTheDocument();
  });

  it("shows validation errors in French", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "Abcdefg1!" },
    });
    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), {
      target: { value: "different" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Créer un compte" }));

    await waitFor(() =>
      expect(screen.getByText("Le prénom est obligatoire")).toBeInTheDocument(),
    );
    expect(screen.getByText("Le nom est obligatoire")).toBeInTheDocument();
    expect(
      screen.getByText("Saisissez une adresse e-mail valide"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Les mots de passe ne correspondent pas"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/is required|valid email|don't match/),
    ).not.toBeInTheDocument();
  });

  it("shows a translated Clerk error for the email field", () => {
    renderForm({
      field: "email",
      message: "auth.clerkError.form_identifier_exists",
    });
    expect(
      screen.getByText(
        "Un compte existe déjà avec cet e-mail. Essayez plutôt de vous connecter.",
      ),
    ).toBeInTheDocument();
  });
});
