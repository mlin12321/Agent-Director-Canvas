import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { HistoryEvent, OrgNode } from "#/api/director/types";
import { MessageToTeam } from "#/components/features/org-chart/message-to-team";
import { OrgHistoryPanel } from "#/components/features/org-chart/org-history";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";

function team(id: string, title: string, path: string): OrgNode {
  return {
    id,
    parent_id: id === "root" ? null : "root",
    title,
    boundary: { path, writable: ["**"], readonly: [] },
    isolation: "shared",
    worktree_path: "/work",
    branch: "",
    agents: [{ role: "ic", conversation_id: "c", status: "idle" }],
    status: "idle",
    spec_summary: "",
    escalations: [],
    pending_split: null,
    child_ids: [],
    descendant_counts: { idle: 0, working: 0, done: 0, blocked: 0 },
    escalation_count: 0,
  };
}

const ROOT = team("root", "Shop", "");
const API = team("services.api", "API", "services/api");
const NODES = new Map([
  [ROOT.id, ROOT],
  [API.id, API],
]);

function happened(
  at: string,
  kind: HistoryEvent["kind"],
  rest: Partial<HistoryEvent> = {},
): HistoryEvent {
  return {
    at,
    kind,
    team_id: API.id,
    team: API.title,
    above_id: ROOT.id,
    above: ROOT.title,
    ...rest,
  };
}

describe("OrgHistoryPanel", () => {
  it("lists what happened, newest first, and reads further back on request", async () => {
    const asked: (string | null)[] = [];
    const latest = [
      happened("2026-11-01T12:00:00+00:00", "sent_back", {
        detail: "round 1, 2 to change",
      }),
      happened("2026-11-01T11:00:00+00:00", "declined", {
        team_id: "",
        team: "",
        detail: "API, Web: too small",
      }),
      // A team that is gone is named, not linked.
      happened("2026-11-01T10:00:00+00:00", "pruned", {
        team_id: "apps.web",
        team: "Web",
      }),
    ];
    server.use(
      http.get("*/api/director/org/history", ({ request }) => {
        const before = new URL(request.url).searchParams.get("before");
        asked.push(before);
        return HttpResponse.json(
          before
            ? {
                events: [happened("2026-11-01T09:00:00+00:00", "set_up")],
                earlier: false,
              }
            : { events: latest, earlier: true },
        );
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<OrgHistoryPanel nodes={NODES} />);

    const panel = await screen.findByTestId("org-history");
    const lines = await within(panel).findAllByRole("listitem");
    expect(lines.map((line) => line.textContent)).toEqual([
      expect.stringContaining(
        "APIORG_CHART$HISTORY_SENT_BACK (round 1, 2 to change)",
      ),
      // About no single team: told of the team it is kept under.
      expect.stringContaining("ShopORG_CHART$TEAM_RECORD_DECLINED"),
      expect.stringContaining("WebORG_CHART$HISTORY_PRUNED"),
    ]);
    expect(within(panel).getByRole("link", { name: "API" })).toHaveAttribute(
      "href",
      "/org/services.api",
    );
    expect(within(panel).queryByRole("link", { name: "Web" })).toBeNull();

    await user.click(
      within(panel).getByRole("button", { name: "ORG_CHART$HISTORY_EARLIER" }),
    );

    await waitFor(() =>
      expect(within(panel).getAllByRole("listitem")).toHaveLength(4),
    );
    expect(asked).toEqual([null, "2026-11-01T10:00:00+00:00"]);
    expect(
      within(panel).queryByRole("button", {
        name: "ORG_CHART$HISTORY_EARLIER",
      }),
    ).toBeNull();
  });

  it("says so when nothing has happened or the history cannot be read", async () => {
    server.use(
      http.get("*/api/director/org/history", () =>
        HttpResponse.json({ events: [], earlier: false }),
      ),
    );
    const { unmount } = renderWithProviders(<OrgHistoryPanel nodes={NODES} />);
    expect(
      await screen.findByText("ORG_CHART$HISTORY_EMPTY"),
    ).toBeInTheDocument();
    unmount();

    server.use(
      http.get("*/api/director/org/history", () =>
        HttpResponse.json({ detail: "no memory" }, { status: 503 }),
      ),
    );
    renderWithProviders(<OrgHistoryPanel nodes={NODES} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ORG_CHART$HISTORY_ERROR",
    );
  });
});

describe("MessageToTeam", () => {
  it("sends what is written from the team's directory and names who took it", async () => {
    const sent: unknown[] = [];
    server.use(
      http.post("*/api/director/org/messages", async ({ request }) => {
        sent.push(await request.json());
        // The team's IC is lost here, so the team above took it.
        return HttpResponse.json({
          node_id: "root",
          conversation_id: "c",
          started_org: false,
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<MessageToTeam node={API} nodes={NODES} />);
    const box = screen.getByLabelText("ORG_CHART$MESSAGE_LABEL");
    const send = screen.getByRole("button", { name: "ORG_CHART$MESSAGE_SEND" });

    expect(send).toBeDisabled();
    await user.type(box, "  Use the new price list.  ");
    await user.click(send);

    await waitFor(() =>
      expect(sent).toEqual([
        { text: "Use the new price list.", path: "services/api" },
      ]),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "ORG_CHART$MESSAGE_SENT",
    );
    expect(box).toHaveValue("");
  });

  it("keeps what was written and says why when the server refuses it", async () => {
    server.use(
      http.post("*/api/director/org/messages", () =>
        HttpResponse.json(
          { detail: "No team here can take a message." },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<MessageToTeam node={API} nodes={NODES} />);
    const box = screen.getByLabelText("ORG_CHART$MESSAGE_LABEL");

    await user.type(box, "Hello");
    await user.click(
      screen.getByRole("button", { name: "ORG_CHART$MESSAGE_SEND" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No team here can take a message.",
    );
    expect(box).toHaveValue("Hello");
  });
});
