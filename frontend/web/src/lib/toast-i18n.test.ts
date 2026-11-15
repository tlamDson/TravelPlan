import { describe, it, expect, afterEach } from "vitest";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { toastT, toastTOr } from "./toast-i18n";

const INITIAL = useTranslationStore.getState();
afterEach(() => useTranslationStore.setState(INITIAL, true));

describe("toastTOr", () => {
  it("uses the translated text of a known code key", () => {
    useTranslationStore.setState({ language: "Vietnamese" });
    expect(
      toastTOr(
        "toast.authError.form_identifier_exists",
        "toast.auth.signUpFailed",
      ),
    ).toBe(toastT("toast.authError.form_identifier_exists"));
    expect(toastT("toast.authError.form_identifier_exists")).not.toMatch(
      /account|email already/i,
    );
  });

  it("falls back to the translated fallback key for an unknown code", () => {
    useTranslationStore.setState({ language: "Vietnamese" });
    expect(
      toastTOr("toast.authError.some_new_code", "toast.auth.signUpFailed"),
    ).toBe("Không thể tạo tài khoản. Vui lòng thử lại.");
  });

  it("fills placeholders", () => {
    useTranslationStore.setState({ language: "Vietnamese" });
    expect(toastT("toast.regen.freeLeft", { count: 2 })).toBe(
      "Bạn còn 2 lượt tạo lại miễn phí cho chuyến đi này.",
    );
  });
});

describe("assistant chat error toast", () => {
  it("has a description in every language instead of the raw error", () => {
    useTranslationStore.setState({ language: "Vietnamese" });
    expect(toastT("toast.assistant.chatFailed")).toBe(
      "Trợ lý không thể trả lời. Vui lòng thử lại.",
    );
    useTranslationStore.setState({ language: "French" });
    expect(toastT("toast.assistant.chatFailed")).toBe(
      "L'assistant n'a pas pu répondre. Veuillez réessayer.",
    );
    useTranslationStore.setState({ language: "English (US)" });
    expect(toastT("toast.assistant.chatFailed")).toBe(
      "The assistant couldn't reply. Please try again.",
    );
  });
});
