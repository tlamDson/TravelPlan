import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  useTranslationStore,
  type Language,
} from "@/stores/useTranslationStore";
import NotFound from "@/app/pages/NotFound";

const INITIAL = useTranslationStore.getState();

afterEach(() => {
  useTranslationStore.setState(INITIAL, true);
});

function renderIn(language: Language) {
  useTranslationStore.setState({ language });
  render(
    <MemoryRouter>
      <NotFound />
    </MemoryRouter>,
  );
}

describe("NotFound page follows the UI language", () => {
  it("renders English copy", () => {
    renderIn("English (US)");
    expect(
      screen.getByRole("heading", { name: "Page Not Found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("renders French copy", () => {
    renderIn("French");
    expect(
      screen.getByRole("heading", { name: "Page introuvable" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/La page que vous cherchez n'existe pas/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Accueil" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("link", { name: "Tableau de bord" }),
    ).toHaveAttribute("href", "/dashboard");
  });

  it("renders Vietnamese copy", () => {
    renderIn("Vietnamese");
    expect(
      screen.getByRole("heading", { name: "Không tìm thấy trang" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Trang bạn đang tìm không tồn tại/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("link", { name: "Bảng điều khiển" }),
    ).toHaveAttribute("href", "/dashboard");
  });
});
