import {
  act,
  cleanup,
  configure,
  getConfig,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  AgentRef,
  Escalation,
  NodeMemory,
  Report,
  NodeOwnership,
  NodeStatus,
  OrgEvent,
  OrgSummary,
  OrgSync,
  Review,
  SplitProposal,
  Thread,
} from "#/api/director/types";
import { subscribeOrgTree } from "#/api/director/director-client";
import * as activeStore from "#/api/backend-registry/active-store";
import { OrgChartView } from "#/components/features/org-chart/org-chart-view";
import { server } from "#/mocks/node";
import { useOpenFolderRequestStore } from "#/stores/open-folder-request-store";
import { useOrgChartStore } from "#/stores/org-chart-store";
import { renderWithProviders } from "test-utils";
import { OrgStore, type OrgNodeInput } from "./fake-org-store.mjs";

// The real conversation UI needs a live agent server. What matters here is
// that the inspector mounts it for the inspected agent.
vi.mock("#/components/features/org-chart/agent-conversation", () => ({
  AgentConversation: ({ conversationId }: { conversationId: string }) => (
    <div data-testid="conversation-view">{conversationId}</div>
  ),
}));

const POD: AgentRef[] = [
  { role: "ic", conversation_id: null, status: "working" },
  { role: "manager", conversation_id: "conv-manager", status: "idle" },
];

function input(
  id: string,
  parentId: string | null,
  status: NodeStatus,
  path: string,
  escalations: Escalation[] = [],
  pendingSplit: SplitProposal | null = null,
): OrgNodeInput {
  return {
    id,
    parent_id: parentId,
    title: `${id} team`,
    boundary: { path, writable: [`${path}/**`], readonly: ["src/types/**"] },
    isolation: parentId === "auth" ? "shared" : "worktree",
    worktree_path: ".",
    branch: `agents/${id}`,
    agents: POD,
    status,
    spec_summary: `Spec for ${id}`,
    escalations,
    pending_split: pendingSplit,
  };
}

/** Still with the team above the one that raised it. */
const TOKEN_DECISION: Escalation = {
  id: "token-format",
  kind: "design_decision",
  title: "Pick a token format",
  detail: "JWT or opaque?",
  raised_at: "2026-11-10T00:00:00Z",
  held_by: "auth",
  handoffs: [],
};
/** Passed up by every team above billing, so it waits on the human. */
const DOUBLE_CHARGE: Escalation = {
  id: "double-charge",
  kind: "critical_issue",
  title: "Retries charge twice",
  detail: "",
  raised_at: "2026-11-11T00:00:00Z",
  held_by: null,
  handoffs: [
    {
      node_id: "root",
      reason: "Refunds need a person",
      at: "2026-11-11T01:00:00Z",
    },
  ],
};

/** A fake of the server's org store drives the stream with realistic events. */
let store: OrgStore;
let streams: Array<{ close: () => void; send: (event: OrgEvent) => void }>;
let streamRequests: Request[];

function frame(event: OrgEvent) {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function streamHandler() {
  return http.get("*/api/director/org/tree-stream", ({ request }) => {
    streamRequests.push(request);
    const params = new URL(request.url).searchParams;
    const focusId = params.get("node") ?? store.rootId;
    const full = params.get("full") === "true";
    const snapshot = focusId === null ? null : store.snapshot(focusId, full);
    if (!snapshot) {
      return HttpResponse.json({ detail: "Unknown node" }, { status: 404 });
    }
    let unsubscribe = () => {};
    const handle = { close: () => {}, send: (_: OrgEvent) => {} };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(frame(snapshot));
        // A heartbeat comment, as the real server sends.
        controller.enqueue(new TextEncoder().encode(": keep-alive\n\n"));
        unsubscribe = store.subscribe(
          String(focusId),
          (event) => controller.enqueue(frame(event)),
          full,
        );
        handle.close = () => {
          unsubscribe();
          controller.close();
        };
        handle.send = (event) => controller.enqueue(frame(event));
        streams.push(handle);
      },
      cancel: () => unsubscribe(),
    });
    return new HttpResponse(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });
  });
}

function memoryHandlers(reports: Report[] = [], threads: Thread[] = []) {
  server.use(
    http.get("*/api/director/org/nodes/:nodeId/memory", () => {
      const body: NodeMemory = { specs: [], reports };
      return HttpResponse.json(body);
    }),
    http.get("*/api/director/org/nodes/:nodeId/messages", () =>
      HttpResponse.json(threads),
    ),
  );
}

// Now and then the first request of a test is not intercepted and goes to
// the network, where nothing listens. The page then asks again after a
// second, which is as long as a finder waits by default: wait longer than
// one retry, so that this costs a second and not the test.
const FIND_TIMEOUT_MS = 4000;
let defaultFindTimeout: number;

beforeAll(() => {
  defaultFindTimeout = getConfig().asyncUtilTimeout;
  configure({ asyncUtilTimeout: FIND_TIMEOUT_MS });
});

afterAll(() => {
  configure({ asyncUtilTimeout: defaultFindTimeout });
});

beforeEach(() => {
  window.localStorage.clear();
  useOrgChartStore.setState({ view: "focused", zoom: 1, ownershipOpen: true });
  streams = [];
  streamRequests = [];
  store = new OrgStore();
  store.upsert(input("root", null, "working", ""));
  store.upsert(input("auth", "root", "working", "services/auth"));
  store.upsert(
    input("billing", "root", "blocked", "services/billing", [DOUBLE_CHARGE]),
  );
  store.upsert(input("search", "root", "working", "services/search"));
  store.upsert(
    input("oauth", "auth", "done", "services/auth/oauth", [TOKEN_DECISION]),
  );
  server.use(streamHandler());
});

afterEach(() => {
  vi.restoreAllMocks();
  // Unmount first: a chart still on the page takes a closed stream for a
  // lost server and asks for a new one, which then belongs to no test.
  cleanup();
  streams.forEach((stream) => {
    try {
      stream.close();
    } catch {
      // Already closed by the test.
    }
  });
});

describe("subscribeOrgTree", () => {
  it("delivers nothing more once unsubscribed", async () => {
    const events: OrgEvent[] = [];
    const stop = subscribeOrgTree("root", {
      onEvent: (event) => events.push(event),
      onStatus: () => {},
    });
    await waitFor(() => expect(events).toHaveLength(1));

    stop();
    store.upsert(input("late", "root", "done", "services/late"));
    await new Promise((resolve) => {
      setTimeout(resolve, 1200);
    });

    expect(events.map((event) => event.type)).toEqual(["snapshot"]);
    expect(streamRequests).toHaveLength(1);
  });

  it("authenticates with the active local backend's session key", async () => {
    const backend = activeStore.getEffectiveLocalBackend();
    vi.spyOn(activeStore, "getEffectiveLocalBackend").mockReturnValue({
      ...backend!,
      host: "http://director-host.test/",
      apiKey: " secret-key ",
    });
    const statuses: string[] = [];

    const stop = subscribeOrgTree(null, {
      onEvent: () => {},
      onStatus: (status) => statuses.push(status),
    });
    await waitFor(() => expect(statuses).toContain("live"));
    stop();

    expect(streamRequests[0].url).toBe(
      "http://director-host.test/api/director/org/tree-stream",
    );
    expect(streamRequests[0].headers.get("X-Session-API-Key")).toBe(
      "secret-key",
    );
  });

  it("reports the director as unavailable when no local backend is active", async () => {
    vi.spyOn(activeStore, "getEffectiveLocalBackend").mockReturnValue(null);
    const statuses: string[] = [];

    const stop = subscribeOrgTree(null, {
      onEvent: () => {},
      onStatus: (status) => statuses.push(status),
    });
    await waitFor(() => expect(statuses).toContain("unavailable"));
    stop();

    expect(streamRequests).toHaveLength(0);
  });

  it("asks for every node below the one it follows when told to", async () => {
    const events: OrgEvent[] = [];

    const stop = subscribeOrgTree(
      "auth",
      { onEvent: (event) => events.push(event), onStatus: () => {} },
      true,
    );
    await waitFor(() => expect(events).toHaveLength(1));
    stop();

    expect(new URL(streamRequests[0].url).search).toBe("?node=auth&full=true");
  });
});

function card(id: string) {
  return screen.getByTestId(`org-node-${id}`);
}

function findCard(id: string, timeout?: number) {
  return screen.findByTestId(`org-node-${id}`, undefined, { timeout });
}

function cardIds() {
  return screen
    .getAllByTestId(/^org-node-/)
    .map((element) => element.getAttribute("data-testid")?.slice(9));
}

/** The card of the team the page is on; clicking it opens its details. */
function currentCard() {
  return screen.getByRole("button", { name: "ORG_CHART$OPEN_DETAILS" });
}

function teamLink(id: string) {
  return within(card(id)).getByRole("link");
}

function escalations() {
  return screen.getByRole("region", { name: "ORG_CHART$ESCALATIONS" });
}

function lastStream() {
  return new URL(streamRequests.at(-1)!.url).searchParams;
}

async function showWholeOrg(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "ORG_CHART$VIEW_FULL" }));
}

function badge(id: string) {
  return (
    within(card(id)).queryByRole("img", { name: "ORG_CHART$ESCALATION_COUNT" })
      ?.textContent ?? null
  );
}

describe("OrgChartView", () => {
  describe("one team at a time", () => {
    it("draws the team the page is on with its direct reports, and nothing else", async () => {
      renderWithProviders(<OrgChartView nodeId={null} />);

      const root = await findCard("root");

      expect(cardIds()).toEqual(["root", "auth", "billing", "search"]);
      expect(root).toHaveAttribute("data-current");
      expect(card("auth")).not.toHaveAttribute("data-current");
      expect(lastStream().toString()).toBe("");
    });

    it("moves to a report when it is clicked", async () => {
      store.upsert(input("a/b c", "root", "done", "services/odd"));
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      expect(teamLink("auth")).toHaveAttribute("href", "/org/auth");
      expect(teamLink("a/b c")).toHaveAttribute("href", "/org/a%2Fb%20c");
    });

    it("marks each report that has sub-teams with an ellipsis below it, and no other", async () => {
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      const hasMore = (id: string) =>
        card(id).closest("li")?.querySelector("[data-has-sub-teams]") !== null;

      expect(hasMore("auth")).toBe(true);
      expect(hasMore("billing")).toBe(false);
      expect(hasMore("search")).toBe(false);
    });

    it("leads up to the team above only when there is one", async () => {
      const { rerender } = renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");
      expect(
        screen.queryByRole("link", { name: "ORG_CHART$UP_ONE_LEVEL" }),
      ).toBeNull();

      rerender(<OrgChartView nodeId="auth" />);

      expect(
        await screen.findByRole("link", { name: "ORG_CHART$UP_ONE_LEVEL" }),
      ).toHaveAttribute("href", "/org/root");
      expect(cardIds()).toEqual(["auth", "oauth"]);
      expect(lastStream().toString()).toBe("node=auth");
    });

    it("goes up a team on Alt+ArrowUp, and nowhere from the top", async () => {
      const navigate = vi.fn();
      const user = userEvent.setup();
      const { rerender } = renderWithProviders(<OrgChartView nodeId="auth" />, {
        navigation: { navigate },
      });
      await findCard("auth");

      await user.keyboard("{Alt>}{ArrowUp}{/Alt}");

      expect(navigate).toHaveBeenCalledWith("/org/root");

      rerender(<OrgChartView nodeId={null} />);
      await findCard("billing");
      await user.keyboard("{Alt>}{ArrowUp}{/Alt}");

      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it("draws a team without reports on its own", async () => {
      renderWithProviders(<OrgChartView nodeId="search" />);
      await findCard("search");

      expect(cardIds()).toEqual(["search"]);
    });

    it("keeps the previous team on screen until the next one arrives", async () => {
      const { rerender } = renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      rerender(<OrgChartView nodeId="auth" />);

      // Never a loading notice in between.
      expect(screen.queryByText("ORG_CHART$LOADING")).toBeNull();
      expect(card("root")).toBeInTheDocument();
      await waitFor(() => expect(cardIds()).toEqual(["auth", "oauth"]));
    });

    it("shows the way back up through the ancestors", async () => {
      renderWithProviders(<OrgChartView nodeId="oauth" />);

      const trail = await screen.findByRole("navigation", {
        name: "ORG_CHART$BREADCRUMB_LABEL",
      });

      expect(
        within(trail)
          .getAllByRole("link")
          .map((link) => link.getAttribute("href")),
      ).toEqual(["/org/root", "/org/auth"]);
      expect(within(trail).getByText("oauth team")).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    it("says on each card how many sub-teams the team has", async () => {
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      const subTeams = (id: string) =>
        within(card(id)).queryByText("ORG_CHART$SUB_TEAMS") !== null;

      expect([subTeams("root"), subTeams("auth"), subTeams("billing")]).toEqual(
        [true, true, false],
      );
    });

    it("keeps status and boundaries out of the chart", async () => {
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      expect(screen.queryByText(/ORG_CHART\$STATUS_/)).toBeNull();
      expect(screen.queryByText(/services\/auth/)).toBeNull();
      expect(screen.queryByText(/ORG_CHART\$ISOLATION_/)).toBeNull();
      expect(screen.queryByText("Spec for auth")).toBeNull();
    });

    // Hovering opens the same card; jsdom only drives it reliably by focus.
    it("shows a team's status, boundary, agents and escalations while its card has keyboard focus", async () => {
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("oauth");

      for (let presses = 0; presses < 16; presses += 1) {
        if (document.activeElement === teamLink("oauth")) break;
        await user.tab();
      }
      expect(teamLink("oauth")).toHaveFocus();

      const tip = await screen.findByRole("tooltip");
      expect(within(tip).getByText("oauth team")).toBeInTheDocument();
      expect(within(tip).getByText("Spec for oauth")).toBeInTheDocument();
      expect(
        within(tip).getByText("ORG_CHART$STATUS_DONE"),
      ).toBeInTheDocument();
      expect(within(tip).getByText("services/auth/oauth")).toBeInTheDocument();
      expect(
        within(tip).getByText(/ORG_CHART\$ISOLATION_SHARED/),
      ).toBeInTheDocument();
      expect(
        within(tip).getByText("services/auth/oauth/**"),
      ).toBeInTheDocument();
      expect(within(tip).getByText("src/types/**")).toBeInTheDocument();
      expect(
        within(tip).getByText(
          "ORG_CHART$ROLE_IC (working), ORG_CHART$ROLE_MANAGER (idle)",
        ),
      ).toBeInTheDocument();
      // What a team above still holds is not the human's to see.
      expect(within(tip).queryByText("Pick a token format")).toBeNull();
    });

    it("shows on a team's card only the escalations that wait on the human", async () => {
      const user = userEvent.setup();
      store.upsert(
        input("billing", "root", "blocked", "services/billing", [
          DOUBLE_CHARGE,
          {
            ...TOKEN_DECISION,
            id: "ledger",
            title: "Pick a ledger",
            held_by: "root",
          },
        ]),
      );
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("billing");

      for (let presses = 0; presses < 16; presses += 1) {
        if (document.activeElement === teamLink("billing")) break;
        await user.tab();
      }

      const tip = await screen.findByRole("tooltip");
      expect(within(tip).getByText("Retries charge twice")).toBeInTheDocument();
      expect(
        within(tip).getByText(/ORG_CHART\$ESCALATION_WAITING/),
      ).toBeInTheDocument();
      expect(within(tip).queryByText("Pick a ledger")).toBeNull();
    });

    it("says on each card, in a line, what the team is delivering", async () => {
      store.upsert({
        ...input("auth", "root", "working", "services/auth"),
        headline: "Adds passkey sign-in.",
      });
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("auth");

      expect(
        within(card("auth")).getByText("Adds passkey sign-in."),
      ).toBeInTheDocument();
      expect(within(card("search")).queryByText(/Spec for/)).toBeNull();
    });
  });

  describe("the whole org", () => {
    it("draws every team once asked to, with reports nested under their team", async () => {
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      await showWholeOrg(user);

      expect(await findCard("oauth")).toBeInTheDocument();
      expect(cardIds()).toEqual(["root", "auth", "oauth", "billing", "search"]);
      expect(card("auth").closest("li")).toContainElement(card("oauth"));
      expect(card("auth").closest("li")).not.toContainElement(card("billing"));
      expect(lastStream().toString()).toBe("full=true");
      expect(
        screen.getByRole("button", { name: "ORG_CHART$VIEW_FULL" }),
      ).toHaveAttribute("aria-pressed", "true");
    });

    it("groups the whole org by state, and moves a team as its state changes", async () => {
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");

      await user.click(
        screen.getByRole("button", { name: "ORG_CHART$VIEW_BY_STATE" }),
      );
      await findCard("oauth");

      const column = (state: string) =>
        within(screen.getByTestId(`org-state-${state}`))
          .getAllByTestId(/^org-node-/)
          .map((element) => element.getAttribute("data-testid")?.slice(9));
      expect(lastStream().toString()).toBe("full=true");
      expect(column("working")).toEqual(["root", "auth", "search"]);
      expect(column("blocked")).toEqual(["billing"]);
      expect(column("done")).toEqual(["oauth"]);
      expect(card("auth")).toHaveAttribute("data-current");
      expect(
        screen.getByRole("button", { name: "ORG_CHART$ZOOM_IN" }),
      ).toBeDisabled();

      store.upsert(input("search", "root", "done", "services/search"));

      await waitFor(() => expect(column("done")).toEqual(["search", "oauth"]));
      expect(column("working")).toEqual(["root", "auth"]);
    });

    it("marks the team the page is on and follows it without asking the server again", async () => {
      useOrgChartStore.setState({ view: "full" });
      const { rerender } = renderWithProviders(<OrgChartView nodeId="oauth" />);
      await findCard("oauth");

      expect(cardIds()).toEqual(["root", "auth", "oauth", "billing", "search"]);
      expect(card("oauth")).toHaveAttribute("data-current");
      expect(card("root")).not.toHaveAttribute("data-current");
      expect(teamLink("billing")).toHaveAttribute("href", "/org/billing");

      rerender(<OrgChartView nodeId="billing" />);

      expect(card("billing")).toHaveAttribute("data-current");
      expect(card("oauth")).not.toHaveAttribute("data-current");
      expect(streamRequests).toHaveLength(1);
    });

    it("keeps the team the page is on in the middle of the chart, through moves and zooming", async () => {
      const scrolled: Array<{ id: string | null; behavior?: string }> = [];
      const original = HTMLElement.prototype.scrollIntoView;
      HTMLElement.prototype.scrollIntoView = function scrollIntoView(
        options?: boolean | ScrollIntoViewOptions,
      ) {
        if (typeof options === "object") {
          expect(options).toMatchObject({ block: "center", inline: "center" });
          scrolled.push({
            id: this.getAttribute("data-testid"),
            behavior: options.behavior,
          });
        }
      };
      try {
        useOrgChartStore.setState({ view: "full" });
        const { rerender } = renderWithProviders(
          <OrgChartView nodeId="oauth" />,
        );
        await findCard("oauth");
        rerender(<OrgChartView nodeId="billing" />);

        act(() => useOrgChartStore.getState().zoomOut());

        // Jumps on arrival and on zoom, glides to a team already on screen.
        expect(scrolled).toEqual([
          { id: "org-node-oauth", behavior: "instant" },
          { id: "org-node-billing", behavior: "smooth" },
          { id: "org-node-billing", behavior: "instant" },
        ]);
      } finally {
        HTMLElement.prototype.scrollIntoView = original;
      }
    });

    it("says so when the page is on a team the org does not have", async () => {
      useOrgChartStore.setState({ view: "full" });
      renderWithProviders(<OrgChartView nodeId="missing" />);

      expect(
        await screen.findByText("ORG_CHART$NOT_FOUND_TITLE"),
      ).toBeInTheDocument();
    });

    it("goes back to one team at a time", async () => {
      useOrgChartStore.setState({ view: "full" });
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("billing");

      await user.click(
        screen.getByRole("button", { name: "ORG_CHART$VIEW_FOCUSED" }),
      );

      await waitFor(() => expect(cardIds()).toEqual(["auth", "oauth"]));
      expect(lastStream().toString()).toBe("node=auth");
    });
  });

  describe("view and zoom settings", () => {
    const stored = () =>
      JSON.parse(window.localStorage.getItem("openhands-org-chart") ?? "{}")
        .state;

    it("zooms the chart in and out and back to actual size", async () => {
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");
      const zoomed = () =>
        screen
          .getByTestId("org-chart-zoom")
          .style.getPropertyValue("--org-chart-zoom");
      const reset = screen.getByRole("button", {
        name: "ORG_CHART$ZOOM_RESET",
      });
      expect([zoomed(), reset.textContent]).toEqual(["1", "100%"]);

      await user.click(
        screen.getByRole("button", { name: "ORG_CHART$ZOOM_OUT" }),
      );
      await user.click(
        screen.getByRole("button", { name: "ORG_CHART$ZOOM_OUT" }),
      );
      expect([zoomed(), reset.textContent]).toEqual(["0.8", "80%"]);

      await user.click(
        screen.getByRole("button", { name: "ORG_CHART$ZOOM_IN" }),
      );
      expect([zoomed(), reset.textContent]).toEqual(["0.9", "90%"]);

      await user.click(reset);
      expect([zoomed(), reset.textContent]).toEqual(["1", "100%"]);
    });

    it("stops at the smallest and largest zoom", async () => {
      useOrgChartStore.setState({ zoom: 0.3 });
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      expect(
        screen.getByRole("button", { name: "ORG_CHART$ZOOM_OUT" }),
      ).toBeDisabled();

      act(() => useOrgChartStore.setState({ zoom: 2 }));

      expect(
        screen.getByRole("button", { name: "ORG_CHART$ZOOM_IN" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "ORG_CHART$ZOOM_OUT" }),
      ).toBeEnabled();
    });

    it("remembers the zoom and the view", async () => {
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      await user.click(
        screen.getByRole("button", { name: "ORG_CHART$ZOOM_IN" }),
      );
      await showWholeOrg(user);

      expect(stored()).toEqual({
        view: "full",
        zoom: 1.1,
        ownershipOpen: true,
      });
    });

    it("applies the zoom to the whole org too, which starts a quarter larger", async () => {
      useOrgChartStore.setState({ zoom: 0.5 });
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      await showWholeOrg(user);
      await findCard("oauth");

      expect(
        screen
          .getByTestId("org-chart-zoom")
          .style.getPropertyValue("--org-chart-zoom"),
      ).toBe("0.625");
    });
  });

  describe("live updates", () => {
    it("shows a pause made elsewhere as soon as the stream says so", async () => {
      server.use(
        http.get("*/api/director/org", () =>
          HttpResponse.json({
            root_id: "root",
            node_count: 5,
            repo_path: "/work/shop",
            is_git_repository: true,
            fixture: false,
            paused: null,
            merging: false,
          } satisfies OrgSummary),
        ),
        http.get("*/api/director/org/recovery", () =>
          HttpResponse.json({ paused: "human", items: [], messages_held: 0 }),
        ),
      );
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");
      await screen.findByRole("button", { name: "ORG_CHART$PAUSE" });
      expect(screen.queryByTestId("org-paused")).toBeNull();

      streams[0].send({ type: "org_state", paused: "human", merging: false });
      expect(await screen.findByTestId("org-paused")).toBeInTheDocument();

      streams[0].send({ type: "org_state", paused: null, merging: false });
      await waitFor(() =>
        expect(screen.queryByTestId("org-paused")).toBeNull(),
      );
    });

    it("adds and removes cards as teams are spawned and pruned", async () => {
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      store.upsert(input("growth", "root", "idle", "services/growth"));
      expect(await findCard("growth")).toBeInTheDocument();

      store.remove("billing");
      await waitFor(() =>
        expect(screen.queryByTestId("org-node-billing")).toBeNull(),
      );
    });

    it("follows changes deep in the tree only when the whole org is drawn", async () => {
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      store.upsert(input("saml", "auth", "working", "services/auth/saml"));
      await showWholeOrg(user);
      await findCard("saml");
      store.upsert(input("device", "oauth", "done", "services/auth/oauth/d"));

      expect(await findCard("device")).toBeInTheDocument();
      store.remove("oauth");
      await waitFor(() =>
        expect(screen.queryByTestId("org-node-device")).toBeNull(),
      );
      expect(card("saml")).toBeInTheDocument();
    });

    it("explains that the team is gone when it is removed", async () => {
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");

      store.remove("auth");

      expect(
        await screen.findByText("ORG_CHART$NOT_FOUND_TITLE"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "ORG_CHART$BACK_TO_ROOT" }),
      ).toHaveAttribute("href", "/org");
    });

    it("stays gone when the team is removed along with an ancestor", async () => {
      renderWithProviders(<OrgChartView nodeId="oauth" />);
      await findCard("oauth");

      // Removing the parent reports the team first and the parent after it;
      // that second frame must not bring the chart back.
      store.remove("auth");

      expect(
        await screen.findByText("ORG_CHART$NOT_FOUND_TITLE"),
      ).toBeInTheDocument();
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
      expect(screen.getByText("ORG_CHART$NOT_FOUND_TITLE")).toBeInTheDocument();
      expect(screen.queryByTestId("org-node-oauth")).toBeNull();
    });

    it("says so in the whole-org view when the team the page is on is removed", async () => {
      useOrgChartStore.setState({ view: "full" });
      renderWithProviders(<OrgChartView nodeId="oauth" />);
      await findCard("oauth");

      store.remove("oauth");

      expect(
        await screen.findByText("ORG_CHART$NOT_FOUND_TITLE"),
      ).toBeInTheDocument();
    });

    it("reports an unknown team without retrying, and recovers on a team that exists", async () => {
      const { rerender } = renderWithProviders(
        <OrgChartView nodeId="missing" />,
      );

      expect(
        await screen.findByText("ORG_CHART$NOT_FOUND_TITLE"),
      ).toBeInTheDocument();
      await new Promise((resolve) => {
        setTimeout(resolve, 1200);
      });
      expect(streamRequests).toHaveLength(1);

      rerender(<OrgChartView nodeId="auth" />);

      expect(await findCard("auth")).toBeInTheDocument();
      expect(screen.queryByText("ORG_CHART$NOT_FOUND_TITLE")).toBeNull();
    });

    it("treats a backend without an org tree as unavailable and keeps retrying", async () => {
      // A stock Agent Server has no director API, and a new one has no tree
      // yet: both answer 404 for the root.
      let attempts = 0;
      server.use(
        http.get(
          "*/api/director/org/tree-stream",
          () => {
            attempts += 1;
            return HttpResponse.json({ detail: "Not Found" }, { status: 404 });
          },
          { once: true },
        ),
      );

      renderWithProviders(<OrgChartView nodeId={null} />);

      expect(
        await screen.findByText("ORG_CHART$UNAVAILABLE_TITLE"),
      ).toBeInTheDocument();
      expect(await findCard("root", 4000)).toBeInTheDocument();
      expect(attempts).toBe(1);
    });

    it("says the director is offline, then recovers by itself once it is back", async () => {
      let failures = 0;
      server.use(
        http.get(
          "*/api/director/org/tree-stream",
          () => {
            failures += 1;
            return HttpResponse.json({ detail: "down" }, { status: 503 });
          },
          { once: true },
        ),
      );

      renderWithProviders(<OrgChartView nodeId={null} />);

      expect(
        await screen.findByText("ORG_CHART$UNAVAILABLE_TITLE"),
      ).toBeInTheDocument();
      expect(await findCard("root", 4000)).toBeInTheDocument();
      expect(failures).toBe(1);
    });

    it("keeps the last chart while reconnecting, then replaces it with the fresh snapshot", async () => {
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      streams[0].close();

      expect(await screen.findByRole("status")).toHaveTextContent(
        "ORG_CHART$RECONNECTING",
      );
      expect(card("billing")).toBeVisible();

      // Changed while disconnected: only the new snapshot can deliver this.
      store.remove("billing");

      await waitFor(
        () => expect(screen.queryByTestId("org-node-billing")).toBeNull(),
        { timeout: 4000 },
      );
      expect(screen.queryByRole("status")).toBeNull();
      expect(streamRequests).toHaveLength(2);
    });
  });

  describe("escalations", () => {
    it("lists only what waits on the human, with where it came from and why each team passed it up", async () => {
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      const items = within(escalations()).getAllByRole("listitem");

      // The token decision is still with the auth team: not the human's yet.
      expect(items).toHaveLength(1);
      expect(items[0]).toHaveTextContent("ORG_CHART$ESCALATION_CRITICAL");
      expect(items[0]).toHaveTextContent("Retries charge twice");
      expect(items[0]).toHaveTextContent("root team › billing team");
      expect(items[0]).toHaveTextContent("ORG_CHART$ESCALATION_PASSED_UP");
      expect(items[0]).toHaveTextContent("root team: Refunds need a person");
      expect(
        within(items[0]).getByRole("link", {
          name: "root team › billing team",
        }),
      ).toHaveAttribute("href", "/org/billing");
      expect(
        within(escalations()).queryByText("Pick a token format"),
      ).toBeNull();
    });

    it("lists them whichever team the page is on", async () => {
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");

      expect(
        within(escalations()).getByText("Retries charge twice"),
      ).toBeInTheDocument();
    });

    it("marks the teams above one that waits on the human, and not one a team still holds", async () => {
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      expect({
        root: badge("root"),
        auth: badge("auth"),
        billing: badge("billing"),
        search: badge("search"),
      }).toEqual({ root: "1", auth: null, billing: "1", search: null });
    });

    it("adds one the moment the last team above passes it up, and drops it once settled", async () => {
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      // The auth team passes the decision up: now root holds it.
      const passedOnce: Escalation = {
        ...TOKEN_DECISION,
        held_by: "root",
        handoffs: [{ node_id: "auth", reason: "Affects billing too", at: "t" }],
      };
      store.upsert(
        input("oauth", "auth", "done", "services/auth/oauth", [passedOnce]),
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
      expect(within(escalations()).getAllByRole("listitem")).toHaveLength(1);

      // Root passes it up too: nobody is left but the human.
      store.upsert(
        input("oauth", "auth", "done", "services/auth/oauth", [
          {
            ...passedOnce,
            held_by: null,
            handoffs: [
              ...passedOnce.handoffs,
              { node_id: "root", reason: "A product call", at: "t" },
            ],
          },
        ]),
      );

      const added = (
        await within(escalations()).findByText("Pick a token format")
      ).closest("li") as HTMLElement;
      expect(added).toHaveTextContent("auth team: Affects billing too");
      expect(added).toHaveTextContent("root team: A product call");
      expect(added).toHaveTextContent("ORG_CHART$ESCALATION_DECISION");
      await waitFor(() => expect(badge("auth")).toBe("1"));
      expect(badge("root")).toBe("2");

      store.upsert(input("billing", "root", "working", "services/billing"));

      await waitFor(() =>
        expect(
          within(escalations()).queryByText("Retries charge twice"),
        ).toBeNull(),
      );
      expect(badge("billing")).toBeNull();
    });

    it("says so when nothing waits on the human", async () => {
      store.upsert(input("billing", "root", "working", "services/billing"));

      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      expect(
        within(escalations()).getByText("ORG_CHART$ESCALATIONS_EMPTY"),
      ).toBeInTheDocument();
      expect(within(escalations()).queryByRole("listitem")).toBeNull();
    });
  });

  describe("answering an escalation", () => {
    function answerHandler(status = 200) {
      const answers: Array<{ nodeId: string; id: string; answer: string }> = [];
      server.use(
        http.post(
          "*/api/director/org/nodes/:nodeId/escalations/:id/answer",
          async ({ params, request }) => {
            const { answer } = (await request.json()) as { answer: string };
            answers.push({
              nodeId: String(params.nodeId),
              id: String(params.id),
              answer,
            });
            if (status !== 200) {
              return HttpResponse.json({ detail: "no" }, { status });
            }
            return HttpResponse.json(
              store.upsert(
                input("billing", "root", "working", "services/billing"),
              ),
            );
          },
        ),
      );
      return answers;
    }

    it("sends the answer for the team that raised it, and drops the entry once the server settles it", async () => {
      const answers = answerHandler();
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      const send = within(escalations()).getByRole("button", {
        name: "ORG_CHART$ESCALATION_ANSWER_SUBMIT",
      });
      expect(send).toBeDisabled();
      await user.type(
        within(escalations()).getByLabelText(
          "ORG_CHART$ESCALATION_ANSWER_LABEL",
        ),
        "  Refund both charges.  ",
      );
      await user.click(send);

      await waitFor(() =>
        expect(within(escalations()).queryByRole("listitem")).toBeNull(),
      );
      expect(answers).toEqual([
        {
          nodeId: "billing",
          id: "double-charge",
          answer: "Refund both charges.",
        },
      ]);
      expect(badge("root")).toBeNull();
    });

    it("keeps the entry and the answer when the server refuses it", async () => {
      answerHandler(409);
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      const box = within(escalations()).getByLabelText(
        "ORG_CHART$ESCALATION_ANSWER_LABEL",
      );
      await user.type(box, "Refund both charges.");
      await user.click(
        within(escalations()).getByRole("button", {
          name: "ORG_CHART$ESCALATION_ANSWER_SUBMIT",
        }),
      );

      expect(await within(escalations()).findByRole("alert")).toHaveTextContent(
        "ORG_CHART$ESCALATION_ANSWER_FAILED",
      );
      expect(box).toHaveValue("Refund both charges.");
      expect(
        within(escalations()).getByRole("button", {
          name: "ORG_CHART$ESCALATION_ANSWER_SUBMIT",
        }),
      ).toBeEnabled();
    });
  });

  describe("a split that is not carried out yet", () => {
    it("shows where it stands and the sub-teams it proposes on the team's card", async () => {
      store.upsert(
        input("search", "root", "working", "services/search", [], {
          children: [
            {
              title: "indexer",
              path: "services/search/indexer",
              writable: [],
              readonly: [],
              isolation: "shared",
              task: "Build the indexer",
            },
            {
              title: "query",
              path: "services/search/query",
              writable: [],
              readonly: [],
              isolation: "shared",
              task: "Build the query API",
            },
          ],
          contracts: "",
          status: "approved",
          replaces: ["auth"],
          proposed_at: "2026-11-12T00:00:00Z",
        }),
      );
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("search");

      for (let presses = 0; presses < 16; presses += 1) {
        if (document.activeElement === teamLink("search")) break;
        await user.tab();
      }
      expect(teamLink("search")).toHaveFocus();

      const tip = await screen.findByRole("tooltip");
      expect(
        within(tip).getByText("ORG_CHART$SPLIT_APPROVED"),
      ).toBeInTheDocument();
      expect(within(tip).getByText("indexer, query")).toBeInTheDocument();
    });
  });

  describe("a director without an org", () => {
    const SUMMARY: OrgSummary = {
      root_id: null,
      node_count: 0,
      repo_path: "/work/shop",
      is_git_repository: true,
      fixture: false,
    };

    function withoutOrg(summary: OrgSummary = SUMMARY) {
      store = new OrgStore();
      server.use(
        streamHandler(),
        http.get("*/api/director/org", () => HttpResponse.json(summary)),
      );
    }

    it("says a conversation's first message starts one, and leads to where conversations start", async () => {
      withoutOrg();
      renderWithProviders(<OrgChartView nodeId={null} />);

      expect(
        await screen.findByRole("heading", { name: "ORG_CHART$START_TITLE" }),
      ).toBeInTheDocument();
      expect(screen.getByText("ORG_CHART$START_BODY")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "ORG_CHART$START_SUBMIT" }),
      ).toHaveAttribute("href", "/conversations");
      // Nothing is typed to agents on this page.
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "ORG_CHART$START_OPEN_FOLDER" }),
      ).toBeNull();
    });

    it("leads to choosing a folder when the server's own is not in a git repository", async () => {
      withoutOrg({ ...SUMMARY, is_git_repository: false });
      const navigate = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId={null} />, {
        navigation: { navigate },
      });

      expect(
        await screen.findByText("ORG_CHART$START_NEEDS_GIT"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "ORG_CHART$START_SUBMIT" }),
      ).toBeNull();
      await user.click(
        screen.getByRole("button", { name: "ORG_CHART$START_OPEN_FOLDER" }),
      );

      expect(navigate).toHaveBeenCalledWith("/conversations");
      // Home offers its folder chooser once.
      expect(useOpenFolderRequestStore.getState().take()).toBe(true);
      expect(useOpenFolderRequestStore.getState().take()).toBe(false);
    });
  });

  describe("giving an org work", () => {
    it("says to start a conversation in a folder of the org's repository", async () => {
      server.use(
        http.get("*/api/director/org", () =>
          HttpResponse.json({
            root_id: "root",
            node_count: 5,
            repo_path: "/work/shop",
            is_git_repository: true,
            fixture: false,
          } satisfies OrgSummary),
        ),
      );
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");

      const hint = await screen.findByText(/ORG_CHART\$TALK_HINT/);
      expect(
        within(hint).getByRole("link", { name: "ORG_CHART$START_SUBMIT" }),
      ).toHaveAttribute("href", "/conversations");
    });
  });

  describe("team details", () => {
    it.each([
      ["sandbox", "ORG_CHART$ENFORCED_SANDBOX"],
      ["checks", "ORG_CHART$ENFORCED_CHECKS"],
    ] as const)(
      "says how the server holds the team to its boundary (%s)",
      async (enforcement, text) => {
        memoryHandlers();
        server.use(
          http.get("*/api/director/org", () =>
            HttpResponse.json({
              root_id: "root",
              node_count: 5,
              repo_path: "/work/shop",
              is_git_repository: true,
              fixture: false,
              boundary_enforcement: enforcement,
            } satisfies OrgSummary),
          ),
        );
        const user = userEvent.setup();
        renderWithProviders(<OrgChartView nodeId="auth" />);
        await findCard("auth");

        await user.click(currentCard());

        const drawer = screen.getByRole("dialog", { name: "auth team" });
        expect(await within(drawer).findByText(text)).toBeInTheDocument();
      },
    );

    it("opens when the team the page is on is clicked, on its first agent, and closes again", async () => {
      memoryHandlers();
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");

      await user.click(currentCard());

      const drawer = screen.getByRole("dialog", { name: "auth team" });
      expect(
        within(drawer).getByRole("button", {
          name: /ORG_CHART\$ROLE_IC/,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        within(drawer).getByText("ORG_CHART$NO_CONVERSATION"),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("conversation-view")).toBeNull();

      await user.click(
        within(drawer).getByRole("button", {
          name: "ORG_CHART$INSPECTOR_CLOSE",
        }),
      );
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("opens from the whole-org view too", async () => {
      useOrgChartStore.setState({ view: "full" });
      memoryHandlers();
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="oauth" />);
      await findCard("oauth");

      await user.click(currentCard());

      expect(
        screen.getByRole("dialog", { name: "oauth team" }),
      ).toBeInTheDocument();
    });

    it("mounts the conversation view targeted at the agent picked", async () => {
      memoryHandlers();
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />, {
        navigation: { conversationId: "route-conversation" },
      });
      await findCard("auth");
      await user.click(currentCard());

      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: /ORG_CHART\$ROLE_MANAGER/,
        }),
      );

      expect(await screen.findByTestId("conversation-view")).toHaveTextContent(
        "conv-manager",
      );
    });

    it("closes on Escape, and when the page moves to another team", async () => {
      memoryHandlers();
      const user = userEvent.setup();
      const { rerender } = renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");

      await user.click(currentCard());
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();

      await user.click(currentCard());
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      rerender(<OrgChartView nodeId="billing" />);
      await waitFor(() => expect(cardIds()).toEqual(["billing"]));
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("lists what the team's two agents reported, and by whom", async () => {
      memoryHandlers([
        {
          at: "2026-11-12T10:00:00+00:00",
          role: "manager",
          text: "Sessions in memory were lost on every restart.",
        },
        {
          at: "2026-11-12T11:00:00+00:00",
          role: "ic",
          text: "Tokens are never logged.",
          compacted: true,
        },
      ]);
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");
      await user.click(currentCard());

      const reports = await screen.findByRole("region", {
        name: "ORG_CHART$REPORTS_TITLE",
      });
      const [first, second] = await within(reports).findAllByRole("listitem");

      expect(first).toHaveTextContent(
        "Sessions in memory were lost on every restart.",
      );
      expect(first).toHaveTextContent("ORG_CHART$ROLE_MANAGER");
      expect(first).not.toHaveTextContent("ORG_CHART$REPORT_COMPACTED");
      expect(second).toHaveTextContent("Tokens are never logged.");
      expect(second).toHaveTextContent("ORG_CHART$ROLE_IC");
      expect(second).toHaveTextContent("ORG_CHART$REPORT_COMPACTED");
      expect(within(reports).queryByRole("textbox")).toBeNull();
    });

    it("says so when the team has reported nothing yet", async () => {
      memoryHandlers();
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");

      await user.click(currentCard());

      expect(
        await screen.findByText("ORG_CHART$REPORTS_EMPTY"),
      ).toBeInTheDocument();
    });

    it("shows what the ICs and Managers around the team wrote, by thread", async () => {
      const at = "2026-11-12T10:00:00+00:00";
      memoryHandlers(
        [],
        [
          {
            manager_node_id: "auth",
            ic_node_id: "auth",
            messages: [
              {
                at,
                sender: "ic",
                text: "Sessions could be a team of its own.",
              },
              {
                at: "2026-11-12T10:05:00+00:00",
                sender: "manager",
                text: "Agreed.",
              },
            ],
          },
          {
            manager_node_id: "auth",
            ic_node_id: "sessions",
            messages: [{ at, sender: "manager", text: "Where do you stand?" }],
          },
          {
            manager_node_id: "root",
            ic_node_id: "auth",
            messages: [{ at, sender: "manager", text: "Search waits on you." }],
          },
        ],
      );
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");
      await user.click(currentCard());

      const messages = await screen.findByRole("region", {
        name: "ORG_CHART$MESSAGES_TITLE",
      });
      const [own, below, above] = within(messages).getAllByRole("group");

      expect(own).toHaveAccessibleName("ORG_CHART$MESSAGES_OWN");
      const [asked, answered] = within(own).getAllByRole("listitem");
      expect(asked).toHaveTextContent("Sessions could be a team of its own.");
      expect(asked).toHaveTextContent("ORG_CHART$ROLE_IC");
      expect(answered).toHaveTextContent("Agreed.");
      expect(answered).toHaveTextContent("ORG_CHART$ROLE_MANAGER");
      expect(below).toHaveAccessibleName("ORG_CHART$MESSAGES_BELOW");
      expect(below).toHaveTextContent("Where do you stand?");
      expect(above).toHaveAccessibleName("ORG_CHART$MESSAGES_ABOVE");
      expect(above).toHaveTextContent("Search waits on you.");
      expect(within(messages).queryByRole("textbox")).toBeNull();
    });

    it("says so when nobody around the team has written yet", async () => {
      memoryHandlers();
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");

      await user.click(currentCard());

      expect(
        await screen.findByText("ORG_CHART$MESSAGES_EMPTY"),
      ).toBeInTheDocument();
    });

    it("explains when the team's memory cannot be read", async () => {
      server.use(
        http.get("*/api/director/org/nodes/:nodeId/memory", () =>
          HttpResponse.json({ detail: "No team memory" }, { status: 503 }),
        ),
        http.get("*/api/director/org/nodes/:nodeId/messages", () =>
          HttpResponse.json({ detail: "No team memory" }, { status: 503 }),
        ),
      );
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");

      await user.click(currentCard());

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "ORG_CHART$REPORTS_UNAVAILABLE",
      );
    });
  });

  describe("who owns what", () => {
    const OWNERSHIP: NodeOwnership = {
      node_id: "root",
      owners: [
        {
          node_id: "auth",
          title: "auth team",
          path: "services/auth",
          isolation: "worktree",
          branch: "agents/auth",
        },
        {
          node_id: "billing",
          title: "billing team",
          path: "services/billing",
          isolation: "worktree",
          branch: "agents/billing",
        },
      ],
      files: [
        { path: "README.md", owner: null },
        { path: "services/auth/login.py", owner: "auth" },
        { path: "services/auth/oauth/token.py", owner: "auth" },
        { path: "services/billing/charge.py", owner: "billing" },
        { path: "services/shared.py", owner: null },
      ],
      truncated: false,
      collisions: [],
      collisions_checked: true,
    };

    function serveOwnership(body: Partial<NodeOwnership> = {}) {
      const asked: string[] = [];
      server.use(
        http.get("*/api/director/org/nodes/:nodeId/ownership", ({ params }) => {
          asked.push(String(params.nodeId));
          return HttpResponse.json({ ...OWNERSHIP, ...body });
        }),
      );
      return asked;
    }

    function ownershipMap() {
      return screen.findByRole("region", { name: "ORG_CHART$OWNERSHIP_TITLE" });
    }

    function ownerOf(row: HTMLElement) {
      return within(row).getByRole("img", {
        name: "ORG_CHART$OWNERSHIP_OWNER",
      });
    }

    it("names each team that owns a directory and leads to it", async () => {
      serveOwnership();
      renderWithProviders(<OrgChartView nodeId={null} />);

      const legend = within(await ownershipMap()).getByTestId(
        "ownership-legend",
      );

      expect(
        within(legend)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual([
        "ORG_CHART$OWNERSHIP_KEPT",
        "auth teamservices/auth",
        "billing teamservices/billing",
      ]);
      expect(
        within(legend).getByRole("link", { name: "billing team" }),
      ).toHaveAttribute("href", "/org/billing");
    });

    it("opens the directories that are divided and closes the ones one team owns", async () => {
      serveOwnership();
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId={null} />);
      const map = await ownershipMap();

      const divided = within(map).getByTestId("ownership-dir-services");
      const owned = within(map).getByTestId("ownership-dir-services/auth");

      expect(divided).toHaveAttribute("aria-expanded", "true");
      expect(owned).toHaveAttribute("aria-expanded", "false");
      // A directory one team owns says so without being opened.
      expect(ownerOf(owned)).toBeInTheDocument();
      expect(
        within(divided).queryByRole("img", {
          name: "ORG_CHART$OWNERSHIP_OWNER",
        }),
      ).toBeNull();
      expect(
        within(map).queryByTestId("ownership-file-services/auth/login.py"),
      ).toBeNull();

      await user.click(owned);

      expect(
        ownerOf(
          within(map).getByTestId("ownership-file-services/auth/login.py"),
        ),
      ).toBeInTheDocument();
    });

    it("gives each team a swatch of its own and what the team kept an outline", async () => {
      serveOwnership();
      renderWithProviders(<OrgChartView nodeId={null} />);
      const map = await ownershipMap();

      const swatch = (testId: string) =>
        ownerOf(within(map).getByTestId(testId)).className;

      expect(swatch("ownership-dir-services/auth")).not.toBe(
        swatch("ownership-dir-services/billing"),
      );
      expect(swatch("ownership-file-README.md")).toBe(
        swatch("ownership-file-services/shared.py"),
      );
      expect(swatch("ownership-file-README.md")).not.toBe(
        swatch("ownership-dir-services/auth"),
      );
    });

    it("warns of files that would conflict, on the map and on the teams' cards", async () => {
      serveOwnership({
        collisions: [
          { path: "services/auth/login.py", node_ids: ["auth", "billing"] },
        ],
      });
      renderWithProviders(<OrgChartView nodeId={null} />);
      const map = await ownershipMap();

      expect(within(map).getByRole("alert")).toHaveTextContent(
        "services/auth/login.py: ORG_CHART$COLLISION_BETWEEN",
      );
      // The directory is closed, so it carries the warning for the file.
      expect(
        within(
          within(map).getByTestId("ownership-dir-services/auth"),
        ).getByRole("img", { name: "ORG_CHART$COLLISIONS" }),
      ).toBeInTheDocument();
      const mark = { name: "ORG_CHART$COLLISION_MARK" };
      expect(within(card("auth")).getByRole("img", mark)).toBeInTheDocument();
      expect(
        within(card("billing")).getByRole("img", mark),
      ).toBeInTheDocument();
      expect(within(card("search")).queryByRole("img", mark)).toBeNull();
      expect(within(card("root")).queryByRole("img", mark)).toBeNull();
    });

    it("says when conflicts were not looked for, when the list is cut, and when there are no files", async () => {
      serveOwnership({ collisions_checked: false, truncated: true, files: [] });
      renderWithProviders(<OrgChartView nodeId={null} />);
      const map = await ownershipMap();

      expect(map).toHaveTextContent("ORG_CHART$COLLISIONS_UNCHECKED");
      expect(map).toHaveTextContent("ORG_CHART$OWNERSHIP_TRUNCATED");
      expect(map).toHaveTextContent("ORG_CHART$OWNERSHIP_EMPTY");
      expect(within(map).queryByRole("alert")).toBeNull();
    });

    it("asks for the team the page is on", async () => {
      const asked = serveOwnership({ node_id: "auth", owners: [] });
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await ownershipMap();

      expect(asked).toEqual(["auth"]);
    });

    it("can be closed, and stays closed on the next visit", async () => {
      serveOwnership();
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId={null} />);
      const map = await ownershipMap();

      await user.click(
        within(map).getByRole("button", { name: /ORG_CHART\$OWNERSHIP_TITLE/ }),
      );

      expect(within(map).queryByTestId("ownership-legend")).toBeNull();
      expect(
        JSON.parse(window.localStorage.getItem("openhands-org-chart")!).state,
      ).toMatchObject({ ownershipOpen: false });
    });

    it("draws no map when the server does not have one", async () => {
      server.use(
        http.get("*/api/director/org/nodes/:nodeId/ownership", () =>
          HttpResponse.json({ detail: "Not Found" }, { status: 404 }),
        ),
      );
      renderWithProviders(<OrgChartView nodeId={null} />);
      await findCard("root");
      await findCard("auth");

      expect(
        screen.queryByRole("region", { name: "ORG_CHART$OWNERSHIP_TITLE" }),
      ).toBeNull();
    });
  });

  describe("the review of finished work", () => {
    const REVIEW: Review = {
      state: "changes_requested",
      round: 2,
      summary: "Tokens are issued.",
      description: "Tokens now carry an **expiry** in `token.py`.",
      automated_ran: true,
      automated: [
        {
          path: "services/auth/token.py",
          line: 12,
          issue: "The token never expires.",
          evidence: "expires_at = None",
        },
      ],
      findings: [
        { path: "", line: null, issue: "Add a refresh test.", evidence: "" },
      ],
      at: "2026-11-12T10:00:00+00:00",
    };

    it("puts no mark for a review on a card", async () => {
      store.upsert({
        ...input("auth", "root", "working", "services/auth"),
        review: REVIEW,
      });
      store.upsert({
        ...input("search", "root", "done", "services/search"),
        review: { ...REVIEW, state: "pending", round: 1 },
      });
      store.upsert({
        ...input("billing", "root", "done", "services/billing"),
        review: { ...REVIEW, state: "accepted" },
      });
      renderWithProviders(<OrgChartView nodeId="root" />);
      await findCard("auth");

      const marks = ["auth", "search", "billing"].flatMap((id) =>
        within(card(id)).queryAllByRole("img"),
      );
      expect(marks).toEqual([]);
    });

    it("says in the team's details where the review stands and what was found", async () => {
      memoryHandlers();
      store.upsert({
        ...input("auth", "root", "working", "services/auth"),
        review: REVIEW,
      });
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");

      await user.click(currentCard());

      const review = within(screen.getByRole("dialog")).getByRole("region", {
        name: "ORG_CHART$REVIEW",
      });
      expect(review).toHaveTextContent(
        "ORG_CHART$REVIEW_CHANGES_REQUESTED · ORG_CHART$REVIEW_ROUND",
      );
      expect(review).toHaveTextContent("Tokens are issued.");
      expect(review).toHaveTextContent("ORG_CHART$REVIEW_DESCRIPTION");
      expect(review).toHaveTextContent(
        "Tokens now carry an expiry in token.py.",
      );
      expect(review).toHaveTextContent("Add a refresh test.");
      expect(review).toHaveTextContent("services/auth/token.py:12");
      expect(review).toHaveTextContent("The token never expires.");
      expect(review).toHaveTextContent("expires_at = None");
    });

    it("says when the automated review found nothing, and when it did not run", async () => {
      memoryHandlers();
      store.upsert({
        ...input("auth", "root", "done", "services/auth"),
        review: { ...REVIEW, state: "pending", round: 1, automated: [] },
      });
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");
      await user.click(currentCard());
      const review = within(screen.getByRole("dialog")).getByRole("region", {
        name: "ORG_CHART$REVIEW",
      });

      expect(review).toHaveTextContent("ORG_CHART$REVIEW_AUTOMATED_NONE");
      expect(review).not.toHaveTextContent("ORG_CHART$REVIEW_ROUND");

      act(() => {
        store.upsert({
          ...input("auth", "root", "done", "services/auth"),
          review: {
            ...REVIEW,
            state: "pending",
            round: 1,
            automated: [],
            automated_ran: false,
          },
        });
      });

      await waitFor(() =>
        expect(review).toHaveTextContent("ORG_CHART$REVIEW_AUTOMATED_SKIPPED"),
      );
    });

    it("shows no review for a team that has reported nothing", async () => {
      memoryHandlers();
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");

      await user.click(currentCard());

      expect(
        within(screen.getByRole("dialog")).queryByRole("region", {
          name: "ORG_CHART$REVIEW",
        }),
      ).toBeNull();
    });
  });

  describe("what a team works to", () => {
    function specHandlers(memory: Partial<NodeMemory>) {
      server.use(
        http.get("*/api/director/org/nodes/:nodeId/memory", () =>
          HttpResponse.json({
            specs: [],
            ...memory,
          } satisfies NodeMemory),
        ),
      );
    }

    async function openSpec() {
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");
      await user.click(currentCard());
      return screen.findByRole("region", { name: "ORG_CHART$SPEC_TITLE" });
    }

    it("lets the team's spec and both sets of contracts be read", async () => {
      specHandlers({
        specs: [
          {
            path: "services/auth",
            spec: "Tokens are opaque.",
            readonly: false,
          },
        ],
        contracts: [
          { path: "", contracts: "POST /login returns a token.", own: false },
          {
            path: "services/auth",
            contracts: "OAuth hands over a user id.",
            own: true,
          },
        ],
      });

      const section = await openSpec();

      expect(section).toHaveTextContent("ORG_CHART$SPEC_OPEN");
      expect(section).toHaveTextContent("Tokens are opaque.");
      expect(
        within(section)
          .getByText("ORG_CHART$CONTRACTS_ABOVE")
          .closest("details"),
      ).toHaveTextContent("POST /login returns a token.");
      expect(
        within(section).getByText("ORG_CHART$CONTRACTS_OWN").closest("details"),
      ).toHaveTextContent("OAuth hands over a user id.");
    });

    it("says so when the team has written no spec", async () => {
      specHandlers({});

      const section = await openSpec();

      expect(section).toHaveTextContent("ORG_CHART$SPEC_EMPTY");
      expect(within(section).queryByRole("group")).toBeNull();
    });

    it("says whose conversation a message goes to, once that agent has one", async () => {
      memoryHandlers();
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="auth" />);
      await findCard("auth");
      await user.click(currentCard());
      const drawer = screen.getByRole("dialog");

      expect(
        within(drawer).queryByText("ORG_CHART$MESSAGE_AGENT_HINT"),
      ).toBeNull();

      await user.click(
        within(drawer).getByRole("button", { name: /ORG_CHART\$ROLE_MANAGER/ }),
      );

      expect(
        within(drawer).getByText("ORG_CHART$MESSAGE_AGENT_HINT"),
      ).toBeInTheDocument();
      expect(await screen.findByTestId("conversation-view")).toHaveTextContent(
        "conv-manager",
      );
    });
  });

  describe("sharing the org's memory", () => {
    function liveOrg() {
      server.use(
        http.get("*/api/director/org", () =>
          HttpResponse.json({
            root_id: "root",
            node_count: 5,
            repo_path: "/work/shop",
            is_git_repository: true,
            fixture: false,
            boundary_enforcement: "checks",
          } satisfies OrgSummary),
        ),
      );
    }

    const SYNCED: OrgSync = {
      remote: "origin",
      result: "up_to_date",
      merge: null,
      memory: null,
      branches: [],
      put_aside: [],
    };

    function sharing() {
      return screen.findByRole("group", { name: "ORG_CHART$SYNC_LABEL" });
    }

    it("pulls from origin and says what came of it", async () => {
      liveOrg();
      const asked: unknown[] = [];
      server.use(
        http.post("*/api/director/org/pull", async ({ request }) => {
          asked.push(await request.json());
          return HttpResponse.json({
            ...SYNCED,
            result: "merged",
            memory: {
              remote: "origin",
              head: "abc",
              changed: true,
              kept_local: ["services/auth/spec.md"],
              pushed: false,
            },
            branches: [
              {
                node_id: "apps.web",
                title: "Web",
                branch: "web",
                result: "diverged",
              },
            ],
          } satisfies OrgSync);
        }),
      );
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="root" />);

      await user.click(
        within(await sharing()).getByRole("button", {
          name: "ORG_CHART$SYNC_PULL",
        }),
      );

      const outcome = await screen.findByText(/ORG_CHART\$SYNC_PULLED/);
      expect(outcome).toHaveTextContent("ORG_CHART$SYNC_KEPT_LOCAL");
      expect(outcome).toHaveTextContent("ORG_CHART$SYNC_DIVERGED");
      expect(asked).toEqual([{ remote: "origin" }]);
    });

    it("pushes to origin, and says when there was nothing new or it failed", async () => {
      liveOrg();
      let fail = 0;
      server.use(
        http.post("*/api/director/org/push", () =>
          fail
            ? HttpResponse.json({ detail: fail }, { status: fail })
            : HttpResponse.json({ ...SYNCED, result: "pushed" }),
        ),
        http.post("*/api/director/org/pull", () => HttpResponse.json(SYNCED)),
      );
      const user = userEvent.setup();
      renderWithProviders(<OrgChartView nodeId="root" />);
      const group = await sharing();
      const push = within(group).getByRole("button", {
        name: "ORG_CHART$SYNC_PUSH",
      });

      await user.click(push);
      expect(
        await screen.findByText("ORG_CHART$SYNC_PUSHED"),
      ).toBeInTheDocument();

      await user.click(
        within(group).getByRole("button", {
          name: "ORG_CHART$SYNC_PULL",
        }),
      );
      expect(
        await screen.findByText("ORG_CHART$SYNC_UP_TO_DATE"),
      ).toBeInTheDocument();

      fail = 502;
      await user.click(push);
      expect(await screen.findByText("ORG_CHART$SYNC_ERROR")).toHaveAttribute(
        "role",
        "alert",
      );
      expect(screen.queryByText("ORG_CHART$SYNC_UP_TO_DATE")).toBeNull();

      // The remote has what is not here, or a merge waits.
      fail = 409;
      await user.click(push);
      expect(await screen.findByText("ORG_CHART$SYNC_REFUSED")).toHaveAttribute(
        "role",
        "alert",
      );
    });

    it("is not offered for the sample org", async () => {
      renderWithProviders(<OrgChartView nodeId="root" />);
      await findCard("root");
      await screen.findByText(/ORG_CHART\$TALK_HINT/);

      expect(
        screen.queryByRole("group", { name: "ORG_CHART$SYNC_LABEL" }),
      ).toBeNull();
    });
  });
});

describe("mock mode", () => {
  it("renders both views from the built-in mock handlers and shows what a team reported", async () => {
    // No per-test stream handler: this exercises the default mock handlers.
    server.resetHandlers();
    const user = userEvent.setup();

    renderWithProviders(<OrgChartView nodeId="payments" />);

    expect(await findCard("payments.worker")).toBeInTheDocument();
    expect(cardIds()).toHaveLength(4);
    expect(
      within(
        await screen.findByRole("region", {
          name: "ORG_CHART$OWNERSHIP_TITLE",
        }),
      ).getByTestId("ownership-dir-services/payments/worker"),
    ).toBeInTheDocument();
    // One escalation has reached the human; the other is still with a team.
    expect(within(escalations()).getAllByRole("listitem")).toHaveLength(1);

    await showWholeOrg(user);
    await findCard("identity.api");
    expect(cardIds()).toHaveLength(17);

    await user.click(currentCard());

    expect(
      await screen.findByText("Idempotency keys on every write."),
    ).toBeInTheDocument();
  });
});
