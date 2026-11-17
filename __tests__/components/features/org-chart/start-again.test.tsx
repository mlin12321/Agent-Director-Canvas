import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type {
  AgentRef,
  NodeStatus,
  OrgNode,
  SessionTeam,
} from "#/api/director/types";
import { StartAgain } from "#/components/features/org-chart/start-again";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";
import { placeAt } from "./session-fixtures";

const API: OrgNode = {
  id: "services.api",
  parent_id: "root",
  title: "API",
  boundary: { path: "services/api", writable: ["**"], readonly: [] },
  isolation: "worktree",
  spec_summary: "",
  old_specs: [],
  headline: "",
  agent_profile: null,
  child_ids: [],
};

/** What the session has at the team, whose agents are as `ic` says. */
function team(status: NodeStatus, ic: AgentRef["status"]): SessionTeam {
  return placeAt(API, "s1a2b3c", {
    agents: [
      {
        role: "ic",
        conversation_id: null,
        status: ic,
        kind: "openhands",
        acp_server: null,
        hand_over: null,
      },
      {
        role: "manager",
        conversation_id: null,
        status: ic,
        kind: "openhands",
        acp_server: null,
        hand_over: null,
      },
    ],
    status,
  });
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

  it("asks the server to start again what the session has at the team, once", async () => {
    const asked: string[] = [];
    server.use(
      http.post(
        "*/api/director/org/sessions/:session/teams/:nodeId/start-again",
        ({ params }) => {
          asked.push(`${params.session} ${params.nodeId}`);
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

    await waitFor(() => expect(asked).toEqual(["s1a2b3c services.api"]));
    await waitFor(() => expect(button).toBeDisabled());
  });

  it("says in the server's words why the team cannot be started", async () => {
    server.use(
      http.post(
        "*/api/director/org/sessions/:session/teams/:nodeId/start-again",
        () =>
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
