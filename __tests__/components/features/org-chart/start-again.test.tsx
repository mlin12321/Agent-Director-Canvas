import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { AgentRef, NodeStatus, OrgNode } from "#/api/director/types";
import { StartAgain } from "#/components/features/org-chart/start-again";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";

function team(status: NodeStatus, ic: AgentRef["status"]): OrgNode {
  return {
    id: "services.api",
    parent_id: "root",
    title: "API",
    boundary: { path: "services/api", writable: ["**"], readonly: [] },
    isolation: "worktree",
    worktree_path: "/work/api",
    branch: "agents/api",
    agents: [
      { role: "ic", conversation_id: null, status: ic, kind: "openhands" },
      { role: "manager", conversation_id: null, status: ic, kind: "openhands" },
    ],
    status,
    spec_summary: "",
    escalations: [],
    pending_split: null,
    review: null,
    waiting_to_start: false,
    old_specs: [],
    child_ids: [],
    descendant_counts: { idle: 0, working: 0, done: 0, blocked: 0 },
    escalation_count: 0,
  };
}

describe("StartAgain", () => {
  it("is offered only for a team that is not done and whose IC is lost", () => {
    const { rerender } = renderWithProviders(
      <StartAgain node={team("working", "idle")} />,
    );
    expect(screen.queryByTestId("org-start-again")).toBeNull();

    rerender(<StartAgain node={team("done", "lost")} />);
    expect(screen.queryByTestId("org-start-again")).toBeNull();

    rerender(<StartAgain node={team("working", "lost")} />);
    expect(screen.getByTestId("org-start-again")).toBeInTheDocument();
  });

  it("asks the server to start the team again, once", async () => {
    const asked: string[] = [];
    server.use(
      http.post(
        "*/api/director/org/nodes/:nodeId/start_again",
        ({ params }) => {
          asked.push(String(params.nodeId));
          return HttpResponse.json(team("idle", "idle"));
        },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<StartAgain node={team("working", "lost")} />);

    const button = screen.getByRole("button", {
      name: "ORG_CHART$START_AGAIN",
    });
    await user.click(button);

    await waitFor(() => expect(asked).toEqual(["services.api"]));
    await waitFor(() => expect(button).toBeDisabled());
  });

  it("says in the server's words why the team cannot be started", async () => {
    server.use(
      http.post("*/api/director/org/nodes/:nodeId/start_again", () =>
        HttpResponse.json(
          { detail: "Team Checkout above it has no IC here." },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<StartAgain node={team("working", "lost")} />);

    await user.click(
      screen.getByRole("button", { name: "ORG_CHART$START_AGAIN" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Team Checkout above it has no IC here.",
    );
  });
});
