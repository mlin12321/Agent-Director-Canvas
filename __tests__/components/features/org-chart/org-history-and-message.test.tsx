import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import type { HistoryEvent, OrgNode } from "#/api/director/types";
import { MessageToTeam } from "#/components/features/org-chart/message-to-team";
import { OrgHistoryPanel } from "#/components/features/org-chart/org-history";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";

function team(id: string, title: string, path: string): OrgNode {
  return {
    agent_type: "software-engineer",
    id,
    parent_id: id === "root" ? null : "root",
    title,
    boundary: { path, writable: ["**"], readonly: [] },
    isolation: "shared",
    purpose: "",
    left_documents: [],
    headline: "",
    agent_profile: null,
    child_ids: [],
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

// A section remembers how it was left; no test starts from another's.
afterEach(() => {
  localStorage.clear();
});

describe("OrgHistoryPanel", () => {
  it("lists what happened, newest first, and reads further back on request", async () => {
    const asked: (string | null)[] = [];
    const latest = [
      // Of a session whose work is not accepted yet: it is not the org's.
      happened("2026-11-01T12:00:00+00:00", "sent_back", {
        detail: "round 1, 2 to change",
        unaccepted: true,
      }),
      happened("2026-11-01T11:00:00+00:00", "declined", {
        team_id: "",
        team: "",
        detail: "API, Web: too small",
      }),
      happened("2026-11-01T10:10:00+00:00", "asked", {
        detail: "Add refunds",
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
    renderWithProviders(<OrgHistoryPanel startsOpen nodes={NODES} />);

    const panel = await screen.findByTestId("org-history");
    const lines = await within(panel).findAllByRole("listitem");
    expect(lines.map((line) => line.textContent)).toEqual([
      expect.stringContaining(
        "APIORG_CHART$HISTORY_SENT_BACK (round 1, 2 to change)",
      ),
      // About no single team: told of the team it is kept under.
      expect.stringContaining("ShopORG_CHART$TEAM_RECORD_DECLINED"),
      expect.stringContaining("APIORG_CHART$HISTORY_ASKED (Add refunds)"),
      expect.stringContaining("WebORG_CHART$HISTORY_PRUNED"),
    ]);
    expect(lines[0]).toHaveTextContent("ORG_CHART$EVENT_UNACCEPTED");
    expect(lines[1]).not.toHaveTextContent("ORG_CHART$EVENT_UNACCEPTED");
    expect(
      within(panel).getAllByRole("link", { name: "API" })[0],
    ).toHaveAttribute("href", "/org/services.api");
    expect(within(panel).queryByRole("link", { name: "Web" })).toBeNull();

    await user.click(
      within(panel).getByRole("button", { name: "ORG_CHART$HISTORY_EARLIER" }),
    );

    await waitFor(() =>
      expect(within(panel).getAllByRole("listitem")).toHaveLength(5),
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
    const { unmount } = renderWithProviders(
      <OrgHistoryPanel startsOpen nodes={NODES} />,
    );
    expect(
      await screen.findByText("ORG_CHART$HISTORY_EMPTY"),
    ).toBeInTheDocument();
    unmount();

    server.use(
      http.get("*/api/director/org/history", () =>
        HttpResponse.json({ detail: "no memory" }, { status: 503 }),
      ),
    );
    renderWithProviders(<OrgHistoryPanel startsOpen nodes={NODES} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ORG_CHART$HISTORY_ERROR",
    );
  });

  it("is closed until it is opened, and asks for nothing while closed", async () => {
    let asked = 0;
    server.use(
      http.get("*/api/director/org/history", () => {
        asked += 1;
        return HttpResponse.json({ events: [], earlier: false });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<OrgHistoryPanel nodes={NODES} />);

    const toggle = screen.getByTestId("org-history-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(asked).toBe(0);

    await user.click(toggle);

    expect(
      await screen.findByText("ORG_CHART$HISTORY_EMPTY"),
    ).toBeInTheDocument();
    expect(asked).toBe(1);
  });
});

describe("MessageToTeam", () => {
  it("keeps what was written and says why when the server refuses it", async () => {
    server.use(
      http.post("*/api/director/org/sessions", () =>
        HttpResponse.json(
          { detail: "No team here can take a message." },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<MessageToTeam node={API} />);
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

  it("keeps what was written while a request was being sent", async () => {
    let answer: () => void = () => {};
    server.use(
      http.post("*/api/director/org/sessions", async () => {
        await new Promise<void>((resolve) => {
          answer = resolve;
        });
        return HttpResponse.json({
          conversation_id: "c1",
          session: { title: "Hello", team: "API" },
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<MessageToTeam node={API} />);
    const box = screen.getByLabelText("ORG_CHART$MESSAGE_LABEL");
    await user.type(box, "Hello");
    await user.click(
      screen.getByRole("button", { name: "ORG_CHART$MESSAGE_SEND" }),
    );

    await user.clear(box);
    await user.type(box, "Next");
    answer();

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(box).toHaveValue("Next");
  });
});
