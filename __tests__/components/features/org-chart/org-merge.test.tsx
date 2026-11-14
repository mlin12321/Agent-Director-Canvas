import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type {
  OrgMerge,
  OrgSummary,
  OrgSync as SyncResult,
} from "#/api/director/types";
import { MergeConflicts } from "#/components/features/org-chart/org-merge";
import { OrgSync } from "#/components/features/org-chart/org-sync";
import { StartOrgNotice } from "#/components/features/org-chart/start-org-notice";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";

const MERGE: OrgMerge = {
  remote: "origin",
  conflicts: [
    {
      id: "field:services.api:headline",
      kind: "field",
      node_id: "services.api",
      title: "API",
      field: "headline",
      mine: "Routes are done",
      theirs: "Routes need auth",
      choice: null,
    },
    {
      id: "team:apps.web",
      kind: "team",
      node_id: "apps.web",
      title: "Web",
      field: "",
      mine: null,
      theirs: "The team is kept, with what was changed in it or below it.",
      choice: null,
    },
  ],
};

const DONE: SyncResult = {
  remote: "origin",
  result: "merged",
  merge: null,
  memory: null,
  branches: [],
  put_aside: [],
};

/** A director with a merge that waits; records how it was settled. */
function mergeHandlers(status = 200) {
  const asked: unknown[] = [];
  server.use(
    http.get("*/api/director/org/merge", () => HttpResponse.json(MERGE)),
    http.post("*/api/director/org/merge/resolve", async ({ request }) => {
      asked.push(await request.json());
      return HttpResponse.json(DONE, { status });
    }),
    http.post("*/api/director/org/merge/abort", () => {
      asked.push("abort");
      return HttpResponse.json({ ...DONE, result: "up_to_date" });
    }),
  );
  return asked;
}

function conflict(id: string) {
  return screen.findByTestId(`org-conflict-${id}`);
}

describe("MergeConflicts", () => {
  it("shows both sides of each conflict, and a removed team in words", async () => {
    mergeHandlers();
    renderWithProviders(<MergeConflicts />);

    const field = await conflict("field:services.api:headline");
    const team = await conflict("team:apps.web");

    expect(field).toHaveTextContent("API · headline");
    expect(field).toHaveTextContent("Routes are done");
    expect(field).toHaveTextContent("Routes need auth");
    expect(team).toHaveTextContent("ORG_CHART$MERGE_REMOVED");
    expect(team).toHaveTextContent("ORG_CHART$MERGE_KEPT");
  });

  it("finishes only once every conflict has a side, with the sides chosen", async () => {
    const asked = mergeHandlers();
    const user = userEvent.setup();
    renderWithProviders(<MergeConflicts />);
    const finish = await screen.findByRole("button", {
      name: "ORG_CHART$MERGE_FINISH",
    });

    await user.click(
      within(await conflict("field:services.api:headline")).getByRole("radio", {
        name: "ORG_CHART$MERGE_THEIRS",
      }),
    );
    expect(finish).toBeDisabled();
    await user.click(
      within(await conflict("team:apps.web")).getByRole("radio", {
        name: "ORG_CHART$MERGE_MINE",
      }),
    );
    await user.click(finish);

    await waitFor(() =>
      expect(asked).toEqual([
        {
          choices: {
            "field:services.api:headline": "theirs",
            "team:apps.web": "mine",
          },
        },
      ]),
    );
  });

  it("takes one side for everything", async () => {
    const asked = mergeHandlers();
    const user = userEvent.setup();
    renderWithProviders(<MergeConflicts />);

    await user.click(
      await screen.findByRole("button", { name: "ORG_CHART$MERGE_ALL_THEIRS" }),
    );
    await user.click(
      screen.getByRole("button", { name: "ORG_CHART$MERGE_FINISH" }),
    );

    await waitFor(() =>
      expect(asked).toEqual([
        {
          choices: {
            "field:services.api:headline": "theirs",
            "team:apps.web": "theirs",
          },
        },
      ]),
    );
  });

  it("abandons the merge, and says when it could not be finished", async () => {
    const asked = mergeHandlers(409);
    const user = userEvent.setup();
    renderWithProviders(<MergeConflicts />);

    await user.click(
      await screen.findByRole("button", { name: "ORG_CHART$MERGE_ALL_MINE" }),
    );
    await user.click(
      screen.getByRole("button", { name: "ORG_CHART$MERGE_FINISH" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ORG_CHART$MERGE_ERROR",
    );
    await user.click(
      screen.getByRole("button", { name: "ORG_CHART$MERGE_ABORT" }),
    );

    await waitFor(() => expect(asked).toContain("abort"));
  });

  it("shows nothing when no merge waits", async () => {
    server.use(
      http.get("*/api/director/org/merge", () => HttpResponse.json(null)),
    );
    renderWithProviders(<MergeConflicts />);

    await waitFor(() => expect(screen.queryByTestId("org-merge")).toBeNull());
  });
});

describe("OrgSync", () => {
  it("says that a pull stopped on conflicts only while the merge waits", async () => {
    server.use(
      http.post("*/api/director/org/pull", () =>
        HttpResponse.json({ ...DONE, result: "conflicts", merge: MERGE }),
      ),
    );
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<OrgSync merging />);

    await user.click(
      screen.getByRole("button", { name: "ORG_CHART$SYNC_PULL" }),
    );
    expect(
      await screen.findByText("ORG_CHART$SYNC_CONFLICTS"),
    ).toBeInTheDocument();
    rerender(<OrgSync merging={false} />);

    expect(screen.queryByText("ORG_CHART$SYNC_CONFLICTS")).toBeNull();
  });
});

describe("StartOrgNotice", () => {
  it("offers to pull the org of a clone, and not to push", async () => {
    const asked: string[] = [];
    server.use(
      http.post("*/api/director/org/pull", () => {
        asked.push("pull");
        return HttpResponse.json({ ...DONE, result: "fast_forward" });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <StartOrgNotice
        org={
          {
            root_id: null,
            node_count: 0,
            repo_path: "/work/shop",
            directory: "",
            is_git_repository: true,
            fixture: false,
            boundary_enforcement: "checks",
          } satisfies OrgSummary
        }
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "ORG_CHART$SYNC_PULL" }),
    );

    expect(
      await screen.findByText("ORG_CHART$SYNC_PULLED"),
    ).toBeInTheDocument();
    expect(asked).toEqual(["pull"]);
    expect(
      screen.queryByRole("button", { name: "ORG_CHART$SYNC_PUSH" }),
    ).toBeNull();
  });
});
