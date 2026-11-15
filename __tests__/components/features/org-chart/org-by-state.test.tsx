import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NodeStatus, OrgNode, ReviewState } from "#/api/director/types";
import {
  OrgByState,
  teamStateOf,
} from "#/components/features/org-chart/org-by-state";
import { renderWithProviders } from "test-utils";

function team(
  id: string,
  status: NodeStatus,
  given: { review?: ReviewState; waiting?: boolean } = {},
): OrgNode {
  return {
    id,
    parent_id: id === "root" ? null : "root",
    title: `${id} team`,
    boundary: { path: id, writable: ["**"], readonly: [] },
    isolation: "shared",
    worktree_path: ".",
    branch: "main",
    agents: [{ role: "ic", conversation_id: null, status: "idle" }],
    status,
    spec_summary: "",
    escalations: [],
    pending_split: null,
    review: given.review
      ? {
          state: given.review,
          round: 1,
          description: "",
          self_reviewed: true,
          findings: [],
          feedback: "",
          requested_at: "2026-11-13T00:00:00Z",
        }
      : null,
    waiting_to_start: given.waiting,
    child_ids: [],
    descendant_counts: { idle: 0, working: 0, done: 0, blocked: 0 },
    escalation_count: 0,
  } as OrgNode;
}

function board(teams: OrgNode[], currentId = teams[0].id) {
  return (
    <OrgByState
      nodes={new Map(teams.map((node) => [node.id, node]))}
      currentId={currentId}
      collidingIds={new Set()}
      onOpenDetails={() => {}}
    />
  );
}

function column(state: string) {
  return within(screen.getByTestId(`org-state-${state}`))
    .queryAllByTestId(/^org-node-/)
    .map((card) => card.getAttribute("data-testid")?.slice(9));
}

describe("teamStateOf", () => {
  it.each([
    [team("a", "idle"), "idle"],
    [team("a", "idle", { waiting: true }), "idle"],
    [team("a", "working"), "working"],
    [team("a", "working", { review: "pending" }), "in_review"],
    [team("a", "done", { review: "pending" }), "in_review"],
    [team("a", "done", { review: "unreviewed" }), "in_review"],
    [
      team("a", "working", { review: "changes_requested" }),
      "changes_requested",
    ],
    [team("a", "idle", { review: "changes_requested" }), "changes_requested"],
    [team("a", "blocked", { review: "changes_requested" }), "blocked"],
    [team("a", "blocked", { review: "pending" }), "blocked"],
    [team("a", "done", { review: "accepted" }), "done"],
    [team("a", "done"), "done"],
    [team("a", "working", { review: "accepted" }), "working"],
    [{ ...team("a", "idle"), agents: [] }, "not_started"],
    [{ ...team("a", "blocked"), agents: [] }, "blocked"],
  ])("puts %# in its column", (node, expected) => {
    expect(teamStateOf(node)).toBe(expected);
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
        { ...team("api", "idle"), agents: [] },
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
