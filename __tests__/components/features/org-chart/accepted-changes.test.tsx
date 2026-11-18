import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HistoryEvent, OrgNode } from "#/api/director/types";
import { OrgHistoryPanel } from "#/components/features/org-chart/org-history";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";

vi.mock("@monaco-editor/react", () => ({
  DiffEditor: (props: Record<string, unknown>) => (
    <div
      data-testid="file-diff-viewer"
      data-original={props.original}
      data-modified={props.modified}
    />
  ),
  Editor: () => null,
}));

const NODES = new Map<string, OrgNode>();
const BASE = "1111111111111111111111111111111111111111";
const HEAD = "2222222222222222222222222222222222222222";

function accepted(rest: Partial<HistoryEvent> = {}): HistoryEvent {
  return {
    at: "2026-11-17T10:00:00+00:00",
    kind: "accepted",
    team_id: "services.api",
    team: "API",
    above_id: "root",
    above: "Shop",
    detail: "at the first review",
    paths: ["services/api"],
    base: BASE,
    head: HEAD,
    ...rest,
  };
}

/** A director whose history is `events`; records what is asked of an accept. */
function serve(events: HistoryEvent[], status = 200) {
  const asked: string[] = [];
  server.use(
    http.get("*/api/director/org/history", () =>
      HttpResponse.json({ events, earlier: false }),
    ),
    http.get("*/api/director/org/accepted/changes", ({ request }) => {
      asked.push(new URL(request.url).search);
      return status === 200
        ? HttpResponse.json({
            base: BASE,
            head: HEAD,
            files: [
              {
                path: "services/api/app.py",
                kind: "modified",
                added: 2,
                removed: 1,
                committed: true,
              },
            ],
            truncated: false,
          })
        : HttpResponse.json({ detail: "gone" }, { status });
    }),
    http.get("*/api/director/org/accepted/changes/file", ({ request }) => {
      asked.push(new URL(request.url).search);
      return HttpResponse.json({
        path: "services/api/app.py",
        before: "old\n",
        after: "new\n",
        unreadable: false,
      });
    }),
  );
  return asked;
}

afterEach(() => {
  localStorage.clear();
});

describe("what an accept in the history took", () => {
  it("lists the files of an accept when asked, and shows one file's two sides", async () => {
    const asked = serve([accepted()]);
    const user = userEvent.setup();
    renderWithProviders(<OrgHistoryPanel startsOpen nodes={NODES} />);

    const files = await screen.findByTestId("org-history-files");
    // Nothing is read until it is asked for.
    expect(asked).toEqual([]);
    expect(files).toHaveAttribute("aria-expanded", "false");

    await user.click(files);
    const row = await screen.findByTestId("accepted-file");
    expect(row).toHaveTextContent("services/api/app.py");
    expect(asked).toEqual([`?base=${BASE}&head=${HEAD}&path=services%2Fapi`]);

    await user.click(within(row).getByText("services/api/app.py"));
    const diff = await screen.findByTestId("file-diff-viewer");
    expect(diff).toHaveAttribute("data-original", "old\n");
    expect(diff).toHaveAttribute("data-modified", "new\n");
    expect(asked[1]).toBe(
      `?base=${BASE}&head=${HEAD}&path=services%2Fapi%2Fapp.py`,
    );
    // What was accepted is not edited.
    expect(screen.queryByTestId("view-mode-edit")).toBeNull();

    await user.click(files);
    expect(screen.queryByTestId("accepted-changes")).toBeNull();
  });

  it("offers no files for an accept without its commits, or for another event", async () => {
    serve([
      accepted({ base: "", head: "" }),
      accepted({ kind: "sent_back", at: "2026-11-17T09:00:00+00:00" }),
    ]);
    renderWithProviders(<OrgHistoryPanel startsOpen nodes={NODES} />);

    await screen.findByText(/ORG_CHART\$HISTORY_SENT_BACK/);
    expect(screen.queryByTestId("org-history-files")).toBeNull();
  });

  it("says so when the repository no longer has what was accepted", async () => {
    serve([accepted()], 404);
    const user = userEvent.setup();
    renderWithProviders(<OrgHistoryPanel startsOpen nodes={NODES} />);

    await user.click(await screen.findByTestId("org-history-files"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ORG_CHART$ACCEPTED_ERROR",
    );
  });
});
