import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { ChangedFile, OrgNode } from "#/api/director/types";
import { TeamChanges } from "#/components/features/org-chart/team-changes";
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
  Editor: (props: Record<string, unknown>) =>
    props["data-testid"] === "file-edit-editor" ? (
      <textarea
        data-testid="file-edit-editor"
        defaultValue={String(props.defaultValue)}
        onChange={(event) =>
          (props.onChange as (value: string) => void)(event.target.value)
        }
      />
    ) : (
      <div data-testid="file-single-viewer" data-value={props.value} />
    ),
}));

const NODE: OrgNode = {
  id: "services.api",
  parent_id: "root",
  title: "API",
  boundary: { path: "services/api", writable: ["**"], readonly: [] },
  isolation: "worktree",
  worktree_path: "/work/api",
  branch: "agents/api",
  agents: [
    { role: "ic", conversation_id: null, status: "idle", kind: "openhands" },
  ],
  status: "working",
  spec_summary: "",
  escalations: [],
  pending_split: null,
  review: null,
  waiting_to_start: false,
  old_specs: [],
  child_ids: [],
  descendant_counts: { idle: 0, working: 0, done: 0, blocked: 0 },
  escalation_count: 0,
};

const file = (path: string, given: Partial<ChangedFile> = {}): ChangedFile => ({
  path,
  kind: "modified",
  added: 1,
  removed: 1,
  committed: true,
  ...given,
});

function serve(files: ChangedFile[]) {
  server.use(
    http.get("*/api/director/org/nodes/:nodeId/changes", () =>
      HttpResponse.json({
        node_id: NODE.id,
        base: "abc",
        files,
        truncated: false,
      }),
    ),
    http.get("*/api/director/org/nodes/:nodeId/changes/file", ({ request }) =>
      HttpResponse.json({
        path: new URL(request.url).searchParams.get("path"),
        before: "old\n",
        after: "new\n",
        unreadable: false,
      }),
    ),
  );
}

describe("TeamChanges", () => {
  it("lists the team's changed files and shows one file's two sides", async () => {
    serve([
      file("services/api/app.py"),
      file("services/api/wip.py", { kind: "added", committed: false }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<TeamChanges node={NODE} />);

    const rows = await screen.findAllByTestId("team-changed-file");
    expect(rows.map((row) => row.textContent)).toEqual([
      "services/api/app.py",
      "services/api/wip.pyORG_CHART$CHANGES_UNCOMMITTED",
    ]);

    await user.click(screen.getAllByTestId("collapse")[0]);
    const diff = await screen.findByTestId("file-diff-viewer");
    expect(diff).toHaveAttribute("data-original", "old\n");
    expect(diff).toHaveAttribute("data-modified", "new\n");
  });

  it("says so when the team has changed nothing", async () => {
    serve([]);
    renderWithProviders(<TeamChanges node={NODE} />);

    expect(
      await screen.findByText("ORG_CHART$CHANGES_NONE"),
    ).toBeInTheDocument();
  });

  it("saves a file edited by hand and goes back to the diff", async () => {
    serve([file("services/api/app.py")]);
    const saved: { path: string | null; content: string }[] = [];
    server.use(
      http.put(
        "*/api/director/org/nodes/:nodeId/files",
        async ({ request }) => {
          const body = (await request.json()) as { content: string };
          const path = new URL(request.url).searchParams.get("path");
          saved.push({ path, content: body.content });
          return HttpResponse.json({ path, commit: "def" });
        },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<TeamChanges node={NODE} />);

    await user.click(await screen.findByTestId("collapse"));
    await screen.findByTestId("file-diff-viewer");
    await user.click(screen.getByTestId("view-mode-edit"));
    const editor = screen.getByTestId("file-edit-editor");
    expect(editor).toHaveValue("new\n");
    expect(screen.getByTestId("file-edit-save")).toBeDisabled();
    await user.type(editor, "mine");
    await user.click(screen.getByTestId("file-edit-save"));

    await waitFor(() =>
      expect(saved).toEqual([
        { path: "services/api/app.py", content: "new\nmine" },
      ]),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("file-edit-editor")).toBeNull(),
    );
  });

  it("keeps the edit and shows the server's reason when a save is refused", async () => {
    serve([file("services/api/app.py")]);
    server.use(
      http.put("*/api/director/org/nodes/:nodeId/files", () =>
        HttpResponse.json(
          { detail: "An agent of team 'API' is working." },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<TeamChanges node={NODE} />);

    await user.click(await screen.findByTestId("collapse"));
    await screen.findByTestId("file-diff-viewer");
    await user.click(screen.getByTestId("view-mode-edit"));
    await user.type(screen.getByTestId("file-edit-editor"), "x");
    await user.click(screen.getByTestId("file-edit-save"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An agent of team 'API' is working.",
    );
    expect(screen.getByTestId("file-edit-editor")).toHaveValue("new\nx");
  });

  it("offers no editing for a deleted file", async () => {
    serve([file("services/api/gone.py", { kind: "deleted" })]);
    renderWithProviders(<TeamChanges node={NODE} />);

    await screen.findByTestId("team-changed-file");
    expect(screen.queryByTestId("view-mode-edit")).toBeNull();
  });
});
