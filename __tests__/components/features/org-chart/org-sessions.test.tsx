import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionRequestOf } from "#/api/director/session-from-chat";
import { joinFromChat } from "#/api/director/join-from-chat";
import type {
  ConversationPlace,
  HistoryEvent,
  OpenEscalation,
  OrgNode,
  Review,
  Session,
  SessionTeam,
} from "#/api/director/types";
import { AgentInspectorDrawer } from "#/components/features/org-chart/agent-inspector-drawer";
import { ConversationLinks } from "#/components/features/org-chart/conversation-links";
import { EscalationsPanel } from "#/components/features/org-chart/escalations-panel";
import { MessageToTeam } from "#/components/features/org-chart/message-to-team";
import { TeamCard } from "#/components/features/org-chart/team-card";
import { OrgHistoryPanel } from "#/components/features/org-chart/org-history";
import {
  OrgSessionsContext,
  OrgSessionsPanel,
} from "#/components/features/org-chart/org-sessions";
import { SubChatHost } from "#/components/features/org-chart/sub-chat-host";
import { isAgentOnlyConversation } from "#/utils/conversation-tag-flags";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";
import { placeAt, leadPlaceAt, sessionOf } from "./session-fixtures";

function team(
  id: string,
  title: string,
  path: string,
  rest: Partial<OrgNode> = {},
): OrgNode {
  return {
    id,
    parent_id: id === "root" ? null : "root",
    title,
    boundary: { path, writable: ["**"], readonly: [] },
    isolation: "shared",
    spec_summary: "",
    old_specs: [],
    headline: "",
    agent_profile: null,
    child_ids: [],
    ...rest,
  };
}

// The chat stack needs a live agent server; a sub-chat is known here by the
// conversation it is opened on.
vi.mock("#/components/features/org-chart/agent-conversation", () => ({
  AgentConversation: ({ conversationId }: { conversationId: string }) => (
    <div data-testid="agent-conversation">
      {conversationId}
      <ConversationLinks conversationId={conversationId} />
    </div>
  ),
}));

// The changes need a checkout; what matters here is whose they are.
vi.mock("#/components/features/org-chart/team-changes", () => ({
  TeamChanges: ({ node }: { node: OrgNode }) => (
    <div data-testid="team-changes">{node.id}</div>
  ),
}));

const ROOT = team("root", "Shop", "", {
  child_ids: ["services.api", "apps.web"],
});
const API = team("services.api", "API", "services/api");
const NODES = new Map([ROOT, API].map((node) => [node.id, node]));

// What the session has at the API team. It is no node of the tree.
const REFUNDS: SessionTeam = placeAt(
  { ...API, isolation: "worktree" },
  "s1a2b3c",
  {
    worktree_path: "/work",
    branch: "",
    agents: [
      {
        role: "ic",
        conversation_id: "c2",
        status: "idle",
        kind: "openhands",
        acp_server: null,
        model: null,
        reason: null,
        hand_over: null,
      },
    ],
  },
);

const REVIEW: Review = {
  state: "pending",
  round: 1,
  summary: "",
  description: "",
  automated_ran: false,
  automated: [],
  findings: [],
  at: "2026-11-01T11:00:00+00:00",
};

const SESSION: Session = {
  id: "s1a2b3c",
  title: "Refunds",
  team_id: API.id,
  team: "API",
  above_id: ROOT.id,
  request: "Add refunds.",
  opened_at: "2026-11-01T10:00:00+00:00",
  branch: "main",
  usage: { input_tokens: 0, output_tokens: 0, cost: 0, unpriced_tokens: 0 },
  cost_allowance: 0,
  status: "working",
  review: null,
  conversation_id: "c2",
  teams: [REFUNDS],
};

const ic = (conversationId: string | null, status = "idle") => ({
  role: "ic" as const,
  conversation_id: conversationId,
  status,
  kind: "openhands" as const,
  acp_server: null,
  model: null,
  reason: null,
  hand_over: null,
});

// The session opened at the top team has a place at the API team too, and
// is reviewed from the top team itself.
const RELEASE = sessionOf("r9", "Release", [
  placeAt(ROOT, "r9", { agents: [ic("top")], status: "working" }),
  placeAt(API, "r9", { agents: [ic("c1")], status: "working" }),
  leadPlaceAt(ROOT, "r9", { agents: [ic("review-r9")] }),
]);
// Refunds was opened at the API team: the IC of the top team reviews it.
const REFUNDS_REVIEWED: Session = {
  ...SESSION,
  teams: [
    REFUNDS,
    leadPlaceAt(ROOT, SESSION.id, { agents: [ic("review-s1")] }),
  ],
};

function memoryHandlers() {
  server.use(
    http.get("*/api/director/org/nodes/:id/memory", () =>
      HttpResponse.json({
        specs: [],
        reports: [],
        former_teams: [],
        history: [],
      }),
    ),
    http.get("*/api/director/org/nodes/:id/messages", () =>
      HttpResponse.json([]),
    ),
  );
}

function drawer(node: OrgNode, sessions: Session[]) {
  return renderWithProviders(
    <OrgSessionsContext.Provider value={sessions}>
      <AgentInspectorDrawer node={node} onClose={() => {}} />
    </OrgSessionsContext.Provider>,
  );
}

function opened(session: Session) {
  return { session, conversation_id: "c2", chosen_by: "path", reason: "" };
}

// A section remembers how it was left; no test starts from another's.
afterEach(() => {
  localStorage.clear();
});

describe("TeamCard", () => {
  it("says how many sessions are open at a team, which are no sub-teams of it", () => {
    renderWithProviders(
      <OrgSessionsContext.Provider value={[SESSION]}>
        <TeamCard node={ROOT} current={false} onOpenDetails={() => {}} />
        <TeamCard node={API} current={false} onOpenDetails={() => {}} />
      </OrgSessionsContext.Provider>,
    );

    const root = screen.getByTestId("org-node-root");
    expect(root).toHaveTextContent("ORG_CHART$SUB_TEAMS");
    expect(root).not.toHaveTextContent("ORG_CHART$SESSIONS_COUNT");
    const api = screen.getByTestId("org-node-services.api");
    expect(api).toHaveTextContent("ORG_CHART$SESSIONS_COUNT");
    expect(api).not.toHaveTextContent("ORG_CHART$SUB_TEAMS");
    expect(screen.queryByTestId("org-session-mark")).toBeNull();
  });

  it("shows a dot for each line of work that goes on at a team, and one idle dot only when none does", () => {
    const at = (
      id: string,
      status: Session["status"],
      review: "pending" | "accepted" | null = null,
    ): Session => ({
      ...SESSION,
      id,
      status,
      teams: [
        {
          ...REFUNDS,
          id: `${API.id}@${id}`,
          session: id,
          status,
          review: review && { ...REVIEW, state: review },
        },
      ],
    });
    const merged = (id: string) => at(id, "done", "accepted");
    const dots = (sessions: Session[]) => {
      const { unmount } = renderWithProviders(
        <OrgSessionsContext.Provider value={sessions}>
          <TeamCard node={API} current={false} onOpenDetails={() => {}} />
        </OrgSessionsContext.Provider>,
      );
      const found = within(
        screen.getByTestId(`org-node-${API.id}`),
      ).getByTestId("org-status-dots");
      const seen = {
        counted: found.hasAttribute("data-counted"),
        name: found.getAttribute("aria-label"),
        states: [...found.querySelectorAll("[data-status]")].map(
          (dot) => `${dot.getAttribute("data-status")}${dot.textContent}`,
        ),
      };
      unmount();
      return seen;
    };

    // Nothing goes on: one idle dot, without a number, however many
    // sessions are kept open after their work was merged or while they rest.
    expect(dots([]).states).toEqual(["idle"]);
    expect(dots([merged("s1"), merged("s2"), at("s3", "idle")])).toEqual({
      counted: false,
      name: "1 ORG_CHART$STATUS_IDLE",
      states: ["idle"],
    });
    // A session at work is shown, and the ones that rest beside it are not.
    expect(dots([at("s1", "working"), merged("s2")]).states).toEqual([
      "working",
    ]);
    // One that is done and waits for its review still has its dot.
    expect(dots([at("s1", "done", "pending"), merged("s2")]).states).toEqual([
      "done",
    ]);
    // The dots are the sessions' alone: the IC that reviews a session from
    // here does no work of the team's.
    const reviewed: Session = {
      ...at("s3", "done", "pending"),
      team_id: "services.api.db",
      teams: [leadPlaceAt(API, "s3", { status: "working" })],
    };
    expect(dots([at("s1", "working"), at("s2", "blocked"), reviewed])).toEqual({
      counted: false,
      name: "1 ORG_CHART$STATUS_BLOCKED, 1 ORG_CHART$STATUS_WORKING",
      states: ["working", "blocked"],
    });
    // More than there is room for are counted by state; idle is never one.
    expect(
      dots([
        at("s1", "working"),
        at("s2", "working"),
        at("s3", "working"),
        at("s4", "blocked"),
        at("s5", "done", "pending"),
        merged("s6"),
        at("s7", "idle"),
      ]),
    ).toEqual({
      counted: true,
      name: "1 ORG_CHART$STATUS_BLOCKED, 3 ORG_CHART$STATUS_WORKING, 1 ORG_CHART$STATUS_DONE",
      states: ["blocked1", "working3", "done1"],
    });
  });
});

describe("AgentInspectorDrawer", () => {
  it("lists the conversations at a team with the session of each, marks the ones the human started there, and opens one only when it is chosen", async () => {
    memoryHandlers();
    const user = userEvent.setup();
    drawer(API, [RELEASE, REFUNDS_REVIEWED]);

    const rows = within(
      screen.getByTestId("org-node-conversations"),
    ).getAllByRole("button");
    expect(rows.map((row) => row.textContent)).toEqual([
      "ORG_CHART$ROLE_IC · Releaseidle",
      "ORG_CHART$ROLE_IC · Refundsidle",
    ]);
    const [release, refunds] = rows;
    // Release came down from the top team; Refunds the human opened here.
    expect(release).not.toHaveAttribute("data-mine");
    // What the org runs by itself stands back; the human's own is plain.
    expect(release).toHaveClass("bg-tertiary", "text-text-secondary");
    expect(refunds).toHaveAttribute("data-mine");
    expect(refunds).toHaveClass("bg-background", "text-contrast");
    expect(refunds).not.toHaveClass("bg-tertiary");
    expect(screen.queryByTestId("agent-conversation")).toBeNull();
    expect(screen.getByText("ORG_CHART$CONVERSATION_PICK")).toBeInTheDocument();

    await user.click(refunds);
    expect(refunds).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByTestId("agent-conversation")).toHaveTextContent(
      "c2",
    );
    await user.click(release);
    expect(refunds).toHaveAttribute("aria-pressed", "false");
    expect(release).toHaveAttribute("aria-pressed", "true");
  });

  it("says which model an agent runs on, where the director knows it", () => {
    memoryHandlers();
    const onModel = sessionOf("m1", "Models", [
      placeAt(API, "m1", {
        agents: [{ ...ic("c9"), model: "openai/gpt-5.2" }],
      }),
      leadPlaceAt(ROOT, "m1", { agents: [ic("review-m1")] }),
    ]);
    drawer(API, [onModel, REFUNDS_REVIEWED]);

    const rows = within(
      screen.getByTestId("org-node-conversations"),
    ).getAllByRole("button");
    expect(within(rows[0]).getByTestId("org-agent-model")).toHaveTextContent(
      "openai/gpt-5.2",
    );
    // Refunds' agent has none: nothing is shown for it.
    expect(within(rows[1]).queryByTestId("org-agent-model")).toBeNull();
  });

  it("shows what waits of a session's work for each of its two Division Leads, with what was decided, and lists both", () => {
    memoryHandlers();
    const { unmount } = drawer(ROOT, [
      {
        ...SESSION,
        teams: [
          REFUNDS,
          leadPlaceAt(ROOT, SESSION.id, {
            agents: [
              ic("review-s1"),
              { ...ic("settle-s1"), role: "manager" as const },
            ],
            merge: {
              seq: 3,
              items: [
                { kind: "code", key: "services/api/routes.ts", gate: "ic" },
                {
                  kind: "spec",
                  key: "services/api",
                  gate: "ic",
                  session: "# Refunds",
                  org: "# Orders",
                },
                {
                  kind: "team",
                  key: "services.api.jobs",
                  gate: "manager",
                  title: "Jobs",
                  session: "services/api/jobs, under services.api",
                  org: "services/api/workers, under services.api",
                  take: "session",
                  under: ROOT.id,
                  named: "Refund jobs",
                },
                {
                  kind: "contracts",
                  key: "services",
                  gate: "manager",
                  session: "Refunds go through Jobs.",
                  org: "Orders go through Jobs.",
                  take: null,
                },
              ],
            },
          }),
        ],
      },
    ]);

    const block = screen.getByTestId(`merge-${SESSION.id}`);
    expect(block).toHaveTextContent("Refunds");
    expect(block).toHaveTextContent("ORG_CHART$MERGE_FOR_IC");
    expect(block).toHaveTextContent("ORG_CHART$MERGE_FOR_MANAGER");
    // Its code is not in yet, and nothing earlier is in its way.
    expect(block).not.toHaveTextContent("ORG_CHART$MERGE_CODE_IN");
    expect(block).not.toHaveTextContent("ORG_CHART$MERGE_QUEUED");
    const [file, spec, team, contracts] =
      within(block).getAllByRole("listitem");
    expect(file).toHaveTextContent("ORG_CHART$MERGE_FILE");
    expect(file).not.toHaveTextContent("ORG_CHART$MERGE_UNDECIDED");
    expect(spec).toHaveTextContent("ORG_CHART$MERGE_SPEC");
    expect(team).toHaveTextContent("Jobs");
    expect(team).toHaveTextContent("ORG_CHART$MERGE_TAKE_SESSION");
    expect(team).toHaveTextContent("ORG_CHART$MERGE_PLACED");
    expect(team).toHaveTextContent("ORG_CHART$MERGE_NAMED");
    expect(contracts).toHaveTextContent("ORG_CHART$MERGE_CONTRACTS");
    expect(contracts).toHaveTextContent("ORG_CHART$MERGE_UNDECIDED");
    expect(
      within(screen.getByTestId("org-node-conversations"))
        .getAllByRole("button")
        .map((row) => row.textContent),
    ).toEqual([
      "ORG_CHART$DIVISION_LEAD_IC · Refundsidle",
      "ORG_CHART$DIVISION_LEAD_MANAGER · Refundsidle",
    ]);
    unmount();

    // Nothing is shown when nothing of the session's work is on its way.
    drawer(ROOT, [REFUNDS_REVIEWED]);
    expect(screen.queryByTestId(`merge-${SESSION.id}`)).toBeNull();
  });

  it("shows where a team would go whose team above is gone, and that the code is in while the rest waits", () => {
    memoryHandlers();
    drawer(ROOT, [
      {
        ...SESSION,
        teams: [
          REFUNDS,
          leadPlaceAt(ROOT, SESSION.id, {
            merge: {
              seq: 1,
              code_landed: true,
              items: [
                {
                  kind: "team",
                  key: "services.api.jobs",
                  gate: "manager",
                  title: "Jobs",
                  session: "services/api/jobs, under services.api",
                  org: "no such team",
                  moved_to: ROOT.id,
                },
              ],
            },
          }),
        ],
      },
    ]);

    const block = screen.getByTestId(`merge-${SESSION.id}`);
    expect(block).toHaveTextContent("ORG_CHART$MERGE_CODE_IN");
    const team = within(block).getByRole("listitem");
    expect(team).toHaveTextContent("Jobs");
    expect(team).toHaveTextContent("ORG_CHART$MERGE_MOVED");
    expect(team).toHaveTextContent("ORG_CHART$MERGE_UNDECIDED");
  });

  it("says when a session's teams and contracts wait behind an earlier session", () => {
    memoryHandlers();
    drawer(ROOT, [
      {
        ...SESSION,
        teams: [
          REFUNDS,
          leadPlaceAt(ROOT, SESSION.id, {
            merge: { seq: 2, code_landed: true, org_queued: true },
          }),
        ],
      },
    ]);

    const block = screen.getByTestId(`merge-${SESSION.id}`);
    expect(block).toHaveTextContent("ORG_CHART$MERGE_QUEUED");
    expect(within(block).queryByRole("listitem")).toBeNull();
  });

  it("names the IC that reviews a session from a team as its Division Lead IC, which the human did not start", async () => {
    memoryHandlers();
    const user = userEvent.setup();
    drawer(ROOT, [RELEASE, REFUNDS_REVIEWED]);

    const rows = within(
      screen.getByTestId("org-node-conversations"),
    ).getAllByRole("button");
    expect(rows.map((row) => row.textContent)).toEqual([
      "ORG_CHART$ROLE_IC · Releaseidle",
      "ORG_CHART$DIVISION_LEAD_IC · Releaseidle",
      "ORG_CHART$DIVISION_LEAD_IC · Refundsidle",
    ]);
    const [top, , lead] = rows;
    // The session opened at the top team is the human's; a Division Lead is not.
    expect(top).toHaveAttribute("data-mine");
    expect(lead).not.toHaveAttribute("data-mine");

    await user.click(lead);
    expect(await screen.findByTestId("agent-conversation")).toHaveTextContent(
      "review-s1",
    );
  });

  it("says under each session what it has at the team: why it is stopped, its review, and starting it again", () => {
    memoryHandlers();
    const stopped: Session = {
      ...RELEASE,
      teams: RELEASE.teams.map((place) =>
        place.team_id === API.id
          ? {
              ...place,
              status: "blocked",
              stopped: {
                at: "2026-11-01T11:00:00+00:00",
                reason: "Two hours on one schema.",
                running: [],
              },
            }
          : place,
      ),
    };
    const lost: Session = {
      ...SESSION,
      teams: [
        {
          ...REFUNDS,
          status: "working",
          review: REVIEW,
          agents: [ic(null, "lost")],
        },
      ],
    };
    // A session that rests here has nothing to say.
    const resting = sessionOf("q7", "Search", [placeAt(API, "q7")]);
    drawer(API, [stopped, lost, resting]);

    const release = screen.getByTestId("org-session-work-r9");
    expect(
      within(release).getByRole("heading", { name: "Release" }),
    ).toBeInTheDocument();
    expect(within(release).getByRole("status")).toHaveTextContent(
      "ORG_CHART$STOPPED_REASON",
    );
    expect(within(release).queryByTestId("org-start-again")).toBeNull();
    const refunds = screen.getByTestId("org-session-work-s1a2b3c");
    expect(
      within(refunds).getByRole("heading", { name: "Refunds" }),
    ).toBeInTheDocument();
    expect(
      within(refunds).getByRole("region", { name: "ORG_CHART$REVIEW" }),
    ).toBeInTheDocument();
    expect(within(refunds).getByTestId("org-start-again")).toBeInTheDocument();
    expect(screen.queryByTestId("org-session-work-q7")).toBeNull();
  });

  it("shows the changes of the session whose conversation is open, and offers none where no session works", async () => {
    memoryHandlers();
    const user = userEvent.setup();
    const { unmount } = drawer(API, [RELEASE, REFUNDS_REVIEWED]);

    // With no conversation open, those of the first session here.
    await user.click(screen.getByTestId("org-team-changes-tab"));
    expect(await screen.findByTestId("team-changes")).toHaveTextContent(
      /^services\.api@r9$/,
    );

    // Choosing a conversation puts the changes away; asked for again, they
    // are those of that conversation's session.
    await user.click(
      screen.getByRole("button", { name: /ORG_CHART\$ROLE_IC · Refunds/ }),
    );
    await user.click(screen.getByTestId("org-team-changes-tab"));
    expect(await screen.findByTestId("team-changes")).toHaveTextContent(
      /^services\.api@s1a2b3c$/,
    );
    unmount();

    // Refunds is only reviewed from the top team: nothing is changed there.
    drawer(ROOT, [REFUNDS_REVIEWED]);
    expect(
      within(screen.getByTestId("org-node-conversations")).getByRole("button"),
    ).toHaveTextContent("ORG_CHART$DIVISION_LEAD_IC · Refunds");
    expect(screen.queryByTestId("org-team-changes-tab")).toBeNull();
  });
});

describe("OrgSessionsPanel", () => {
  it("lists the open sessions, links each to its conversation and closes one only after it is confirmed", async () => {
    const closed: string[] = [];
    server.use(
      http.delete("*/api/director/org/sessions/:id", ({ params }) => {
        closed.push(String(params.id));
        return HttpResponse.json({}, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <OrgSessionsPanel startsOpen sessions={[SESSION]} nodes={NODES} />,
    );

    const row = screen.getByTestId("org-session-s1a2b3c");
    expect(within(row).getByRole("link", { name: "Refunds" })).toHaveAttribute(
      "href",
      "/conversations/c2",
    );
    expect(within(row).getByRole("link", { name: "API" })).toHaveAttribute(
      "href",
      "/org/services.api",
    );
    expect(row).toHaveTextContent("ORG_CHART$SESSION_REVIEWED_BY");

    await user.click(
      within(row).getByRole("button", { name: "ORG_CHART$SESSION_CLOSE" }),
    );
    expect(row).toHaveTextContent("ORG_CHART$SESSION_CLOSE_CONFIRM");
    await user.click(
      within(row).getByRole("button", { name: "BUTTON$CANCEL" }),
    );
    expect(row).not.toHaveTextContent("ORG_CHART$SESSION_CLOSE_CONFIRM");
    expect(closed).toEqual([]);

    await user.click(
      within(row).getByRole("button", { name: "ORG_CHART$SESSION_CLOSE" }),
    );
    await user.click(
      within(row).getByRole("button", { name: "ORG_CHART$SESSION_CLOSE_YES" }),
    );
    await waitFor(() => expect(closed).toEqual(["s1a2b3c"]));

    // The list is the stream's: it is empty once the server says so.
    rerender(<OrgSessionsPanel startsOpen sessions={[]} nodes={NODES} />);
    expect(screen.getByText("ORG_CHART$SESSIONS_EMPTY")).toBeInTheDocument();
  });

  it("says why a session could not be closed", async () => {
    server.use(
      http.delete("*/api/director/org/sessions/:id", () =>
        HttpResponse.json(
          { detail: "No session 's1a2b3c' is open" },
          { status: 404 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <OrgSessionsPanel startsOpen sessions={[SESSION]} nodes={NODES} />,
    );
    const row = screen.getByTestId("org-session-s1a2b3c");
    await user.click(
      within(row).getByRole("button", { name: "ORG_CHART$SESSION_CLOSE" }),
    );
    await user.click(
      within(row).getByRole("button", { name: "ORG_CHART$SESSION_CLOSE_YES" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No session 's1a2b3c' is open",
    );
  });

  it("shows what each session has used, against its limit where it has one, and the total", () => {
    const limited: Session = {
      ...SESSION,
      usage: {
        input_tokens: 9000,
        output_tokens: 1000,
        cost: 1.5,
        unpriced_tokens: 0,
      },
      cost_allowance: 5,
    };
    const free: Session = {
      ...SESSION,
      id: "s2",
      usage: {
        input_tokens: 400,
        output_tokens: 100,
        cost: 0,
        unpriced_tokens: 500,
      },
    };
    const unused: Session = { ...SESSION, id: "s3" };
    renderWithProviders(
      <OrgSessionsPanel
        startsOpen
        sessions={[limited, free, unused]}
        nodes={NODES}
      />,
    );

    const first = screen.getByTestId("org-session-use-s1a2b3c");
    expect(first).toHaveTextContent("ORG_CHART$SESSION_COST_OF");
    expect(first).toHaveTextContent("ORG_CHART$SESSIONS_USE");
    expect(screen.queryByTestId("org-session-unpriced-s1a2b3c")).toBeNull();
    // Tokens of a model without a price are in no cost, and are said apart.
    const second = screen.getByTestId("org-session-use-s2");
    expect(second).toHaveTextContent("$0.00");
    expect(screen.getByTestId("org-session-unpriced-s2")).toHaveTextContent(
      "ORG_CHART$SESSION_UNPRICED",
    );
    expect(screen.queryByTestId("org-session-use-s3")).toBeNull();
    expect(screen.getByTestId("org-sessions-use")).toHaveTextContent("$1.50");
  });

  it("is closed until it is opened, and says how many sessions and what they cost while closed", async () => {
    const used: Session = {
      ...SESSION,
      usage: {
        input_tokens: 9000,
        output_tokens: 1000,
        cost: 1.5,
        unpriced_tokens: 0,
      },
    };
    const user = userEvent.setup();
    renderWithProviders(<OrgSessionsPanel sessions={[used]} nodes={NODES} />);

    const toggle = screen.getByTestId("org-sessions-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("1");
    expect(screen.getByTestId("org-sessions-use")).toHaveTextContent("$1.50");
    expect(screen.queryByTestId("org-session-s1a2b3c")).toBeNull();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("org-session-s1a2b3c")).toBeInTheDocument();
  });

  it("shows no total while nothing was used", () => {
    renderWithProviders(
      <OrgSessionsPanel startsOpen sessions={[SESSION]} nodes={NODES} />,
    );

    expect(screen.queryByTestId("org-sessions-use")).toBeNull();
  });
});

describe("EscalationsPanel with sessions", () => {
  it("answers what a team raised in a session to that session", async () => {
    const answered: string[] = [];
    server.use(
      http.post(
        "*/api/director/org/sessions/:sid/teams/:team/escalations/:eid/answer",
        async ({ request, params }) => {
          const body = (await request.json()) as { answer: string };
          answered.push(
            `${params.sid} ${params.team} ${params.eid} ${body.answer}`,
          );
          return HttpResponse.json(REFUNDS);
        },
      ),
    );
    const waiting: OpenEscalation = {
      node_id: API.id,
      session_id: SESSION.id,
      session: "Refunds",
      escalation: {
        id: "partial",
        kind: "design_decision",
        title: "Refund partial orders?",
        detail: "",
        raised_at: "2026-11-01T10:00:00+00:00",
        raised_by: "ic",
        held_by: null,
        handoffs: [],
      },
      path: [
        { id: "root", title: "Shop" },
        { id: API.id, title: "API" },
      ],
    };
    const user = userEvent.setup();
    renderWithProviders(<EscalationsPanel escalations={[waiting]} />);

    expect(screen.getByTestId("org-session-mark")).toHaveTextContent("Refunds");
    // Escalations are open from the start.
    expect(screen.getByTestId("org-escalations-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await user.type(screen.getByRole("textbox"), "Yes.");
    await user.click(
      screen.getByRole("button", {
        name: "ORG_CHART$ESCALATION_ANSWER_SUBMIT",
      }),
    );

    await waitFor(() =>
      expect(answered).toEqual(["s1a2b3c services.api partial Yes."]),
    );
  });
});

describe("conversations of agents in the chat window", () => {
  const place = (
    conversationId: string,
    links: ConversationPlace["links"],
  ): ConversationPlace => ({
    conversation_id: conversationId,
    node_id: "root",
    team: "Shop",
    role: "ic",
    session_id: "",
    session: "",
    human_joined: false,
    links,
  });
  const link = (
    conversationId: string,
    relation: ConversationPlace["links"][number]["relation"],
    teamTitle: string,
    session = "",
  ): ConversationPlace["links"][number] => ({
    conversation_id: conversationId,
    relation,
    node_id: "x",
    team: teamTitle,
    role: "ic",
    session_id: session ? "s1a2b3c" : "",
    session,
    status: "idle",
  });

  it("opens a linked conversation as a sub-chat, another from there, and goes back along the path", async () => {
    const places: Record<string, ConversationPlace> = {
      top: place("top", [
        link("api", "below", "API"),
        link("c2", "below", "API", "Refunds"),
      ]),
      api: place("api", [
        link("top", "above", "Shop"),
        link("db", "below", "DB"),
      ]),
      db: place("db", [link("api", "above", "API")]),
    };
    server.use(
      http.get("*/api/director/org/conversations/:id", ({ params }) => {
        const found = places[String(params.id)];
        return found
          ? HttpResponse.json(found)
          : HttpResponse.json({ detail: "x" }, { status: 404 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <SubChatHost>
        <div data-testid="main-chat">
          <ConversationLinks conversationId="top" />
        </div>
      </SubChatHost>,
    );

    const links = await screen.findByTestId("conversation-links");
    expect(links).toHaveTextContent(
      "ORG_CHART$LINK_BELOWAPI ORG_CHART$ROLE_ICAPI ORG_CHART$ROLE_IC · Refunds",
    );
    await user.click(
      within(links).getByRole("button", { name: "API ORG_CHART$ROLE_IC" }),
    );

    // The sub-chat takes the window; the conversation it was opened from
    // is put away, since only one is live at a time.
    expect(screen.getByTestId("agent-conversation")).toHaveTextContent("api");
    expect(screen.queryByTestId("main-chat")).toBeNull();
    expect(
      screen.getByRole("link", { name: "ORG_CHART$SUB_CHAT_OPEN_FULL" }),
    ).toHaveAttribute("href", "/conversations/api");

    await user.click(
      await screen.findByRole("button", { name: "DB ORG_CHART$ROLE_IC" }),
    );
    expect(screen.getByTestId("agent-conversation")).toHaveTextContent("db");
    const path = screen.getByRole("navigation", {
      name: "ORG_CHART$SUB_CHAT_PATH",
    });
    expect(path).toHaveTextContent(
      "ORG_CHART$SUB_CHAT_ROOTAPI ORG_CHART$ROLE_ICDB ORG_CHART$ROLE_IC",
    );

    // A step of the path goes back to it and drops what came after.
    await user.click(
      within(path).getByRole("button", { name: "API ORG_CHART$ROLE_IC" }),
    );
    expect(screen.getByTestId("agent-conversation")).toHaveTextContent("api");
    expect(path).not.toHaveTextContent("DB");

    await user.click(
      within(path).getByRole("button", { name: "ORG_CHART$SUB_CHAT_ROOT" }),
    );
    expect(screen.getByTestId("main-chat")).toBeInTheDocument();
    expect(screen.queryByTestId("sub-chat")).toBeNull();
  });

  it("shows no links for a conversation that is no agent's, or where no sub-chat can be opened", async () => {
    let asked = 0;
    server.use(
      http.get("*/api/director/org/conversations/:id", () => {
        asked += 1;
        return HttpResponse.json({ detail: "x" }, { status: 404 });
      }),
    );
    const { unmount } = renderWithProviders(
      <SubChatHost>
        <ConversationLinks conversationId="plain" />
      </SubChatHost>,
    );
    await waitFor(() => expect(asked).toBe(1));
    expect(screen.queryByTestId("conversation-links")).toBeNull();
    unmount();

    renderWithProviders(<ConversationLinks conversationId="top" />);
    expect(screen.queryByTestId("conversation-links")).toBeNull();
    expect(asked).toBe(1);
  });

  it("lists an agent's conversation with the human's own once the human has written in it", async () => {
    const joined: string[] = [];
    server.use(
      http.post("*/api/director/org/conversations/:id/joined", ({ params }) => {
        joined.push(String(params.id));
        return HttpResponse.json(place(String(params.id), []));
      }),
    );
    const agents = { startedby: "director" };
    const both = { startedby: "director", humanjoined: "true" };

    expect(isAgentOnlyConversation(agents)).toBe(true);
    expect(isAgentOnlyConversation(both)).toBe(false);
    expect(isAgentOnlyConversation({})).toBe(false);
    // Only a conversation the director started and that is not yet marked
    // is worth a request.
    expect(await joinFromChat("mine", {})).toBe(false);
    expect(await joinFromChat("c2", both)).toBe(false);
    expect(await joinFromChat("c2", agents)).toBe(true);
    expect(joined).toEqual(["c2"]);
  });
});

describe("MessageToTeam", () => {
  it("opens a session at the team with what is written, under the name given, and links to it", async () => {
    const asked: unknown[] = [];
    server.use(
      http.post("*/api/director/org/sessions", async ({ request }) => {
        asked.push(await request.json());
        return HttpResponse.json(opened(SESSION), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<MessageToTeam node={API} />);
    const box = screen.getByLabelText("ORG_CHART$MESSAGE_LABEL");
    const name = screen.getByRole("textbox", {
      name: "ORG_CHART$SESSION_NAME",
    });
    const send = screen.getByRole("button", { name: "ORG_CHART$MESSAGE_SEND" });

    expect(send).toBeDisabled();
    await user.type(box, "  Add refunds.  ");
    await user.type(name, " Refunds ");
    await user.click(send);

    await waitFor(() =>
      expect(asked).toEqual([
        { text: "Add refunds.", title: "Refunds", node_id: API.id },
      ]),
    );
    expect(
      await screen.findByRole("link", { name: "ORG_CHART$SESSION_OPENED" }),
    ).toHaveAttribute("href", "/conversations/c2");
    // The next thing written is a session of its own.
    expect(box).toHaveValue("");
    expect(name).toHaveValue("");
  });

  it("leaves the team to the director for a session opened from the top team", async () => {
    const asked: unknown[] = [];
    server.use(
      http.post("*/api/director/org/sessions", async ({ request }) => {
        asked.push(await request.json());
        return HttpResponse.json(opened(SESSION), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<MessageToTeam node={ROOT} />);

    await user.type(
      screen.getByLabelText("ORG_CHART$MESSAGE_LABEL"),
      "Add refunds.",
    );
    await user.click(
      screen.getByRole("button", { name: "ORG_CHART$MESSAGE_SEND" }),
    );

    await waitFor(() => expect(asked).toEqual([{ text: "Add refunds." }]));
  });
});

describe("OrgHistoryPanel with sessions", () => {
  it("tells of sessions that were opened and closed", async () => {
    const events: HistoryEvent[] = [
      {
        at: "2026-11-01T12:00:00+00:00",
        kind: "session_closed",
        team_id: API.id,
        team: "API",
        session: "Refunds",
        detail: "with work that was not merged",
        above_id: ROOT.id,
        above: ROOT.title,
      },
      // What becomes of a session's team says which session it was.
      {
        at: "2026-11-01T11:00:00+00:00",
        kind: "accepted",
        team_id: API.id,
        team: "API",
        session: "Refunds",
        above_id: ROOT.id,
        above: ROOT.title,
      },
      {
        at: "2026-11-01T10:30:00+00:00",
        kind: "accepted",
        team_id: API.id,
        team: "API",
        above_id: ROOT.id,
        above: ROOT.title,
      },
      {
        at: "2026-11-01T10:00:00+00:00",
        kind: "session_opened",
        team_id: API.id,
        team: "API",
        session: "Refunds",
        detail: "Add refunds.",
        above_id: ROOT.id,
        above: ROOT.title,
      },
    ];
    server.use(
      http.get("*/api/director/org/history", () =>
        HttpResponse.json({ events, earlier: false }),
      ),
    );
    renderWithProviders(<OrgHistoryPanel startsOpen nodes={NODES} />);

    const lines = await within(
      await screen.findByTestId("org-history"),
    ).findAllByRole("listitem");
    expect(lines.map((line) => line.textContent)).toEqual([
      expect.stringContaining(
        "APIRefundsORG_CHART$HISTORY_SESSION_CLOSED (with work that was not merged)",
      ),
      expect.stringContaining("APIRefundsORG_CHART$HISTORY_ACCEPTED"),
      expect.stringMatching(/APIORG_CHART\$HISTORY_ACCEPTED$/),
      expect.stringContaining(
        "APIRefundsORG_CHART$HISTORY_SESSION_OPENED (Add refunds.)",
      ),
    ]);
  });
});

describe("sessionRequestOf", () => {
  it("reads the request of /session and leaves every other message alone", () => {
    expect(sessionRequestOf("/session  Add refunds. ")).toBe("Add refunds.");
    expect(sessionRequestOf(" /session")).toBe("");
    expect(sessionRequestOf("/sessions are great")).toBeNull();
    expect(sessionRequestOf("Open a /session")).toBeNull();
  });
});
