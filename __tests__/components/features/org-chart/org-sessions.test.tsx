import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { sessionRequestOf } from "#/api/director/session-from-chat";
import { joinFromChat } from "#/api/director/join-from-chat";
import type {
  ConversationPlace,
  HistoryEvent,
  OpenEscalation,
  OrgNode,
  Session,
  SessionTeam,
} from "#/api/director/types";
import { AgentInspectorDrawer } from "#/components/features/org-chart/agent-inspector-drawer";
import { ConversationLinks } from "#/components/features/org-chart/conversation-links";
import { EscalationsPanel } from "#/components/features/org-chart/escalations-panel";
import { MessageToTeam } from "#/components/features/org-chart/message-to-team";
import { NodeCard } from "#/components/features/org-chart/node-card";
import { OrgHistoryPanel } from "#/components/features/org-chart/org-history";
import {
  OrgSessionsContext,
  OrgSessionsPanel,
} from "#/components/features/org-chart/org-sessions";
import { SubChatHost } from "#/components/features/org-chart/sub-chat-host";
import { isAgentOnlyConversation } from "#/utils/conversation-tag-flags";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";

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
    worktree_path: "/work",
    branch: "",
    agents: [
      { role: "ic", conversation_id: "c", status: "idle", kind: "openhands" },
    ],
    status: "idle",
    spec_summary: "",
    escalations: [],
    pending_split: null,
    review: null,
    waiting_to_start: false,
    old_specs: [],
    child_ids: [],
    descendant_counts: { idle: 0, working: 0, done: 0, blocked: 0 },
    escalation_count: 0,
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

const ROOT = team("root", "Shop", "", {
  child_ids: ["services.api", "apps.web"],
});
const API = team("services.api", "API", "services/api");
const NODES = new Map([ROOT, API].map((node) => [node.id, node]));

// What the session has at the API team. It is no node of the tree.
const REFUNDS: SessionTeam = {
  ...team("services.api@s1a2b3c", "API", "services/api", {
    isolation: "worktree",
    agents: [
      { role: "ic", conversation_id: "c2", status: "idle", kind: "openhands" },
    ],
  }),
  session: "s1a2b3c",
  team_id: API.id,
};

const SESSION: Session = {
  id: "s1a2b3c",
  title: "Refunds",
  team_id: API.id,
  team: "API",
  above_id: ROOT.id,
  request: "Add refunds.",
  opened_at: "2026-11-01T10:00:00+00:00",
  status: "working",
  review: null,
  conversation_id: "c2",
  teams: [REFUNDS],
};

function opened(session: Session) {
  return { session, conversation_id: "c2", chosen_by: "path", reason: "" };
}

describe("NodeCard", () => {
  it("says how many sessions are open at a team, which are no sub-teams of it", () => {
    renderWithProviders(
      <OrgSessionsContext.Provider value={[SESSION]}>
        <NodeCard node={ROOT} current={false} onOpenDetails={() => {}} />
        <NodeCard node={API} current={false} onOpenDetails={() => {}} />
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
    const at = (id: string, status: Session["status"]): Session => ({
      ...SESSION,
      id,
      status,
      teams: [{ ...REFUNDS, id: `${API.id}@${id}`, session: id, status }],
    });
    const dots = (sessions: Session[], own: OrgNode = API) => {
      const { unmount } = renderWithProviders(
        <OrgSessionsContext.Provider value={sessions}>
          <NodeCard node={own} current={false} onOpenDetails={() => {}} />
        </OrgSessionsContext.Provider>,
      );
      const found = within(
        screen.getByTestId(`org-node-${own.id}`),
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
    expect(
      dots([at("s1", "done"), at("s2", "done"), at("s3", "idle")]),
    ).toEqual({
      counted: false,
      name: "1 ORG_CHART$STATUS_IDLE",
      states: ["idle"],
    });
    // A session at work is shown, and the idle team beside it is not.
    expect(dots([at("s1", "working"), at("s2", "done")]).states).toEqual([
      "working",
    ]);
    // The team's own work counts like a session's.
    const busy = { ...API, status: "working" as const };
    expect(dots([at("s1", "working"), at("s2", "blocked")], busy)).toEqual({
      counted: false,
      name: "1 ORG_CHART$STATUS_BLOCKED, 2 ORG_CHART$STATUS_WORKING",
      states: ["working", "working", "blocked"],
    });
    // More than there is room for are counted by state; idle is never one.
    expect(
      dots([
        at("s1", "working"),
        at("s2", "working"),
        at("s3", "working"),
        at("s4", "blocked"),
        at("s5", "done"),
        at("s6", "idle"),
      ]),
    ).toEqual({
      counted: true,
      name: "1 ORG_CHART$STATUS_BLOCKED, 3 ORG_CHART$STATUS_WORKING",
      states: ["blocked1", "working3"],
    });
  });
});

describe("AgentInspectorDrawer", () => {
  it("lists the conversations at a team, marks the ones the human started there, and opens one only when it is chosen", async () => {
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
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(
      <OrgSessionsContext.Provider value={[SESSION]}>
        <AgentInspectorDrawer node={API} onClose={() => {}} />
      </OrgSessionsContext.Provider>,
    );

    const rows = within(
      screen.getByTestId("org-node-conversations"),
    ).getAllByRole("button");
    expect(rows.map((row) => row.textContent)).toEqual([
      "ORG_CHART$ROLE_ICidle",
      "ORG_CHART$ROLE_IC · Refundsidle",
    ]);
    const [own, refunds] = rows;
    // The team's own IC was started by the org; the session by the human.
    expect(own).not.toHaveAttribute("data-mine");
    expect(own).not.toHaveClass("text-feedback-error");
    expect(refunds).toHaveAttribute("data-mine");
    expect(refunds).toHaveClass("text-feedback-error", "border-feedback-error");
    expect(screen.queryByTestId("agent-conversation")).toBeNull();
    expect(screen.getByText("ORG_CHART$CONVERSATION_PICK")).toBeInTheDocument();

    await user.click(refunds);
    expect(refunds).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByTestId("agent-conversation")).toHaveTextContent(
      "c2",
    );
    await user.click(own);
    expect(refunds).toHaveAttribute("aria-pressed", "false");
    expect(own).toHaveAttribute("aria-pressed", "true");
    unmount();

    // The top team's IC is the conversation the human started the org with.
    renderWithProviders(
      <AgentInspectorDrawer node={ROOT} onClose={() => {}} />,
    );
    expect(
      within(screen.getByTestId("org-node-conversations")).getByRole("button"),
    ).toHaveAttribute("data-mine");
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
      <OrgSessionsPanel sessions={[SESSION]} nodes={NODES} />,
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
    rerender(<OrgSessionsPanel sessions={[]} nodes={NODES} />);
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
      <OrgSessionsPanel sessions={[SESSION]} nodes={NODES} />,
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
        asked_of: null,
        asked_at: null,
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
    await user.type(screen.getByRole("textbox"), "Yes.");
    await user.click(screen.getByRole("button"));

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
        link("c2", "session", "API", "Refunds"),
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
      "ORG_CHART$LINK_BELOWAPI ORG_CHART$ROLE_ICORG_CHART$LINK_SESSIONAPI ORG_CHART$ROLE_IC · Refunds",
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

describe("MessageToTeam with sessions", () => {
  it("opens a session at the team with what is written, and links to it", async () => {
    const asked: unknown[] = [];
    const messages: unknown[] = [];
    server.use(
      http.post("*/api/director/org/sessions", async ({ request }) => {
        asked.push(await request.json());
        return HttpResponse.json(opened(SESSION), { status: 201 });
      }),
      http.post("*/api/director/org/messages", async ({ request }) => {
        messages.push(await request.json());
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<MessageToTeam node={API} nodes={NODES} />);

    await user.type(
      screen.getByLabelText("ORG_CHART$MESSAGE_LABEL"),
      "Add refunds.",
    );
    await user.click(
      screen.getByRole("checkbox", { name: "ORG_CHART$SESSION_NEW" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "ORG_CHART$SESSION_NAME" }),
      " Refunds ",
    );
    await user.click(
      screen.getByRole("button", { name: "ORG_CHART$MESSAGE_SEND" }),
    );

    await waitFor(() =>
      expect(asked).toEqual([
        { text: "Add refunds.", title: "Refunds", node_id: API.id },
      ]),
    );
    expect(messages).toEqual([]);
    expect(
      await screen.findByRole("link", { name: "ORG_CHART$SESSION_OPENED" }),
    ).toHaveAttribute("href", "/conversations/c2");
    // The next thing written is a message again.
    expect(
      screen.getByRole("checkbox", { name: "ORG_CHART$SESSION_NEW" }),
    ).not.toBeChecked();
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
    renderWithProviders(<MessageToTeam node={ROOT} nodes={NODES} />);

    await user.type(
      screen.getByLabelText("ORG_CHART$MESSAGE_LABEL"),
      "Add refunds.",
    );
    await user.click(
      screen.getByRole("checkbox", { name: "ORG_CHART$SESSION_NEW" }),
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
    renderWithProviders(<OrgHistoryPanel nodes={NODES} />);

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
