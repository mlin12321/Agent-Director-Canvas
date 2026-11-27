import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NodeStatus, OrgNode, ReviewState } from "#/api/director/types";
import type { TeamWork } from "#/components/features/org-chart/team-places";
import {
  OrgByState,
  teamStateOf,
} from "#/components/features/org-chart/org-by-state";
import { OrgSessionsContext } from "#/components/features/org-chart/org-sessions";
import { renderWithProviders } from "test-utils";
import { placeAt, sessionOf } from "./session-fixtures";

interface Given {
  review?: ReviewState;
  waiting?: boolean;
  /** False for a team no session has agents at. */
  started?: boolean;
}

/** What goes on at a team: the work of the sessions there. */
function work(status: NodeStatus, given: Given = {}): TeamWork {
  return {
    agents:
      given.started === false
        ? []
        : [
            {
              role: "ic",
              conversation_id: null,
              status: "idle",
              kind: "openhands",
              acp_server: null,
              model: null,
              reason: null,
              hand_over: null,
            },
          ],
    status,
    headline: "",
    review: given.review
      ? {
          state: given.review,
          round: 1,
          summary: "",
          description: "",
          findings: [],
          at: "2026-11-13T00:00:00Z",
        }
      : null,
    stopped: null,
    pending_split: null,
    waiting_to_start: given.waiting ?? false,
    waiting: [],
  };
}

/**
 * A team beside what goes on at it. Nobody works at a team itself: on the
 * board the work is a session's.
 */
function team(id: string, status: NodeStatus, given: Given = {}) {
  const node: OrgNode = {
    agent_type: "software-engineer",
    id,
    parent_id: id === "root" ? null : "root",
    title: `${id} team`,
    boundary: { path: id, writable: ["**"], readonly: [] },
    isolation: "shared",
    summary: "",
    leftover_documents: [],
    headline: "",
    agent_profile: null,
    child_ids: [],
  };
  return { node, work: work(status, given) };
}

function board(teams: ReturnType<typeof team>[], currentId = teams[0].node.id) {
  // One session, opened at the first team, has the work of every team
  // that was given a task.
  const session = sessionOf(
    "s1",
    "Work",
    teams.flatMap(({ node, work: at }) =>
      at.agents.length > 0
        ? [
            placeAt(node, "s1", {
              agents: at.agents,
              status: at.status,
              review: at.review,
              waiting_to_start: at.waiting_to_start,
            }),
          ]
        : [],
    ),
  );
  return (
    <OrgSessionsContext.Provider value={[session]}>
      <OrgByState
        nodes={new Map(teams.map(({ node }) => [node.id, node]))}
        currentId={currentId}
        onOpenDetails={() => {}}
      />
    </OrgSessionsContext.Provider>
  );
}

function column(state: string) {
  return within(screen.getByTestId(`org-state-${state}`))
    .queryAllByTestId(/^org-node-/)
    .map((card) => card.getAttribute("data-testid")?.slice(9));
}

describe("teamStateOf", () => {
  it.each([
    [work("idle"), "idle"],
    [work("idle", { waiting: true }), "idle"],
    [work("working"), "working"],
    [work("working", { review: "pending" }), "in_review"],
    [work("done", { review: "pending" }), "in_review"],
    [work("working", { review: "changes_requested" }), "changes_requested"],
    [work("idle", { review: "changes_requested" }), "changes_requested"],
    [work("blocked", { review: "changes_requested" }), "blocked"],
    [work("blocked", { review: "pending" }), "blocked"],
    [work("done", { review: "accepted" }), "done"],
    [work("done"), "done"],
    [work("working", { review: "accepted" }), "working"],
    [work("idle", { started: false }), "not_started"],
    [work("blocked", { started: false }), "blocked"],
  ])("puts %# in its column", (at, expected) => {
    expect(teamStateOf(at)).toBe(expected);
  });
});

describe("OrgByState", () => {
  it("draws every team once, under its state, with a count per column", () => {
    renderWithProviders(
      board([
        team("root", "working"),
        team("api", "working", { review: "pending" }),
        team("web", "working", { review: "changes_requested" }),
        team("search", "blocked"),
        team("pay", "done", { review: "accepted" }),
        team("mail", "idle"),
        team("cart", "working"),
      ]),
    );

    expect(column("idle")).toEqual(["mail"]);
    expect(column("working")).toEqual(["root", "cart"]);
    expect(column("in_review")).toEqual(["api"]);
    expect(column("changes_requested")).toEqual(["web"]);
    expect(column("blocked")).toEqual(["search"]);
    expect(column("done")).toEqual(["pay"]);
    expect(screen.getByTestId("org-state-count-working")).toHaveTextContent(
      "2",
    );
    expect(screen.getByTestId("org-state-count-done")).toHaveTextContent("1");
    expect(
      screen.getByRole("region", { name: "ORG_CHART$STATE_IN_REVIEW" }),
    ).toBeInTheDocument();
  });

  it("keeps the teams that were given no task apart from the idle ones", () => {
    renderWithProviders(
      board([
        team("root", "working"),
        team("api", "idle", { started: false }),
        team("web", "idle"),
      ]),
    );

    expect(column("not_started")).toEqual(["api"]);
    expect(column("idle")).toEqual(["web"]);
    expect(
      screen.getByRole("region", { name: "ORG_CHART$TEAM_NOT_STARTED" }),
    ).toBeInTheDocument();
  });

  it("moves a team to another column when its state changes", () => {
    const { rerender } = renderWithProviders(
      board([team("root", "working"), team("api", "working")]),
    );
    expect(column("working")).toEqual(["root", "api"]);

    rerender(board([team("root", "working"), team("api", "done")]));

    expect(column("working")).toEqual(["root"]);
    expect(column("done")).toEqual(["api"]);
    expect(screen.getByTestId("org-state-count-done")).toHaveTextContent("1");
  });

  it("marks the team the page is on and links the others to their pages", () => {
    renderWithProviders(
      board([team("root", "working"), team("api", "done")], "api"),
    );

    expect(screen.getByTestId("org-node-api")).toHaveAttribute("data-current");
    expect(
      within(screen.getByTestId("org-node-root")).getByRole("link"),
    ).toHaveAttribute("href", "/org/root");
  });

  it("draws an org of 500 teams", () => {
    const statuses: NodeStatus[] = ["idle", "working", "done", "blocked"];
    renderWithProviders(
      board(
        Array.from({ length: 500 }, (_, index) =>
          team(`t${index}`, statuses[index % 4]),
        ),
      ),
    );

    expect(screen.getAllByTestId(/^org-node-/)).toHaveLength(500);
    expect(screen.getByTestId("org-state-count-blocked")).toHaveTextContent(
      "125",
    );
  });
});
