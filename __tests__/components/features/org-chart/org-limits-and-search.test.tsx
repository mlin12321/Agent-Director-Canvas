import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type {
  DirectorSettingsState,
  OrgNode,
  TeamMatch,
} from "#/api/director/types";
import { AgentInspectorDrawer } from "#/components/features/org-chart/agent-inspector-drawer";
import { NodeCard } from "#/components/features/org-chart/node-card";
import { NodeHoverCard } from "#/components/features/org-chart/node-hover-card";
import { OrgSettings } from "#/components/features/org-chart/org-settings";
import { TeamSearch } from "#/components/features/org-chart/team-search";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";

const STATE: DirectorSettingsState = {
  max_teams: 32,
  max_depth: 8,
  teams: 19,
  depth: 4,
  max_concurrent_runs: 10,
  allowed_profiles: [],
  resume_on_start: false,
  stall_check_minutes: 120,
  manager_check_accepted_reviews: 5,
  manager_check_ic_setbacks: 3,
};

function settingsHandlers(state: DirectorSettingsState = STATE) {
  const saved: unknown[] = [];
  let now = state;
  server.use(
    http.get("*/settings", ({ request }) =>
      new URL(request.url).pathname === "/api/director/settings"
        ? HttpResponse.json(now)
        : HttpResponse.json({ detail: "Not Found" }, { status: 404 }),
    ),
    http.patch("*/api/director/settings", async ({ request }) => {
      const change = (await request.json()) as Partial<DirectorSettingsState>;
      saved.push(change);
      now = { ...now, ...change };
      return HttpResponse.json(now);
    }),
  );
  return saved;
}

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "ORG_CHART$SETTINGS" }),
  );
  return screen.findByTestId("org-settings-modal");
}

describe("OrgSettings", () => {
  it("shows the limits beside what the org has now, and what the server runs at once", async () => {
    settingsHandlers();
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);

    const modal = await openSettings(user);

    expect(
      within(modal).getByLabelText(/ORG_CHART\$SETTINGS_MAX_TEAMS/),
    ).toHaveValue(32);
    expect(
      within(modal).getByLabelText(/ORG_CHART\$SETTINGS_MAX_DEPTH/),
    ).toHaveValue(8);
    expect(
      within(modal).getByText("ORG_CHART$SETTINGS_TEAMS_NOW"),
    ).toBeInTheDocument();
    expect(
      within(modal).getByText("ORG_CHART$SETTINGS_RUNS"),
    ).toBeInTheDocument();
  });

  it("saves both limits and closes", async () => {
    const saved = settingsHandlers();
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    const modal = await openSettings(user);

    const teams = within(modal).getByLabelText(/ORG_CHART\$SETTINGS_MAX_TEAMS/);
    await user.clear(teams);
    await user.type(teams, "12");
    await user.click(
      within(modal).getByRole("button", { name: "BUTTON$SAVE" }),
    );

    await waitFor(() =>
      expect(screen.queryByTestId("org-settings-modal")).toBeNull(),
    );
    expect(saved).toEqual([
      {
        max_teams: 12,
        max_depth: 8,
        allowed_profiles: [],
        resume_on_start: false,
        stall_check_minutes: 120,
        manager_check_accepted_reviews: 5,
        manager_check_ic_setbacks: 3,
      },
    ]);

    // The form opens again on what was saved.
    expect(
      within(await openSettings(user)).getByLabelText(
        /ORG_CHART\$SETTINGS_MAX_TEAMS/,
      ),
    ).toHaveValue(12);
  });

  it("does not save a limit below one team", async () => {
    const saved = settingsHandlers();
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    const modal = await openSettings(user);

    const teams = within(modal).getByLabelText(/ORG_CHART\$SETTINGS_MAX_TEAMS/);
    await user.clear(teams);
    await user.type(teams, "0");

    expect(
      within(modal).getByRole("button", { name: "BUTTON$SAVE" }),
    ).toBeDisabled();
    expect(saved).toEqual([]);
  });

  it("goes back to the defaults when asked to", async () => {
    settingsHandlers({ ...STATE, max_teams: 12, max_depth: 3 });
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    const modal = await openSettings(user);

    await user.click(
      within(modal).getByRole("button", { name: "ORG_CHART$SETTINGS_RESET" }),
    );

    expect(
      within(modal).getByLabelText(/ORG_CHART\$SETTINGS_MAX_TEAMS/),
    ).toHaveValue(32);
    expect(
      within(modal).getByLabelText(/ORG_CHART\$SETTINGS_MAX_DEPTH/),
    ).toHaveValue(8);
  });

  it("keeps the form open and says so when the server refuses", async () => {
    settingsHandlers();
    server.use(
      http.patch("*/api/director/settings", () =>
        HttpResponse.json({ detail: "no" }, { status: 422 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    const modal = await openSettings(user);

    await user.click(
      within(modal).getByRole("button", { name: "BUTTON$SAVE" }),
    );

    expect(await within(modal).findByRole("alert")).toHaveTextContent(
      "ORG_CHART$SETTINGS_SAVE_ERROR",
    );
  });

  it("lets the agent profiles a sub-team may run on be chosen", async () => {
    const saved = settingsHandlers({ ...STATE, allowed_profiles: ["gone"] });
    server.use(
      http.get("*/api/agent-profiles", () =>
        HttpResponse.json({
          profiles: [
            { id: "1", name: "default", agent_kind: "openhands" },
            { id: "2", name: "codex", agent_kind: "acp" },
          ],
          active_agent_profile_id: "1",
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    const modal = await openSettings(user);

    // One that was allowed and is no longer stored can still be unticked.
    expect(within(modal).getByRole("checkbox", { name: "gone" })).toBeChecked();
    await user.click(
      await within(modal).findByRole("checkbox", { name: "codex" }),
    );
    await user.click(within(modal).getByRole("checkbox", { name: "gone" }));
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
        allowed_profiles: ["codex"],
        resume_on_start: false,
        stall_check_minutes: 120,
        manager_check_accepted_reviews: 5,
        manager_check_ic_setbacks: 3,
      },
    ]);
  });

  it("offers nothing on a server without the settings", async () => {
    let asked = false;
    server.use(
      http.get("*/api/director/settings", () => {
        asked = true;
        return HttpResponse.json({ detail: "Not Found" }, { status: 404 });
      }),
    );
    renderWithProviders(<OrgSettings />);

    await waitFor(() => expect(asked).toBe(true));
    expect(screen.queryByRole("button", { name: "ORG_CHART$SETTINGS" })).toBe(
      null,
    );
  });
});

describe("TeamSearch", () => {
  const TEAMS: TeamMatch[] = [
    { id: "auth", title: "Auth team", path: "services/auth" },
    { id: "a/b c", title: "OAuth team", path: "services/auth/oauth" },
  ];

  function searchHandler() {
    const asked: string[] = [];
    server.use(
      http.get("*/api/director/org/search", ({ request }) => {
        const query = new URL(request.url).searchParams.get("q") ?? "";
        asked.push(query);
        return HttpResponse.json(query === "auth" ? TEAMS : []);
      }),
    );
    return asked;
  }

  it("lists the teams the server finds and goes to the one chosen", async () => {
    searchHandler();
    const navigate = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TeamSearch />, { navigation: { navigate } });
    const field = screen.getByRole("combobox", { name: "ORG_CHART$SEARCH" });

    await user.type(field, "auth");
    const options = await screen.findAllByRole("option");

    expect(options.map((option) => option.textContent)).toEqual([
      "Auth teamservices/auth",
      "OAuth teamservices/auth/oauth",
    ]);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(navigate).toHaveBeenCalledWith("/org/a%2Fb%20c");
    expect(field).toHaveValue("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("goes to a team that is clicked", async () => {
    searchHandler();
    const navigate = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TeamSearch />, { navigation: { navigate } });

    await user.type(
      screen.getByRole("combobox", { name: "ORG_CHART$SEARCH" }),
      "auth",
    );
    await user.click(await screen.findByRole("option", { name: /^Auth team/ }));

    expect(navigate).toHaveBeenCalledWith("/org/auth");
  });

  it("says so when no team matches, and asks nothing for an empty field", async () => {
    const asked = searchHandler();
    const user = userEvent.setup();
    renderWithProviders(<TeamSearch />);
    const field = screen.getByRole("combobox", { name: "ORG_CHART$SEARCH" });

    await user.type(field, "   ");
    expect(screen.queryByRole("listbox")).toBeNull();

    await user.type(field, "zzz");

    expect(
      await screen.findByText("ORG_CHART$SEARCH_NONE"),
    ).toBeInTheDocument();
    expect(asked).not.toContain("");
  });
});

describe("NodeCard", () => {
  const NODE: OrgNode = {
    id: "auth",
    parent_id: "root",
    title: "Auth team",
    boundary: { path: "services/auth", writable: [], readonly: [] },
    isolation: "worktree",
    worktree_path: ".",
    branch: "agents/auth",
    // A team with no agents has not started; this one has.
    agents: [
      {
        role: "ic",
        conversation_id: null,
        status: "idle",
        kind: "openhands",
        acp_server: null,
      },
    ],
    status: "idle",
    spec_summary: "",
    headline: "Token refresh",
    escalations: [],
    escalation_count: 0,
    pending_split: null,
    child_ids: [],
  } as unknown as OrgNode;

  it("says a team waits for a free run slot in place of what it is delivering", () => {
    const { rerender } = renderWithProviders(
      <NodeCard node={NODE} current={false} onOpenDetails={() => {}} />,
    );
    expect(screen.getByText("Token refresh")).toBeInTheDocument();

    rerender(
      <NodeCard
        node={{ ...NODE, waiting_to_start: true }}
        current={false}
        onOpenDetails={() => {}}
      />,
    );

    expect(screen.getByText("ORG_CHART$WAITING_TO_START")).toBeInTheDocument();
    expect(screen.queryByText("Token refresh")).toBeNull();

    // Once its IC works, it says what it delivers again.
    rerender(
      <NodeCard
        node={{ ...NODE, waiting_to_start: true, status: "working" }}
        current={false}
        onOpenDetails={() => {}}
      />,
    );

    expect(screen.getByText("Token refresh")).toBeInTheDocument();
    expect(screen.queryByText("ORG_CHART$WAITING_TO_START")).toBeNull();
  });

  it("names an external agent and the profile a team runs on in its hover card", () => {
    renderWithProviders(
      <NodeHoverCard
        node={{
          ...NODE,
          agent_profile: "codex",
          agents: [
            {
              role: "ic",
              conversation_id: "c1",
              status: "working",
              kind: "acp",
              acp_server: "codex",
            },
            {
              role: "manager",
              conversation_id: "c2",
              status: "idle",
              kind: "acp",
              acp_server: null,
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByText(
        "ORG_CHART$ROLE_IC (working · Codex), ORG_CHART$ROLE_MANAGER (idle · ORG_CHART$EXTERNAL_AGENT)",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("codex")).toBeInTheDocument();
  });

  it("says in the details how the team itself is held, over what the server says of the org", () => {
    const team = {
      ...NODE,
      agents: [
        {
          role: "ic" as const,
          conversation_id: null,
          status: "idle",
          kind: "acp" as const,
          acp_server: "claude-code",
        },
      ],
    };
    const { rerender } = renderWithProviders(
      <AgentInspectorDrawer
        node={{ ...team, boundary_enforcement: "merge" }}
        enforcement="checks"
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("ORG_CHART$ENFORCED_MERGE")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();

    rerender(
      <AgentInspectorDrawer
        node={team}
        enforcement="checks"
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("ORG_CHART$ENFORCED_CHECKS")).toBeInTheDocument();
  });
});
