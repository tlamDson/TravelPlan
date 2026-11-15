import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectCatalogValid } from "@/test/analytics";
import { CreateTripDialog } from "../CreateTripDialog";

vi.mock("@/features/analytics", () => ({
  track: vi.fn(),
  trackOnce: vi.fn(),
}));
import { track } from "@/features/analytics";

const trackMock = vi.mocked(track);

beforeEach(() => {
  trackMock.mockClear();
  server.use(
    http.get("*/destinations", () =>
      HttpResponse.json({ success: true, countries: [] }),
    ),
  );
});

describe("CreateTripDialog (wizard_started)", () => {
  it.each(["dashboard", "trip_list"] as const)(
    "tracks the %s entry point when the wizard opens",
    async (entryPoint) => {
      const user = userEvent.setup();
      renderWithProviders(
        <CreateTripDialog
          entryPoint={entryPoint}
          trigger={<button>Open wizard</button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Open wizard" }));

      expect(trackMock).toHaveBeenCalledTimes(1);
      expect(trackMock).toHaveBeenCalledWith("wizard_started", { entryPoint });
      expectCatalogValid(trackMock.mock.calls);
    },
  );

  it("does not track before the wizard is opened or when it closes", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CreateTripDialog
        entryPoint="dashboard"
        trigger={<button>Open wizard</button>}
      />,
    );
    expect(trackMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open wizard" }));
    await user.keyboard("{Escape}");

    expect(trackMock).toHaveBeenCalledTimes(1);
  });
});
