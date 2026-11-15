import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type {
  DirectorSettingsState,
  NodeMemory,
  OrgNode,
} from "#/api/director/types";
import { AgentInspectorDrawer } from "#/components/features/org-chart/agent-inspector-drawer";
import { NodeCard } from "#/components/features/org-chart/node-card";
import { NodeHoverCard } from "#/components/features/org-chart/node-hover-card";
import { OrgSettings } from "#/components/features/org-chart/org-settings";
import { SpecAndContracts } from "#/components/features/org-chart/spec-and-contracts";
import { TeamReports } from "#/components/features/org-chart/team-reports";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";

// A server that limits teams still reports the agents it used to limit.
const STATE: DirectorSettingsState = {
  max_teams: 32,
  max_agents: 64,
  max_depth: 8,
  teams: 3,
  agents: 6,
  depth: 2,
  max_concurrent_runs: null,
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

function memoryHandlers(memory: NodeMemory = { specs: [], reports: [] }) {
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

// A team that was set up and has been given no task: it has no agents.
const NOT_STARTED = {
  id: "shop",
  parent_id: "root",
  title: "Shop",
  boundary: { path: "shop", writable: [], readonly: [] },
  isolation: "shared",
  worktree_path: ".",
  branch: "main",
  agents: [],
  status: "idle",
  headline: "Sells the goods",
  spec_summary: "",
  escalations: [],
  escalation_count: 0,
  pending_split: null,
  child_ids: [],
} as unknown as OrgNode;

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
    expect(
      within(modal).queryByLabelText(/ORG_CHART\$SETTINGS_MAX_AGENTS/),
    ).toBeNull();
    expect(
      within(modal).queryByText("ORG_CHART$SETTINGS_AGENTS_NOW"),
    ).toBeNull();
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

  it("saves the limit as teams and never as agents", async () => {
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
    expect(saved).toEqual([{ max_teams: 1, max_depth: 8 }]);
  });

  it("goes back to 32 teams when asked to", async () => {
    settingsHandlers({ ...STATE, max_teams: 5, max_agents: 10 });
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
  it("says so on its card in place of what it delivers", () => {
    const { rerender } = renderWithProviders(
      <NodeCard node={NOT_STARTED} current={false} onOpenDetails={() => {}} />,
    );

    expect(screen.getByText("ORG_CHART$TEAM_NOT_STARTED")).toBeInTheDocument();
    expect(screen.queryByText("Sells the goods")).toBeNull();

    const started = {
      ...NOT_STARTED,
      agents: [{ role: "ic", conversation_id: null, status: "idle" }],
    } as unknown as OrgNode;
    rerender(
      <NodeCard node={started} current={false} onOpenDetails={() => {}} />,
    );

    expect(screen.queryByText("ORG_CHART$TEAM_NOT_STARTED")).toBeNull();
    expect(screen.getByText("Sells the goods")).toBeInTheDocument();
  });

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

describe("an IC in hand-over mode", () => {
  it("stays one agent, with a switch between its two conversations", async () => {
    memoryHandlers();
    const handing = {
      ...NOT_STARTED,
      agents: [
        {
          role: "ic",
          conversation_id: null,
          status: "idle",
          hand_over: { conversation_id: "side-1", status: "working" },
        },
      ],
    } as unknown as OrgNode;
    const user = userEvent.setup();
    renderWithProviders(
      <AgentInspectorDrawer node={handing} onClose={() => {}} />,
    );

    // No tab of its own: the team has the agents it had.
    const agents = screen.getByRole("group", { name: "ORG_CHART$AGENTS" });
    expect(within(agents).getAllByRole("button")).toHaveLength(2);
    const modes = screen.getByRole("group", {
      name: "ORG_CHART$HAND_OVER_MODE",
    });
    const main = within(modes).getByRole("button", {
      name: "ORG_CHART$MAIN_CONVERSATION",
    });
    const mode = within(modes).getByRole("button", {
      name: /ORG_CHART\$HAND_OVER_MODE/,
    });
    expect(main).toHaveAttribute("aria-pressed", "true");
    expect(mode).toHaveTextContent("working");
    expect(screen.queryByText("ORG_CHART$HAND_OVER_MODE_HELP")).toBeNull();

    await user.click(mode);

    expect(mode).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("ORG_CHART$HAND_OVER_MODE_HELP"),
    ).toBeInTheDocument();
  });

  it("shows no switch for an IC that has no hand-over", () => {
    memoryHandlers();
    const plain = {
      ...NOT_STARTED,
      agents: [{ role: "ic", conversation_id: null, status: "idle" }],
    } as unknown as OrgNode;
    renderWithProviders(
      <AgentInspectorDrawer node={plain} onClose={() => {}} />,
    );

    expect(
      screen.queryByRole("group", { name: "ORG_CHART$HAND_OVER_MODE" }),
    ).toBeNull();
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
    });
    renderWithProviders(<SpecAndContracts node={NOT_STARTED} />);

    expect(await screen.findByText("ORG_CHART$SPEC_OPEN")).toBeInTheDocument();
    expect(screen.queryByText("ORG_CHART$SPEC_OLD_HELP")).toBeNull();
  });
});
