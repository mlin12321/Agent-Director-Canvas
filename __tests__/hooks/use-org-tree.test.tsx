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

  it("follows the top team of an org that begins after the last one went", () => {
    const { result } = renderHook(() => useOrgTree(null));
    const root = { id: "root", parent_id: null };
    act(() =>
      mocks.handlers!.onEvent({
        type: "snapshot",
        focus_id: "root",
        nodes: [root],
        escalations: [],
        sessions: [],
      } as never),
    );
    act(() =>
      mocks.handlers!.onEvent({ type: "node_removed", id: "root" } as never),
    );
    expect(result.current.status).toBe("unavailable");

    act(() =>
      mocks.handlers!.onEvent({ type: "node_upsert", node: root } as never),
    );

    expect(result.current.focusId).toBe("root");
    expect(result.current.status).toBe("live");
  });

  it("shows a team again that a pull moved under another team", () => {
    const { result } = renderHook(() => useOrgTree("api"));
    const snapshot = (parent: string) =>
      act(() =>
        mocks.handlers!.onEvent({
          type: "snapshot",
          focus_id: "api",
          nodes: [{ id: "api", parent_id: parent }],
          escalations: [],
          sessions: [],
        } as never),
      );
    snapshot("b");
    act(() =>
      mocks.handlers!.onEvent({ type: "node_removed", id: "api" } as never),
    );
    expect(result.current.status).toBe("not_found");

    snapshot("root");

    expect(result.current.status).toBe("live");
    expect(result.current.nodes.get("api")?.parent_id).toBe("root");
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
