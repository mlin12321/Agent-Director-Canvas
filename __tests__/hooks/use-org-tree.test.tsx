import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOrgTree } from "#/hooks/use-org-tree";
import type { OrgStreamHandlers } from "#/api/director/director-client";

const mocks = vi.hoisted(() => ({
  backendId: "one",
  handlers: null as OrgStreamHandlers | null,
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({ backend: { id: mocks.backendId } }),
}));

vi.mock("#/api/director/director-client", async (original) => ({
  ...(await original<typeof import("#/api/director/director-client")>()),
  subscribeOrgTree: (_: unknown, handlers: OrgStreamHandlers) => {
    mocks.handlers = handlers;
    return () => {};
  },
}));

describe("useOrgTree", () => {
  beforeEach(() => {
    mocks.backendId = "one";
  });

  it("shows nothing of one backend's org once another backend is active", () => {
    const { result, rerender } = renderHook(() => useOrgTree(null));
    act(() =>
      mocks.handlers!.onEvent({
        type: "snapshot",
        focus_id: "root",
        nodes: [],
        escalations: [],
        sessions: [],
      } as never),
    );
    expect(result.current.focusId).toBe("root");

    mocks.backendId = "two";
    rerender();

    expect(result.current.focusId).toBeNull();
    expect(result.current.status).toBe("connecting");
  });
});
