import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type {
  DirectorSettingsState,
  NodeMemory,
  OrgNode,
} from "#/api/director/types";
import { AgentInspectorDrawer } from "#/components/features/org-chart/agent-inspector-drawer";
import { NodeHoverCard } from "#/components/features/org-chart/node-hover-card";
import { OrgSessionsContext } from "#/components/features/org-chart/org-sessions";
import { OrgSettings } from "#/components/features/org-chart/org-settings";
import { SpecAndContracts } from "#/components/features/org-chart/spec-and-contracts";
import {
  countsOf,
  TeamRecord,
} from "#/components/features/org-chart/team-record";
import { TeamReports } from "#/components/features/org-chart/team-reports";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";
import { atWork } from "./session-fixtures";

// The chat stack needs a live agent server; what matters here is which
// conversation the drawer opens.
vi.mock("#/components/features/org-chart/agent-conversation", () => ({
  AgentConversation: ({ conversationId }: { conversationId: string }) => (
    <div data-testid="conversation-view">{conversationId}</div>
  ),
}));

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
  session_worktrees: true,
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

function memoryHandlers(
  memory: NodeMemory = {
    specs: [],
    reports: [],
    former_teams: [],
    history: [],
  },
) {
  server.use(
    http.get("*/api/director/org/nodes/:nodeId/memory", () =>
      HttpResponse.json(memory),
    ),
    http.get("*/api/director/org/nodes/:nodeId/messages", () =>
      HttpResponse.json([]),
    ),
  );
}

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "ORG_CHART$SETTINGS" }),
  );
  return screen.findByTestId("org-settings-modal");
}

// A team of the org. Nobody works at a team itself, and no session has
// been given a task at this one.
const NOT_STARTED: OrgNode = {
  id: "shop",
  parent_id: "root",
  title: "Shop",
  boundary: { path: "shop", writable: [], readonly: [] },
  isolation: "shared",
  headline: "Sells the goods",
  spec_summary: "",
  old_specs: [],
  child_ids: [],
};

describe("the limit on teams", () => {
  it("limits teams, with what the org has now", async () => {
    settingsHandlers(STATE);
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);

    const modal = await openSettings(user);

    expect(
      within(modal).getByLabelText(/ORG_CHART\$SETTINGS_MAX_TEAMS/),
    ).toHaveValue(32);
    expect(
      within(modal).getByText("ORG_CHART$SETTINGS_TEAMS_NOW"),
    ).toBeInTheDocument();
  });

  it("says on hover that every team has an IC and a Manager", async () => {
    settingsHandlers(STATE);
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    const modal = await openSettings(user);

    const info = within(modal).getByRole("button", {
      name: "ORG_CHART$SETTINGS_TEAMS_INFO_LABEL",
    });
    // Read out for those who cannot hover; shown to the rest on hover.
    expect(info).toHaveAccessibleDescription("ORG_CHART$SETTINGS_TEAMS_INFO");
    expect(screen.getAllByText("ORG_CHART$SETTINGS_TEAMS_INFO")).toHaveLength(
      1,
    );
    await user.hover(info);

    await waitFor(() =>
      expect(screen.getAllByText("ORG_CHART$SETTINGS_TEAMS_INFO")).toHaveLength(
        2,
      ),
    );
  });

  it("saves the limit as teams", async () => {
    const saved = settingsHandlers(STATE);
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    const modal = await openSettings(user);

    const teams = within(modal).getByLabelText(/ORG_CHART\$SETTINGS_MAX_TEAMS/);
    await user.clear(teams);
    await user.type(teams, "1");
    await user.click(
      within(modal).getByRole("button", { name: "BUTTON$SAVE" }),
    );

    await waitFor(() =>
      expect(screen.queryByTestId("org-settings-modal")).toBeNull(),
    );
    expect(saved).toEqual([
      {
        max_teams: 1,
        max_depth: 8,
        allowed_profiles: [],
        resume_on_start: false,
        stall_check_minutes: 120,
        manager_check_accepted_reviews: 5,
        manager_check_ic_setbacks: 3,
        route_requests: true,
      },
    ]);
  });

  it("goes back to 32 teams when asked to", async () => {
    settingsHandlers({ ...STATE, max_teams: 5 });
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    const modal = await openSettings(user);

    await user.click(
      within(modal).getByRole("button", { name: "ORG_CHART$SETTINGS_RESET" }),
    );

    expect(
      within(modal).getByLabelText(/ORG_CHART\$SETTINGS_MAX_TEAMS/),
    ).toHaveValue(32);
  });
});

describe("a team that has not been given a task", () => {
  it("says so in its hover card and its details, with how it starts", () => {
    memoryHandlers();
    const { unmount } = renderWithProviders(
      <NodeHoverCard node={NOT_STARTED} />,
    );

    expect(screen.getByText("ORG_CHART$TEAM_NOT_STARTED")).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <AgentInspectorDrawer node={NOT_STARTED} onClose={() => {}} />,
    );

    const agents = screen.getByRole("group", { name: "ORG_CHART$AGENTS" });
    expect(
      within(agents).getByText("ORG_CHART$TEAM_NOT_STARTED"),
    ).toBeInTheDocument();
    expect(
      within(agents).queryByText("ORG_CHART$MANAGER_NOT_STARTED"),
    ).toBeNull();
    expect(
      screen.getByText("ORG_CHART$TEAM_NOT_STARTED_HELP"),
    ).toBeInTheDocument();
  });
});

/** The team's details, with a session whose IC is as given. */
function detailsWithIc(ic: Record<string, unknown>) {
  return renderWithProviders(
    <OrgSessionsContext.Provider
      value={atWork(NOT_STARTED, {
        agents: [{ role: "ic", kind: "openhands", ...ic }],
      } as never)}
    >
      <AgentInspectorDrawer node={NOT_STARTED} onClose={() => {}} />
    </OrgSessionsContext.Provider>,
  );
}

describe("an IC in hand-over mode", () => {
  it("stays one agent, with its two conversations in the list", async () => {
    memoryHandlers();
    const user = userEvent.setup();
    detailsWithIc({
      conversation_id: "main-1",
      status: "idle",
      hand_over: { conversation_id: "side-1", status: "working" },
    });

    const list = screen.getByTestId("org-node-conversations");
    const [main, mode] = within(list).getAllByRole("button");
    expect(within(list).getAllByRole("button")).toHaveLength(2);
    expect(main).toHaveTextContent("ORG_CHART$ROLE_IC");
    expect(mode).toHaveTextContent(
      "ORG_CHART$ROLE_IC · Work · ORG_CHART$HAND_OVER_MODE",
    );
    expect(mode).toHaveTextContent("working");
    // Nothing is open until a conversation is chosen.
    expect(main).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("conversation-view")).toBeNull();
    expect(screen.queryByText("ORG_CHART$HAND_OVER_MODE_HELP")).toBeNull();

    await user.click(mode);
    expect(mode).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("ORG_CHART$HAND_OVER_MODE_HELP"),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("conversation-view")).toHaveTextContent(
      "side-1",
    );

    // Choosing another flips to it; choosing the open one puts it away.
    await user.click(main);
    expect(mode).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByTestId("conversation-view")).toHaveTextContent(
      "main-1",
    );
    await user.click(main);
    expect(screen.queryByTestId("conversation-view")).toBeNull();
  });

  it("says so when the hand-over could not be started, and opens nothing", () => {
    memoryHandlers();
    detailsWithIc({
      conversation_id: null,
      status: "idle",
      hand_over: { conversation_id: "side-1", status: "lost" },
    });

    const mode = screen.getByRole("button", {
      name: /ORG_CHART\$HAND_OVER_MODE/,
    });
    expect(mode).toBeDisabled();
    expect(mode).toHaveTextContent("lost");
    expect(screen.getByRole("status")).toHaveTextContent(
      "ORG_CHART$HAND_OVER_LOST",
    );
  });

  it("lists one conversation for an IC that has no hand-over", () => {
    memoryHandlers();
    detailsWithIc({ conversation_id: null, status: "idle" });

    expect(
      within(screen.getByTestId("org-node-conversations")).getAllByRole(
        "button",
      ),
    ).toHaveLength(1);
  });
});

describe("what a team is given of the teams before it", () => {
  it("marks what the IC above handed over among its reports", async () => {
    memoryHandlers({
      specs: [],
      reports: [
        {
          at: "2026-11-14T10:00:00+00:00",
          role: "ic",
          text: "API chose SQLite; keep it.",
          handed_over: true,
        },
        { at: "2026-11-14T11:00:00+00:00", role: "ic", text: "Kept SQLite." },
      ],
      former_teams: [],
      history: [],
    });
    renderWithProviders(<TeamReports node={NOT_STARTED} />);

    const [handed, own] = await screen.findAllByRole("listitem");

    expect(handed).toHaveTextContent("API chose SQLite; keep it.");
    expect(handed).toHaveTextContent("ORG_CHART$REPORT_HANDED_OVER");
    expect(handed).not.toHaveTextContent("ORG_CHART$ROLE_IC");
    expect(own).toHaveTextContent("ORG_CHART$ROLE_IC");
    expect(own).not.toHaveTextContent("ORG_CHART$REPORT_HANDED_OVER");
  });

  it("names a spec left by an earlier team as old", async () => {
    memoryHandlers({
      specs: [
        {
          path: "shop",
          spec: "# API by hand",
          readonly: false,
          old: true,
          left_by: "API",
        },
        { path: "shop/db", spec: "# Schema", readonly: true, old: true },
      ],
      reports: [],
      former_teams: [],
      history: [],
    });
    renderWithProviders(<SpecAndContracts node={NOT_STARTED} />);

    expect(await screen.findByText("ORG_CHART$SPEC_OLD")).toBeInTheDocument();
    expect(screen.getByText("ORG_CHART$SPEC_OLD_UNKNOWN")).toBeInTheDocument();
    expect(screen.getAllByText("ORG_CHART$SPEC_OLD_HELP")).toHaveLength(2);
    expect(screen.queryByText("ORG_CHART$SPEC_OPEN")).toBeNull();
  });

  it("names a team's own spec as before", async () => {
    memoryHandlers({
      specs: [{ path: "shop", spec: "# Shop", readonly: false, old: false }],
      reports: [],
      former_teams: [],
      history: [],
    });
    renderWithProviders(<SpecAndContracts node={NOT_STARTED} />);

    expect(await screen.findByText("ORG_CHART$SPEC_OPEN")).toBeInTheDocument();
    expect(screen.queryByText("ORG_CHART$SPEC_OLD_HELP")).toBeNull();
  });
});

describe("the record of the teams below a team", () => {
  const at = (minute: number) =>
    `2026-11-14T10:${String(minute).padStart(2, "0")}:00+00:00`;
  const HISTORY: NodeMemory["history"] = [
    { at: at(0), kind: "set_up", team_id: "api", team: "API" },
    { at: at(1), kind: "sent_back", team_id: "api", team: "API" },
    { at: at(2), kind: "sent_back", team_id: "api", team: "API" },
    { at: at(3), kind: "accepted", team_id: "api", team: "API" },
    { at: at(4), kind: "set_up", team_id: "web", team: "Web" },
    { at: at(5), kind: "stalled", team_id: "web", team: "Web" },
    {
      at: at(6),
      kind: "woken",
      detail: "your IC has sent back the work of 'API' 3 times.",
    },
    { at: at(7), kind: "replaced", team_id: "api", team: "API" },
    { at: at(8), kind: "set_up", team_id: "api", team: "Orders" },
    { at: at(9), kind: "stopped", team_id: "api", team: "Orders" },
    // The limit reached on one piece of work, twice, and that work accepted.
    { at: at(10), kind: "woken", team_id: "web", team: "Web", detail: "x" },
    { at: at(11), kind: "woken", team_id: "web", team: "Web", detail: "y" },
    { at: at(12), kind: "accepted", team_id: "web", team: "Web" },
    { at: at(13), kind: "accepted", team_id: "web", team: "Web" },
    {
      at: at(14),
      kind: "declined",
      detail: "Search (services/search). Reason: Too small for a team.",
      paths: ["services/search"],
    },
  ];

  it("counts each team, and a team set up in an old place apart from it", () => {
    const none = {
      accepted: 0,
      sentBack: 0,
      stalled: 0,
      stopped: 0,
      tasks: 0,
      succeeded: 0,
    };
    expect(countsOf(HISTORY ?? [])).toEqual([
      {
        ...none,
        id: "api",
        team: "API",
        accepted: 1,
        sentBack: 2,
        tasks: 1,
        succeeded: 1,
        ended: "replaced",
      },
      {
        ...none,
        id: "web",
        team: "Web",
        stalled: 1,
        accepted: 2,
        // The limit reached twice on one piece of work is one task.
        tasks: 2,
        succeeded: 1,
        ended: null,
      },
      { ...none, id: "api", team: "Orders", stopped: 1, ended: null },
    ]);
  });

  it("shows the counts, why the Manager was woken and the removed teams", async () => {
    memoryHandlers({
      specs: [],
      reports: [],
      history: HISTORY,
      former_teams: [
        {
          id: "api",
          title: "API",
          path: "services/api",
          purpose: "Serve the checkout API",
          ended: "replaced",
          at: at(7),
          compacted_report: "Chose SQLite.",
          contracts: "db serves http",
        },
      ],
    });
    renderWithProviders(<TeamRecord node={NOT_STARTED} />);

    const record = await screen.findByRole("region", {
      name: "ORG_CHART$TEAM_RECORD_TITLE",
    });
    expect(within(record).getByText("Orders")).toBeInTheDocument();
    expect(within(record).getByText("Web")).toBeInTheDocument();
    // The teams that are there now; API is gone and is not among them.
    expect(within(record).queryByText("API")).toBeNull();
    expect(
      within(record).getAllByText("ORG_CHART$TEAM_RECORD_LINE"),
    ).toHaveLength(2);
    expect(
      within(record).getAllByText("ORG_CHART$TEAM_RECORD_WOKEN"),
    ).toHaveLength(3);
    // Only Web has had a task among the teams that are there.
    expect(
      within(record).getAllByText("ORG_CHART$TEAM_RECORD_SUCCESS"),
    ).toHaveLength(1);
    expect(
      within(record).getByText("ORG_CHART$TEAM_RECORD_DECLINED"),
    ).toBeInTheDocument();
    const removed = screen.getByRole("region", {
      name: "ORG_CHART$FORMER_TEAMS_TITLE",
    });
    expect(removed).toHaveTextContent("API");
    expect(removed).toHaveTextContent("services/api");
    expect(removed).toHaveTextContent("ORG_CHART$FORMER_TEAM_REPLACED");
    expect(removed).toHaveTextContent("Chose SQLite.");
    // What was counted of it while it was there.
    expect(removed).toHaveTextContent("ORG_CHART$TEAM_RECORD_LINE");
    expect(removed).toHaveTextContent("db serves http");
  });

  it("shows what a session wrote for a team the org did not take", async () => {
    memoryHandlers({
      specs: [],
      reports: [],
      history: [],
      former_teams: [
        {
          id: "services.api.jobs",
          title: "Jobs",
          path: "services/api/jobs",
          purpose: "Run the refund jobs",
          ended: "not_taken",
          at: at(7),
          compacted_report: "Chose a ledger.",
          spec: "# Refund jobs",
          session: "Refunds",
        },
      ],
    });
    renderWithProviders(<TeamRecord node={NOT_STARTED} />);

    const removed = await screen.findByRole("region", {
      name: "ORG_CHART$FORMER_TEAMS_TITLE",
    });
    expect(removed).toHaveTextContent("Jobs");
    expect(removed).toHaveTextContent(
      "ORG_CHART$FORMER_TEAM_NOT_TAKEN · Refunds",
    );
    expect(removed).toHaveTextContent("ORG_CHART$FORMER_TEAM_SPEC");
    expect(removed).toHaveTextContent("# Refund jobs");
    expect(removed).toHaveTextContent("Chose a ledger.");
  });

  it("shows nothing for a team with no record", async () => {
    memoryHandlers();
    const { container } = renderWithProviders(
      <TeamRecord node={NOT_STARTED} />,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(
      screen.queryByRole("region", { name: "ORG_CHART$TEAM_RECORD_TITLE" }),
    ).toBeNull();
  });
});
