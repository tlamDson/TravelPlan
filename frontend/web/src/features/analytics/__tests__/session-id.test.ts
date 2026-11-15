import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionIdGetter, SESSION_STORAGE_KEY } from "../lib/session-id";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("createSessionIdGetter", () => {
  it("creates one id and keeps returning it", () => {
    const newId = vi.fn(() => "sess-1");
    const getSessionId = createSessionIdGetter({ newId });

    expect(getSessionId()).toBe("sess-1");
    expect(getSessionId()).toBe("sess-1");
    expect(newId).toHaveBeenCalledTimes(1);
  });

  it("persists the id in sessionStorage so a reload keeps the session", () => {
    createSessionIdGetter({ newId: () => "sess-1" })();

    const afterReload = createSessionIdGetter({ newId: () => "sess-2" });

    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe("sess-1");
    expect(afterReload()).toBe("sess-1");
  });

  it("falls back to an in-memory id when sessionStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const getSessionId = createSessionIdGetter({ newId: () => "sess-mem" });

    expect(getSessionId()).toBe("sess-mem");
    expect(getSessionId()).toBe("sess-mem");
  });
});
