import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { sessionRequestOf } from "#/api/director/session-from-chat";
import type { HistoryEvent, OrgNode, Session } from "#/api/director/types";
import { MessageToTeam } from "#/components/features/org-chart/message-to-team";
import { NodeCard } from "#/components/features/org-chart/node-card";
import { OrgHistoryPanel } from "#/components/features/org-chart/org-history";
import { OrgSessionsPanel } from "#/components/features/org-chart/org-sessions";
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
    session_ids: [],
    session: "",
    session_title: "",
    instance_of: null,
    descendant_counts: { idle: 0, working: 0, done: 0, blocked: 0 },
    escalation_count: 0,
    ...rest,
  };
}

const REFUNDS_ID = "services.api@s1a2b3c";
const ROOT = team("root", "Shop", "", {
  child_ids: ["services.api", "apps.web", REFUNDS_ID],
  session_ids: [REFUNDS_ID],
});
const API = team("services.api", "API", "services/api");
// The API team once more, for the session: below the team that reviews it.
const REFUNDS = team(REFUNDS_ID, "API", "services/api", {
  session: "s1a2b3c",
  session_title: "Refunds",
  instance_of: API.id,
  isolation: "worktree",
});
const NODES = new Map([ROOT, API, REFUNDS].map((node) => [node.id, node]));

const SESSION: Session = {
  id: "s1a2b3c",
  title: "Refunds",
  node_id: REFUNDS_ID,
  team_id: API.id,
  team: "API",
  above_id: ROOT.id,
  status: "working",
  review: null,
  teams: 1,
};

function opened(session: Session) {
  return { session, conversation_id: "c2", chosen_by: "path", reason: "" };
}

describe("NodeCard", () => {
  it("marks a team of a session and counts sessions apart from sub-teams", () => {
    const { unmount } = renderWithProviders(
      <NodeCard node={ROOT} current={false} onOpenDetails={() => {}} />,
    );
    const root = screen.getByTestId("org-node-root");
    // Two sub-teams, not three: the third below it is a session.
    expect(root).toHaveTextContent(
      "ORG_CHART$SUB_TEAMS · ORG_CHART$SESSIONS_COUNT",
    );
    expect(within(root).queryByTestId("org-session-mark")).toBeNull();
    unmount();

    renderWithProviders(
      <NodeCard node={REFUNDS} current={false} onOpenDetails={() => {}} />,
    );
    const card = screen.getByTestId(`org-node-${REFUNDS_ID}`);
    expect(within(card).getByTestId("org-session-mark")).toHaveTextContent(
      "Refunds",
    );
    expect(card).not.toHaveTextContent("ORG_CHART$SUB_TEAMS");
  });
});

describe("OrgSessionsPanel", () => {
  it("lists the open sessions and closes one only after it is confirmed", async () => {
    const closed: string[] = [];
    let open = [SESSION];
    server.use(
      http.get("*/api/director/org/sessions", () => HttpResponse.json(open)),
      http.delete("*/api/director/org/sessions/:id", ({ params }) => {
        closed.push(String(params.id));
        open = [];
        return HttpResponse.json({}, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<OrgSessionsPanel nodes={NODES} />);

    const row = await screen.findByTestId("org-session-s1a2b3c");
    expect(within(row).getByRole("link", { name: "Refunds" })).toHaveAttribute(
      "href",
      `/org/${encodeURIComponent(REFUNDS_ID)}`,
    );
    expect(row).toHaveTextContent("API");
    expect(row).toHaveTextContent("ORG_CHART$SESSION_REVIEWED_BY");

    await user.click(
      within(row).getByRole("button", { name: "ORG_CHART$SESSION_CLOSE" }),
    );
    expect(row).toHaveTextContent("ORG_CHART$SESSION_CLOSE_CONFIRM");
    expect(closed).toEqual([]);
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
    expect(
      await screen.findByText("ORG_CHART$SESSIONS_EMPTY"),
    ).toBeInTheDocument();
  });

  it("says why a session could not be closed, and when none can be read", async () => {
    server.use(
      http.get("*/api/director/org/sessions", () =>
        HttpResponse.json([SESSION]),
      ),
      http.delete("*/api/director/org/sessions/:id", () =>
        HttpResponse.json(
          { detail: "No session 's1a2b3c' is open" },
          { status: 404 },
        ),
      ),
    );
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<OrgSessionsPanel nodes={NODES} />);
    const row = await screen.findByTestId("org-session-s1a2b3c");
    await user.click(
      within(row).getByRole("button", { name: "ORG_CHART$SESSION_CLOSE" }),
    );
    await user.click(
      within(row).getByRole("button", { name: "ORG_CHART$SESSION_CLOSE_YES" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No session 's1a2b3c' is open",
    );
    unmount();

    server.use(
      http.get("*/api/director/org/sessions", () =>
        HttpResponse.json({ detail: "x" }, { status: 503 }),
      ),
    );
    renderWithProviders(<OrgSessionsPanel nodes={NODES} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ORG_CHART$SESSIONS_ERROR",
    );
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
    ).toHaveAttribute("href", `/org/${encodeURIComponent(REFUNDS_ID)}`);
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

  it("writes to a team of a session as that team, and opens no session inside one", async () => {
    const sent: unknown[] = [];
    server.use(
      http.post("*/api/director/org/messages", async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({
          node_id: REFUNDS_ID,
          team: "API",
          conversation_id: "c2",
          started_org: false,
          chosen_by: "path",
          reason: "",
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<MessageToTeam node={REFUNDS} nodes={NODES} />);

    expect(screen.queryByRole("checkbox")).toBeNull();
    await user.type(
      screen.getByLabelText("ORG_CHART$MESSAGE_LABEL"),
      "Refund partial orders too.",
    );
    await user.click(
      screen.getByRole("button", { name: "ORG_CHART$MESSAGE_SEND" }),
    );

    // Not by its directory, which is the API team's own as well.
    await waitFor(() =>
      expect(sent).toEqual([
        { text: "Refund partial orders too.", node_id: REFUNDS_ID },
      ]),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "ORG_CHART$MESSAGE_SENT",
    );
  });
});

describe("OrgHistoryPanel with sessions", () => {
  it("tells of sessions that were opened and closed", async () => {
    const events: HistoryEvent[] = [
      {
        at: "2026-11-01T12:00:00+00:00",
        kind: "session_closed",
        team_id: REFUNDS_ID,
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
        team_id: REFUNDS_ID,
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
        team_id: REFUNDS_ID,
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
