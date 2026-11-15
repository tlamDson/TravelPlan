import { afterEach, describe, expect, it, vi } from "vitest";
import { installUnloadFlush } from "../lib/unload-flush";

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

afterEach(() => {
  setVisibility("visible");
});

describe("installUnloadFlush", () => {
  it("flushes on pagehide", () => {
    const client = { flushOnUnload: vi.fn() };
    const uninstall = installUnloadFlush(client);

    window.dispatchEvent(new Event("pagehide"));

    expect(client.flushOnUnload).toHaveBeenCalledTimes(1);
    uninstall();
  });

  it("flushes when the tab becomes hidden, not when it becomes visible", () => {
    const client = { flushOnUnload: vi.fn() };
    const uninstall = installUnloadFlush(client);

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(client.flushOnUnload).not.toHaveBeenCalled();

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(client.flushOnUnload).toHaveBeenCalledTimes(1);
    uninstall();
  });

  it("stops listening after uninstall", () => {
    const client = { flushOnUnload: vi.fn() };
    installUnloadFlush(client)();

    window.dispatchEvent(new Event("pagehide"));
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(client.flushOnUnload).not.toHaveBeenCalled();
  });
});
