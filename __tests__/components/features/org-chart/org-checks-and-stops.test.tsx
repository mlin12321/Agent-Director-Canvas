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
  SessionTeam,
  Thread,
} from "#/api/director/types";
import { AgentInspectorDrawer } from "#/components/features/org-chart/agent-inspector-drawer";
import { TeamCard } from "#/components/features/org-chart/team-card";
import { TeamHoverCard } from "#/components/features/org-chart/team-hover-card";
import { OrgSessionsContext } from "#/components/features/org-chart/org-sessions";
import { OrgSettings } from "#/components/features/org-chart/org-settings";
import { ProposedTeams } from "#/components/features/org-chart/proposed-teams";
import { ReviewSummary } from "#/components/features/org-chart/review-summary";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";
import { atWork } from "./session-fixtures";

const STATE: DirectorSettingsState = {
  default_agent_type: "software-engineer",
  allowed_agent_types: [],
  max_teams: 32,
  max_depth: 8,
  teams: 3,
  depth: 2,
  max_concurrent_runs: null,
  allowed_profiles: [],
  resume_on_start: false,
  report_compaction_chars: 24000,
  soft_check_in_minutes: 120,
  hard_check_in_minutes: 360,
  manager_check_accepted_reviews: 5,
  manager_check_ic_setbacks: 3,
  route_requests: true,
  session_cost_limit: 0,
  max_open_sessions: 0,
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
  model: null,
  reason: null,
  hand_over: null,
};

// A team of the org: nobody works at it itself.
const NODE: OrgNode = {
  agent_type: "software-engineer",
  id: "shop",
  parent_id: "root",
  title: "Shop",
  boundary: { path: "shop", writable: [], readonly: [] },
  isolation: "shared",
  spec_summary: "",
  old_specs: [],
  headline: "",
  agent_profile: null,
  child_ids: [],
};

const TEAM_AGENTS = [IC, { ...IC, role: "manager" as const }];

/** The team beside a session that has `work` at it. */
function atTeam(work: Partial<SessionTeam>, children: React.ReactNode) {
  return (
    <OrgSessionsContext.Provider
      value={atWork(NODE, { agents: TEAM_AGENTS, ...work })}
    >
      {children}
    </OrgSessionsContext.Provider>
  );
}

const STOPPED = {
  at: "2026-11-14T10:00:00+00:00",
  reason: "Two hours on one schema.",
  running: [],
};

describe("settings that could not be read", () => {
  it("says so on the button, and reads them when it is pressed", async () => {
    let fails = true;
    server.use(
      http.get("*/api/director/settings", () =>
        fails
          ? HttpResponse.json({ detail: "Not now" }, { status: 500 })
          : HttpResponse.json(STATE),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);

    const retry = await screen.findByTestId("org-settings-retry");
    expect(retry).toHaveAccessibleName("ORG_CHART$SETTINGS_LOAD_FAILED");

    fails = false;
    await user.click(retry);

    expect(
      await screen.findByRole("button", { name: "ORG_CHART$SETTINGS" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("org-settings-retry")).toBeNull();
  });
});

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
        soft_check_in_minutes: 30,
        hard_check_in_minutes: 360,
        manager_check_accepted_reviews: 5,
        manager_check_ic_setbacks: 0,
        route_requests: true,
        session_cost_limit: 0,
        max_open_sessions: 0,
        report_compaction_chars: 24000,
      },
    ]);
  });

  it("saves the limits on sessions and the length reports are kept at", async () => {
    const saved = settingsHandlers(STATE);
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    const modal = await openSettings(user);

    const tokens = within(modal).getByLabelText(
      /ORG_CHART\$SETTINGS_SESSION_COST/,
    );
    const most = within(modal).getByLabelText(
      /ORG_CHART\$SETTINGS_MAX_SESSIONS/,
    );
    const length = within(modal).getByLabelText(
      /ORG_CHART\$SETTINGS_COMPACTION/,
    );
    expect(tokens).toHaveValue(0);
    expect(most).toHaveValue(0);
    expect(length).toHaveValue(24000);

    // Reports are kept at 1000 characters at least.
    await user.clear(length);
    await user.type(length, "500");
    expect(
      within(modal).getByRole("button", { name: "BUTTON$SAVE" }),
    ).toBeDisabled();

    await user.clear(length);
    await user.type(length, "12000");
    await user.clear(tokens);
    await user.type(tokens, "7.5");
    await user.clear(most);
    await user.type(most, "3");
    await user.click(
      within(modal).getByRole("button", { name: "BUTTON$SAVE" }),
    );

    await waitFor(() =>
      expect(screen.queryByTestId("org-settings-modal")).toBeNull(),
    );
    expect(saved[0]).toMatchObject({
      session_cost_limit: 7.5,
      max_open_sessions: 3,
      report_compaction_chars: 12000,
    });
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
      soft_check_in_minutes: 1,
      hard_check_in_minutes: 360,
      manager_check_accepted_reviews: 2,
      manager_check_ic_setbacks: 0,
      route_requests: true,
      session_cost_limit: 0,
      max_open_sessions: 0,
      report_compaction_chars: 24000,
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
    const shopCard = (
      <TeamCard node={NODE} current={false} onOpenDetails={() => {}} />
    );
    const { rerender } = renderWithProviders(atTeam({}, shopCard));
    expect(screen.queryByRole("img", { name: "ORG_CHART$STOPPED" })).toBeNull();

    rerender(atTeam({ status: "blocked", stopped: STOPPED }, shopCard));

    expect(
      screen.getByRole("img", { name: "ORG_CHART$STOPPED" }),
    ).toBeInTheDocument();
  });

  it("says so, and why, in its hover card and its details", () => {
    memoryHandlers();
    const stopped = { status: "blocked" as const, stopped: STOPPED };
    const { unmount } = renderWithProviders(
      atTeam(stopped, <TeamHoverCard node={NODE} />),
    );

    expect(screen.getByText("ORG_CHART$STOPPED")).toBeInTheDocument();
    expect(screen.getByText("ORG_CHART$STOPPED_REASON")).toBeInTheDocument();
    unmount();

    renderWithProviders(
      atTeam(stopped, <AgentInspectorDrawer node={NODE} onClose={() => {}} />),
    );

    // Said of the session that is stopped here.
    expect(
      within(screen.getByTestId("org-session-work-s1")).getByRole("status"),
    ).toHaveTextContent("ORG_CHART$STOPPED_REASON");
  });
});

describe("a Manager that has not been written to", () => {
  it("is said to be not started in the hover card", () => {
    renderWithProviders(
      atTeam({ agents: [IC] }, <TeamHoverCard node={NODE} />),
    );

    expect(
      screen.getByText(
        "ORG_CHART$ROLE_IC (idle), ORG_CHART$MANAGER_NOT_STARTED",
      ),
    ).toBeInTheDocument();
  });

  it("is not mentioned for a team that has its Manager", () => {
    renderWithProviders(atTeam({}, <TeamHoverCard node={NODE} />));

    expect(screen.getByText(/ORG_CHART\$ROLE_MANAGER/)).toBeInTheDocument();
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
      atTeam(
        {
          pending_split: {
            children: [
              {
                agent_type: "software-engineer",
                title: "Orders",
                path: "shop/api",
                writable: [],
                readonly: [],
                isolation: "shared",
                task: "Take orders.",
                agent_profile: null,
              },
            ],
            contracts: "",
            status: "proposed",
            keeps: ["shop.web"],
            replaces: ["shop.api"],
            proposed_at: "2026-11-14T10:00:00+00:00",
          },
        },
        <AgentInspectorDrawer node={NODE} nodes={nodes} onClose={() => {}} />,
      ),
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
      agent_profile: null,
    };
    renderWithProviders(
      <ProposedTeams
        proposal={{
          children: [
            {
              agent_type: "software-engineer",
              ...child,
              title: "Orders",
              reason: "The order rules stand alone.",
            },
            {
              agent_type: "software-engineer",
              ...child,
              title: "Pages",
              path: "shop/web",
            },
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
      atTeam(
        {
          pending_split: {
            children: [],
            contracts: "",
            status: "proposed",
            proposed_at: "2026-11-14T10:00:00+00:00",
          },
        },
        <AgentInspectorDrawer node={NODE} onClose={() => {}} />,
      ),
    );

    expect(
      screen.getByRole("region", { name: "ORG_CHART$SPLIT_PROPOSED" }),
    ).toBeInTheDocument();
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
    // Threads are kept per place of a session, and name places.
    memoryHandlers([
      thread("shop@s1", "shop.web@s1", false),
      thread("shop@s1", "shop.web@s1", true),
      thread("root@s1", "shop@s1", true),
    ]);
    renderWithProviders(
      atTeam({}, <AgentInspectorDrawer node={NODE} onClose={() => {}} />),
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
