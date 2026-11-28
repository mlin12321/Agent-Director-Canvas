import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type {
  DirectorOrgSettingsState,
  DirectorSettingsState,
  OrgNode,
  SessionTeam,
  TeamMatch,
} from "#/api/director/types";
import { AgentInspectorDrawer } from "#/components/features/org-chart/agent-inspector-drawer";
import { TeamCard } from "#/components/features/org-chart/team-card";
import { TeamHoverCard } from "#/components/features/org-chart/team-hover-card";
import { OrgSessionsContext } from "#/components/features/org-chart/org-sessions";
import { OrgSettings } from "#/components/features/org-chart/org-settings";
import { TeamSearch } from "#/components/features/org-chart/team-search";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";
import { atWork } from "./session-fixtures";

const STATE: DirectorSettingsState = {
  org_kind: "software",
  default_agent_type: "software-engineer",
  allowed_agent_types: [],
  max_teams: 32,
  max_depth: 8,
  teams: 19,
  depth: 4,
  max_concurrent_runs: 10,
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

const TYPES: DirectorOrgSettingsState = {
  default_agent_type: "software-engineer",
  allowed_agent_types: [],
  close_unattended_sessions: true,
  own: {},
  agent_types: [
    {
      sas_profile: null,
      members: [],
      name: "software-engineer",
      description: "Builds software",
      allowed: true,
    },
    {
      sas_profile: null,
      members: [],
      name: "researcher",
      description: "Looks into a question",
      allowed: true,
    },
  ],
};

/** What the org sets for its new teams, on a director that has an org. */
function orgTypesHandlers(
  state: DirectorOrgSettingsState = TYPES,
  rootId: string | null = "root",
) {
  const saved: unknown[] = [];
  let now = state;
  server.use(
    http.get("*/api/director/org", () =>
      HttpResponse.json({ root_id: rootId, node_count: rootId ? 1 : 0 }),
    ),
    http.get("*/api/director/org/settings", () => HttpResponse.json(now)),
    http.patch("*/api/director/org/settings", async ({ request }) => {
      const change = (await request.json()) as Record<string, never>;
      saved.push(change);
      now = { ...now, ...change, own: { ...now.own, ...change } };
      return HttpResponse.json(now);
    }),
  );
  return {
    saved,
    find: (found: DirectorOrgSettingsState) => {
      now = found;
    },
  };
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
        soft_check_in_minutes: 120,
        hard_check_in_minutes: 360,
        manager_check_accepted_reviews: 5,
        manager_check_ic_setbacks: 3,
        route_requests: true,
        session_cost_limit: 0,
        max_open_sessions: 0,
        report_compaction_chars: 24000,
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

  it("keeps what is being typed when the org gains a team meanwhile", async () => {
    settingsHandlers();
    let client: QueryClient | undefined;
    function Probe() {
      client = useQueryClient();
      return null;
    }
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <Probe />
        <OrgSettings />
      </>,
    );
    const modal = await openSettings(user);
    const teams = () =>
      within(modal).getByLabelText(/ORG_CHART\$SETTINGS_MAX_TEAMS/);
    await user.clear(teams());
    await user.type(teams(), "7");

    let asked = 0;
    server.use(
      http.get("*/api/director/settings", () => {
        asked += 1;
        return HttpResponse.json({ ...STATE, teams: STATE.teams + 1 });
      }),
    );
    await client?.invalidateQueries();
    await waitFor(() => expect(asked).toBe(1));

    expect(teams()).toHaveValue(7);
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
        HttpResponse.json(
          { detail: "The org already has more teams" },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    const modal = await openSettings(user);

    await user.click(
      within(modal).getByRole("button", { name: "BUTTON$SAVE" }),
    );

    expect(await within(modal).findByRole("alert")).toHaveTextContent(
      "The org already has more teams",
    );
  });

  it("lets the agent profiles a sub-team may run on be chosen", async () => {
    const saved = settingsHandlers({ ...STATE, allowed_profiles: ["gone"] });
    server.use(
      http.get("*/api/agent-profiles", () =>
        HttpResponse.json({
          profiles: [
            {
              id: "1",
              name: "default",
              agent_kind: "openhands",
              acp_server: null,
              model: null,
              reason: null,
              hand_over: null,
            },
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
        soft_check_in_minutes: 120,
        hard_check_in_minutes: 360,
        manager_check_accepted_reviews: 5,
        manager_check_ic_setbacks: 3,
        route_requests: true,
        session_cost_limit: 0,
        max_open_sessions: 0,
        report_compaction_chars: 24000,
      },
    ]);
  });

  it("sets only the agent types that were changed, for this org", async () => {
    const limits = settingsHandlers();
    const types = orgTypesHandlers();
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    await openSettings(user);
    const pick = await screen.findByLabelText(
      "ORG_CHART$SETTINGS_DEFAULT_AGENT_TYPE",
    );

    expect(pick).toHaveValue("software-engineer");
    expect(screen.getByText("Looks into a question")).toBeInTheDocument();
    await user.selectOptions(pick, "researcher");
    await user.click(screen.getByRole("button", { name: "BUTTON$SAVE" }));

    await waitFor(() =>
      expect(screen.queryByTestId("org-settings-modal")).toBeNull(),
    );
    expect(limits).toHaveLength(1);
    expect(types.saved).toEqual([{ default_agent_type: "researcher" }]);
  });

  it("lets the org keep the sessions automations open, which close by default", async () => {
    settingsHandlers();
    const types = orgTypesHandlers();
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    await openSettings(user);
    const closes = await screen.findByTestId("org-settings-close-unattended");

    expect(closes).toBeChecked();
    await user.click(closes);
    await user.click(screen.getByRole("button", { name: "BUTTON$SAVE" }));

    await waitFor(() =>
      expect(screen.queryByTestId("org-settings-modal")).toBeNull(),
    );
    expect(types.saved).toEqual([{ close_unattended_sessions: false }]);
  });

  it("leaves the org's agent types alone when none was changed", async () => {
    settingsHandlers();
    const types = orgTypesHandlers();
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    await openSettings(user);
    await screen.findByLabelText("ORG_CHART$SETTINGS_DEFAULT_AGENT_TYPE");

    await user.click(screen.getByRole("button", { name: "BUTTON$SAVE" }));

    await waitFor(() =>
      expect(screen.queryByTestId("org-settings-modal")).toBeNull(),
    );
    expect(types.saved).toEqual([]);
  });

  it("shows an agent type the server gained since the page was loaded", async () => {
    settingsHandlers();
    const types = orgTypesHandlers();
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    await screen.findByRole("button", { name: "ORG_CHART$SETTINGS" });
    types.find({
      ...TYPES,
      agent_types: [
        ...TYPES.agent_types,
        {
          sas_profile: null,
          members: [],
          name: "writer",
          description: "Writes the docs",
          allowed: true,
        },
      ],
    });

    await openSettings(user);

    expect(
      await screen.findByRole("checkbox", { name: /writer/ }),
    ).not.toBeChecked();
  });

  it("says why the director refused the agent types, and keeps them", async () => {
    settingsHandlers();
    orgTypesHandlers();
    server.use(
      http.patch("*/api/director/org/settings", () =>
        HttpResponse.json(
          { detail: "The default agent type is not allowed" },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    await openSettings(user);

    await user.click(
      await screen.findByRole("checkbox", { name: /researcher/ }),
    );
    await user.click(screen.getByRole("button", { name: "BUTTON$SAVE" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The default agent type is not allowed",
    );
    expect(screen.getByRole("checkbox", { name: /researcher/ })).toBeChecked();
  });

  it("offers no agent types to set where there is no org", async () => {
    settingsHandlers();
    let asked = false;
    orgTypesHandlers(TYPES, null);
    server.use(
      http.get("*/api/director/org/settings", () => {
        asked = true;
        return HttpResponse.json(TYPES);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);

    await waitFor(() => expect(asked).toBe(true));
    const modal = await openSettings(user);

    expect(
      within(modal).queryByLabelText("ORG_CHART$SETTINGS_DEFAULT_AGENT_TYPE"),
    ).toBeNull();
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

describe("TeamCard", () => {
  const NODE: OrgNode = {
    agent_type: "software-engineer",
    id: "auth",
    parent_id: "root",
    title: "Auth team",
    boundary: { path: "services/auth", writable: [], readonly: [] },
    isolation: "worktree",
    summary: "",
    headline: "Token refresh",
    leftover_documents: [],
    agent_profile: null,
    child_ids: [],
  };
  const IC: SessionTeam["agents"][number] = {
    role: "ic",
    conversation_id: null,
    status: "idle",
    kind: "openhands",
    acp_server: null,
    model: null,
    reason: null,
    hand_over: null,
  };

  /** The team beside a session that has `work` at it. */
  function atTeam(work: Partial<SessionTeam>, children: React.ReactNode) {
    return (
      <OrgSessionsContext.Provider
        value={atWork(NODE, { agents: [IC], ...work })}
      >
        {children}
      </OrgSessionsContext.Provider>
    );
  }

  it("says a team waits for a free run slot in place of what it is delivering", () => {
    const authCard = (
      <TeamCard node={NODE} current={false} onOpenDetails={() => {}} />
    );
    const { rerender } = renderWithProviders(atTeam({}, authCard));
    expect(screen.getByText("Token refresh")).toBeInTheDocument();

    rerender(atTeam({ waiting_to_start: true }, authCard));

    expect(screen.getByText("ORG_CHART$WAITING_TO_START")).toBeInTheDocument();
    expect(screen.queryByText("Token refresh")).toBeNull();

    // Once its IC works, it says what it delivers again.
    rerender(atTeam({ waiting_to_start: true, status: "working" }, authCard));

    expect(screen.getByText("Token refresh")).toBeInTheDocument();
    expect(screen.queryByText("ORG_CHART$WAITING_TO_START")).toBeNull();
  });

  it("names an external agent and the profile a team runs on in its hover card", () => {
    renderWithProviders(
      atTeam(
        {
          agent_profile: "codex",
          agents: [
            {
              role: "ic",
              conversation_id: "c1",
              status: "working",
              kind: "acp",
              acp_server: "codex",
              model: null,
              reason: null,
              hand_over: null,
            },
            {
              role: "manager",
              conversation_id: "c2",
              status: "idle",
              kind: "acp",
              acp_server: null,
              model: null,
              reason: null,
              hand_over: null,
            },
          ],
        },
        <TeamHoverCard node={{ ...NODE, agent_profile: "codex" }} />,
      ),
    );

    expect(
      screen.getByText(
        "ORG_CHART$ROLE_IC (working · Codex), ORG_CHART$ROLE_MANAGER (idle · ORG_CHART$EXTERNAL_AGENT)",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("codex")).toBeInTheDocument();
  });

  it("names the type of a team that has one in its hover card", () => {
    renderWithProviders(
      atTeam(
        {},
        <TeamHoverCard node={{ ...NODE, agent_type: "researcher" }} />,
      ),
    );
    expect(screen.getByText("researcher")).toBeInTheDocument();
  });

  it("says in the details why an agent failed", () => {
    const agents = [
      {
        ...IC,
        conversation_id: "c1",
        status: "blocked",
        reason: "LLMAuthenticationError: the key was refused",
      },
    ];
    renderWithProviders(
      atTeam(
        { agents },
        <AgentInspectorDrawer
          node={NODE}
          enforcement="checks"
          onClose={() => {}}
        />,
      ),
    );

    expect(
      screen.getByText("LLMAuthenticationError: the key was refused"),
    ).toHaveAttribute("role", "status");
  });

  it("says in the details how the team is held where a session's IC ran, over what the server says of the org", () => {
    const agents = [{ ...IC, kind: "acp" as const, acp_server: "claude-code" }];
    const details = (
      <AgentInspectorDrawer
        node={NODE}
        enforcement="checks"
        onClose={() => {}}
      />
    );
    const { rerender } = renderWithProviders(
      atTeam({ agents, boundary_enforcement: "merge" }, details),
    );

    expect(screen.getByText("ORG_CHART$ENFORCED_MERGE")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();

    // Until an IC ran here, it is what the server says of the org.
    rerender(atTeam({ agents }, details));

    expect(screen.getByText("ORG_CHART$ENFORCED_CHECKS")).toBeInTheDocument();
  });
});
