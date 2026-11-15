import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/msw/server";
import { renderHookWithQuery } from "@/test/renderHookWithQuery";
import { resetExposureRegistryForTests } from "../../lib/exposure-registry";
import { useExperiment } from "../useExperiment";

const auth = vi.hoisted(() => ({
  state: {
    isLoaded: true,
    isSignedIn: true as boolean | undefined,
    userId: "user_1" as string | null,
  },
}));

vi.mock("@clerk/clerk-react", () => ({ useAuth: () => auth.state }));
vi.mock("@/features/analytics", () => ({
  getAnalyticsSessionId: () => "sess-1",
}));

let assignmentCalls = 0;
let exposures: unknown[] = [];

const settle = () => new Promise((r) => setTimeout(r, 30));

function serveAssignments(
  assignments: { experimentKey: string; variant: string }[],
) {
  server.use(
    http.get("*/experiments/assignments", () => {
      assignmentCalls += 1;
      return HttpResponse.json({ assignments });
    }),
  );
}

function serveExposures(status = 200) {
  server.use(
    http.post("*/experiments/exposures", async ({ request }) => {
      const body = (await request.json()) as { experimentKey: string };
      exposures.push(body);
      if (status !== 200) {
        return HttpResponse.json({ success: false }, { status });
      }
      return HttpResponse.json({
        experimentKey: body.experimentKey,
        variant: "treatment",
        recorded: true,
      });
    }),
  );
}

beforeEach(() => {
  auth.state = { isLoaded: true, isSignedIn: true, userId: "user_1" };
  assignmentCalls = 0;
  exposures = [];
});

afterEach(() => {
  resetExposureRegistryForTests();
  sessionStorage.clear();
});

describe("useExperiment()", () => {
  it("returns the server-assigned variant", async () => {
    serveAssignments([{ experimentKey: "cta-v1", variant: "treatment" }]);
    serveExposures();

    const { result } = renderHookWithQuery(() => useExperiment("cta-v1"));

    expect(result.current).toEqual({ variant: null, isLoading: true });
    await waitFor(() =>
      expect(result.current).toEqual({
        variant: "treatment",
        isLoading: false,
      }),
    );
  });

  it("logs one exposure with the analytics session id when the variant renders", async () => {
    serveAssignments([{ experimentKey: "cta-v1", variant: "treatment" }]);
    serveExposures();

    const { result } = renderHookWithQuery(() => useExperiment("cta-v1"));

    await waitFor(() => expect(result.current.variant).toBe("treatment"));
    await waitFor(() =>
      expect(exposures).toEqual([
        { experimentKey: "cta-v1", sessionId: "sess-1" },
      ]),
    );
  });

  it("logs the exposure once per session across remounts and components", async () => {
    serveAssignments([{ experimentKey: "cta-v1", variant: "treatment" }]);
    serveExposures();

    const first = renderHookWithQuery(() => useExperiment("cta-v1"));
    await waitFor(() => expect(exposures).toHaveLength(1));
    first.unmount();

    const second = renderHookWithQuery(() => [
      useExperiment("cta-v1"),
      useExperiment("cta-v1"),
    ]);
    await waitFor(() =>
      expect(second.result.current[0].variant).toBe("treatment"),
    );
    await settle();

    expect(exposures).toHaveLength(1);
  });

  it("does not log an exposure when expose is false", async () => {
    serveAssignments([{ experimentKey: "cta-v1", variant: "treatment" }]);
    serveExposures();

    const { result } = renderHookWithQuery(() =>
      useExperiment("cta-v1", { expose: false }),
    );

    await waitFor(() => expect(result.current.variant).toBe("treatment"));
    await settle();
    expect(exposures).toHaveLength(0);
  });

  it("returns null and logs nothing for an experiment that is not running", async () => {
    serveAssignments([{ experimentKey: "other-v1", variant: "control" }]);
    serveExposures();

    const { result } = renderHookWithQuery(() => useExperiment("cta-v1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await settle();
    expect(result.current.variant).toBeNull();
    expect(exposures).toHaveLength(0);
  });

  it("fetches assignments once for many experiments on the page", async () => {
    serveAssignments([
      { experimentKey: "cta-v1", variant: "treatment" },
      { experimentKey: "hero-v2", variant: "control" },
    ]);
    serveExposures();

    const { result } = renderHookWithQuery(() => [
      useExperiment("cta-v1"),
      useExperiment("hero-v2"),
    ]);

    await waitFor(() =>
      expect(result.current.map((r) => r.variant)).toEqual([
        "treatment",
        "control",
      ]),
    );
    expect(assignmentCalls).toBe(1);
  });

  it("does not call the API for a signed-out user and renders the default", async () => {
    auth.state = { isLoaded: true, isSignedIn: false, userId: null };
    serveAssignments([{ experimentKey: "cta-v1", variant: "treatment" }]);
    serveExposures();

    const { result } = renderHookWithQuery(() => useExperiment("cta-v1"));

    await settle();
    expect(result.current).toEqual({ variant: null, isLoading: false });
    expect(assignmentCalls).toBe(0);
    expect(exposures).toHaveLength(0);
  });

  it("waits while Clerk is still loading", async () => {
    auth.state = { isLoaded: false, isSignedIn: undefined, userId: null };
    serveAssignments([{ experimentKey: "cta-v1", variant: "treatment" }]);

    const { result } = renderHookWithQuery(() => useExperiment("cta-v1"));

    await settle();
    expect(result.current).toEqual({ variant: null, isLoading: true });
    expect(assignmentCalls).toBe(0);
  });

  it("renders the default when experiments are off (404)", async () => {
    server.use(
      http.get("*/experiments/assignments", () =>
        HttpResponse.json({ success: false }, { status: 404 }),
      ),
    );

    const { result } = renderHookWithQuery(() => useExperiment("cta-v1"));

    await waitFor(() =>
      expect(result.current).toEqual({ variant: null, isLoading: false }),
    );
  });

  it("renders the default when the response fails the contract", async () => {
    server.use(
      http.get("*/experiments/assignments", () =>
        HttpResponse.json({ assignments: [{ experimentKey: "BAD KEY" }] }),
      ),
    );

    const { result } = renderHookWithQuery(() => useExperiment("cta-v1"));

    await waitFor(() =>
      expect(result.current).toEqual({ variant: null, isLoading: false }),
    );
  });

  it("retries the exposure on a later render after a failed send", async () => {
    serveAssignments([{ experimentKey: "cta-v1", variant: "treatment" }]);
    serveExposures(500);

    const first = renderHookWithQuery(() => useExperiment("cta-v1"));
    await waitFor(() => expect(exposures).toHaveLength(1));
    await settle();
    first.unmount();

    serveExposures();
    renderHookWithQuery(() => useExperiment("cta-v1"));

    await waitFor(() => expect(exposures).toHaveLength(2));
  });
});
