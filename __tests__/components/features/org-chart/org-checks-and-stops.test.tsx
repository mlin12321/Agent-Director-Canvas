import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type {
  DirectorSettingsState,
  NodeId,
  NodeMemory,
  OrgNode,
  Review,
  Thread,
} from "#/api/director/types";
import { AgentInspectorDrawer } from "#/components/features/org-chart/agent-inspector-drawer";
import { NodeCard } from "#/components/features/org-chart/node-card";
import { NodeHoverCard } from "#/components/features/org-chart/node-hover-card";
import { OrgSettings } from "#/components/features/org-chart/org-settings";
import { ProposedTeams } from "#/components/features/org-chart/proposed-teams";
import { ReviewSummary } from "#/components/features/org-chart/review-summary";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";

const STATE: DirectorSettingsState = {
  max_teams: 32,
  max_depth: 8,
  teams: 3,
  depth: 2,
  max_concurrent_runs: null,
  allowed_profiles: [],
  resume_on_start: false,
  stall_check_minutes: 120,
  manager_check_accepted_reviews: 5,
  manager_check_ic_setbacks: 3,
  route_requests: true,
};

function settingsHandlers(state: DirectorSettingsState) {
  const saved: unknown[] = [];
  let now = state;
  server.use(
    http.get("*/api/director/settings", () => HttpResponse.json(now)),
    http.patch("*/api/director/settings", async ({ request }) => {
      const change = (await request.json()) as Partial<DirectorSettingsState>;
      saved.push(change);
      now = { ...now, ...change };
      return HttpResponse.json(now);
    }),
  );
  return saved;
}

function memoryHandlers(threads: Thread[] = []) {
  server.use(
    http.get("*/api/director/org/nodes/:nodeId/memory", () => {
      const body: NodeMemory = {
        specs: [],
        reports: [],
        former_teams: [],
        history: [],
      };
      return HttpResponse.json(body);
    }),
    http.get("*/api/director/org/nodes/:nodeId/messages", () =>
      HttpResponse.json(threads),
    ),
  );
}

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "ORG_CHART$SETTINGS" }),
  );
  return screen.findByTestId("org-settings-modal");
}

const IC = {
  role: "ic" as const,
  conversation_id: null,
  status: "idle",
  kind: "openhands" as const,
  acp_server: null,
};

const NODE = {
  id: "shop",
  parent_id: "root",
  title: "Shop",
  boundary: { path: "shop", writable: [], readonly: [] },
  isolation: "shared",
  worktree_path: ".",
  branch: "agents/shop",
  agents: [IC, { ...IC, role: "manager" as const }],
  status: "idle",
  spec_summary: "",
  escalations: [],
  escalation_count: 0,
  pending_split: null,
  child_ids: [],
  session_ids: [],
  session: "",
  session_title: "",
  instance_of: null,
} as unknown as OrgNode;

const STOPPED = {
  at: "2026-11-14T10:00:00+00:00",
  reason: "Two hours on one schema.",
};

describe("the checks in the settings", () => {
  it("shows the three checks and saves what is typed, 0 included", async () => {
    const saved = settingsHandlers(STATE);
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    const modal = await openSettings(user);

    const stall = within(modal).getByLabelText(
      /ORG_CHART\$SETTINGS_STALL_MINUTES/,
    );
    const reviews = within(modal).getByLabelText(
      /ORG_CHART\$SETTINGS_MANAGER_REVIEWS/,
    );
    const escalations = within(modal).getByLabelText(
      /ORG_CHART\$SETTINGS_MANAGER_ESCALATIONS/,
    );
    expect(stall).toHaveValue(120);
    expect(reviews).toHaveValue(5);
    expect(escalations).toHaveValue(3);

    await user.clear(stall);
    await user.type(stall, "30");
    await user.clear(escalations);
    await user.type(escalations, "0");
    await user.click(
      within(modal).getByRole("button", { name: "BUTTON$SAVE" }),
    );

    await waitFor(() =>
      expect(screen.queryByTestId("org-settings-modal")).toBeNull(),
    );
    expect(saved).toEqual([
      {
        max_teams: 32,
        max_depth: 8,
        allowed_profiles: [],
        resume_on_start: false,
        stall_check_minutes: 30,
        manager_check_accepted_reviews: 5,
        manager_check_ic_setbacks: 0,
        route_requests: true,
      },
    ]);
  });

  it("does not save a check that is empty or below 0", async () => {
    const saved = settingsHandlers(STATE);
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    const modal = await openSettings(user);
    const reviews = within(modal).getByLabelText(
      /ORG_CHART\$SETTINGS_MANAGER_REVIEWS/,
    );
    const save = within(modal).getByRole("button", { name: "BUTTON$SAVE" });

    await user.clear(reviews);
    expect(save).toBeDisabled();
    await user.type(reviews, "-1");
    expect(save).toBeDisabled();
    expect(saved).toEqual([]);
  });

  it("goes back to the defaults of the checks when asked to", async () => {
    settingsHandlers({
      ...STATE,
      stall_check_minutes: 1,
      manager_check_accepted_reviews: 2,
      manager_check_ic_setbacks: 0,
      route_requests: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    const modal = await openSettings(user);

    await user.click(
      within(modal).getByRole("button", { name: "ORG_CHART$SETTINGS_RESET" }),
    );

    expect(
      within(modal).getByLabelText(/ORG_CHART\$SETTINGS_STALL_MINUTES/),
    ).toHaveValue(120);
    expect(
      within(modal).getByLabelText(/ORG_CHART\$SETTINGS_MANAGER_REVIEWS/),
    ).toHaveValue(5);
    expect(
      within(modal).getByLabelText(/ORG_CHART\$SETTINGS_MANAGER_ESCALATIONS/),
    ).toHaveValue(3);
  });
});

describe("a stopped team", () => {
  it("is marked on its card only while it is stopped", () => {
    const { rerender } = renderWithProviders(
      <NodeCard node={NODE} current={false} onOpenDetails={() => {}} />,
    );
    expect(screen.queryByRole("img", { name: "ORG_CHART$STOPPED" })).toBeNull();

    rerender(
      <NodeCard
        node={{ ...NODE, status: "blocked", stopped: STOPPED }}
        current={false}
        onOpenDetails={() => {}}
      />,
    );

    expect(
      screen.getByRole("img", { name: "ORG_CHART$STOPPED" }),
    ).toBeInTheDocument();
  });

  it("says so, and why, in its hover card and its details", () => {
    memoryHandlers();
    const stopped = { ...NODE, status: "blocked" as const, stopped: STOPPED };
    const { unmount } = renderWithProviders(<NodeHoverCard node={stopped} />);

    expect(screen.getByText("ORG_CHART$STOPPED")).toBeInTheDocument();
    expect(screen.getByText("ORG_CHART$STOPPED_REASON")).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <AgentInspectorDrawer node={stopped} onClose={() => {}} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "ORG_CHART$STOPPED_REASON",
    );
  });
});

describe("a Manager that has not been written to", () => {
  it("is said to be not started in the hover card and the details", () => {
    memoryHandlers();
    const team = { ...NODE, agents: [IC] };
    const { unmount } = renderWithProviders(<NodeHoverCard node={team} />);

    expect(
      screen.getByText(
        "ORG_CHART$ROLE_IC (idle), ORG_CHART$MANAGER_NOT_STARTED",
      ),
    ).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <AgentInspectorDrawer node={team} onClose={() => {}} />,
    );

    const agents = screen.getByRole("group", { name: "ORG_CHART$AGENTS" });
    expect(
      within(agents).getByText("ORG_CHART$MANAGER_NOT_STARTED"),
    ).toBeInTheDocument();
    // It is not an agent to open.
    expect(
      within(agents).queryByRole("button", {
        name: /ORG_CHART\$MANAGER_NOT_STARTED/,
      }),
    ).toBeNull();
  });

  it("is not mentioned for a team that has its Manager", () => {
    renderWithProviders(<NodeHoverCard node={NODE} />);

    expect(screen.queryByText(/ORG_CHART\$MANAGER_NOT_STARTED/)).toBeNull();
  });
});

describe("proposed sub-teams", () => {
  it("name the teams the proposal keeps and the ones it replaces", () => {
    memoryHandlers();
    const nodes = new Map<NodeId, OrgNode>([
      ["shop.web", { ...NODE, id: "shop.web", title: "Web" }],
      ["shop.api", { ...NODE, id: "shop.api", title: "API" }],
    ]);
    renderWithProviders(
      <AgentInspectorDrawer
        node={{
          ...NODE,
          pending_split: {
            children: [
              {
                title: "Orders",
                path: "shop/api",
                writable: [],
                readonly: [],
                isolation: "shared",
                task: "Take orders.",
              },
            ],
            contracts: "",
            status: "proposed",
            keeps: ["shop.web"],
            replaces: ["shop.api"],
            proposed_at: "2026-11-14T10:00:00+00:00",
          },
        }}
        nodes={nodes}
        onClose={() => {}}
      />,
    );

    const proposal = screen.getByRole("region", {
      name: "ORG_CHART$SPLIT_PROPOSED",
    });
    expect(within(proposal).getByText("Orders")).toBeInTheDocument();
    expect(
      within(proposal).getByText("ORG_CHART$SPLIT_KEEPS"),
    ).toBeInTheDocument();
    expect(
      within(proposal).getByText("ORG_CHART$SPLIT_REPLACES"),
    ).toBeInTheDocument();
  });

  it("show why the IC wants the teams, where it said", () => {
    const child = {
      path: "shop/api",
      writable: [],
      readonly: [],
      isolation: "shared" as const,
      task: "Take orders.",
    };
    renderWithProviders(
      <ProposedTeams
        proposal={{
          children: [
            {
              ...child,
              title: "Orders",
              reason: "The order rules stand alone.",
            },
            { ...child, title: "Pages", path: "shop/web" },
          ],
          contracts: "",
          reason: "Orders and pages change for different reasons.",
          status: "proposed",
          proposed_at: "2026-11-15T10:00:00+00:00",
        }}
      />,
    );

    const proposal = screen.getByRole("region", {
      name: "ORG_CHART$SPLIT_PROPOSED",
    });
    expect(proposal).toHaveTextContent(
      "Orders and pages change for different reasons.",
    );
    const reasons = within(proposal).getAllByRole("listitem");
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toHaveTextContent(
      "Orders: The order rules stand alone.",
    );
  });

  it("say nothing of kept or replaced teams for a first proposal", () => {
    memoryHandlers();
    renderWithProviders(
      <AgentInspectorDrawer
        node={{
          ...NODE,
          pending_split: {
            children: [],
            contracts: "",
            status: "proposed",
            proposed_at: "2026-11-14T10:00:00+00:00",
          },
        }}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByText("ORG_CHART$SPLIT_KEEPS")).toBeNull();
    expect(screen.queryByText("ORG_CHART$SPLIT_REPLACES")).toBeNull();
  });
});

describe("a review", () => {
  const REVIEW: Review = {
    state: "pending",
    round: 1,
    summary: "",
    description: "",
    automated_ran: false,
    automated: [],
    findings: [],
    at: "2026-11-14T10:00:00+00:00",
  };

  it("says when the work went up without a review of its own", () => {
    const { rerender } = renderWithProviders(<ReviewSummary review={REVIEW} />);
    expect(screen.queryByText("ORG_CHART$REVIEW_PASSED_UP")).toBeNull();

    rerender(<ReviewSummary review={{ ...REVIEW, passed_up: true }} />);

    expect(screen.getByText("ORG_CHART$REVIEW_PASSED_UP")).toBeInTheDocument();
  });
});

describe("what one IC wrote to the IC below", () => {
  const at = "2026-11-14T10:00:00+00:00";
  const thread = (upper: NodeId, lower: NodeId, ic_to_ic: boolean): Thread => ({
    manager_node_id: upper,
    ic_node_id: lower,
    ic_to_ic,
    messages: [{ at, sender: ic_to_ic ? "ic" : "manager", text: "Hello." }],
  });

  it("is a thread of its own beside the Manager's with the same team", async () => {
    memoryHandlers([
      thread("shop", "shop.web", false),
      thread("shop", "shop.web", true),
      thread("root", "shop", true),
    ]);
    renderWithProviders(
      <AgentInspectorDrawer node={NODE} onClose={() => {}} />,
    );

    const messages = await screen.findByRole("region", {
      name: "ORG_CHART$MESSAGES_TITLE",
    });
    const [manager, below, above] =
      await within(messages).findAllByRole("group");

    expect(manager).toHaveAccessibleName("ORG_CHART$MESSAGES_BELOW");
    expect(below).toHaveAccessibleName("ORG_CHART$MESSAGES_IC_BELOW");
    expect(below).toHaveTextContent("ORG_CHART$ROLE_IC");
    expect(above).toHaveAccessibleName("ORG_CHART$MESSAGES_IC_ABOVE");
  });
});
