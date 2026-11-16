import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type {
  DirectorSettingsState,
  OrgNode,
  Recovery,
} from "#/api/director/types";
import { NodeCard } from "#/components/features/org-chart/node-card";
import {
  PauseButton,
  PausedBanner,
} from "#/components/features/org-chart/org-pause";
import { OrgSettings } from "#/components/features/org-chart/org-settings";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";

const HELD: Recovery = {
  paused: "crash",
  items: [
    {
      node_id: "services.api",
      title: "API",
      kind: "run_again",
      detail: "Its IC was cut off in the middle of a step.",
    },
    {
      node_id: "apps.web",
      title: "Web",
      kind: "dropped",
      detail: "A message was not delivered, the team was changed since.",
    },
  ],
  messages_held: 3,
};

/** A director that pauses and resumes, and records which it was asked. */
function pauseHandlers(resumed: Recovery = { ...HELD, paused: null }) {
  const asked: string[] = [];
  server.use(
    http.post("*/api/director/org/pause", () => {
      asked.push("pause");
      return HttpResponse.json({
        paused: "human",
        items: [],
        messages_held: 0,
      });
    }),
    http.post("*/api/director/org/resume", () => {
      asked.push("resume");
      return HttpResponse.json(resumed);
    }),
    http.get("*/api/director/org/recovery", () => HttpResponse.json(HELD)),
  );
  return asked;
}

describe("PauseButton", () => {
  it("pauses the org", async () => {
    const asked = pauseHandlers();
    const user = userEvent.setup();
    renderWithProviders(<PauseButton />);

    await user.click(screen.getByRole("button", { name: "ORG_CHART$PAUSE" }));

    await waitFor(() => expect(asked).toEqual(["pause"]));
  });

  it("says so when the org could not be paused", async () => {
    server.use(
      http.post("*/api/director/org/pause", () =>
        HttpResponse.json({ detail: "no org" }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<PauseButton />);

    await user.click(screen.getByRole("button", { name: "ORG_CHART$PAUSE" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ORG_CHART$PAUSE_ERROR",
    );
  });
});

describe("PausedBanner", () => {
  it("says why the org is paused, what it holds and what resuming does", async () => {
    pauseHandlers();
    renderWithProviders(<PausedBanner paused="crash" />);

    const banner = screen.getByTestId("org-paused");
    expect(banner).toHaveTextContent("ORG_CHART$PAUSED_CRASH");
    expect(
      await within(banner).findByText("ORG_CHART$MESSAGES_HELD"),
    ).toBeInTheDocument();
    expect(
      within(banner).getByText("ORG_CHART$RECOVERY_SHOW"),
    ).toBeInTheDocument();
    expect(
      within(banner).getByRole("link", { name: "API" }),
    ).toBeInTheDocument();
    expect(
      within(banner).getByText("Its IC was cut off in the middle of a step."),
    ).toBeInTheDocument();
  });

  it("shows nothing while the org runs", () => {
    pauseHandlers();
    renderWithProviders(<PausedBanner paused={null} />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("resumes the org and then lists what was put aside", async () => {
    const asked = pauseHandlers({
      paused: null,
      items: [HELD.items[1]],
      messages_held: 0,
    });
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<PausedBanner paused="human" />);

    await user.click(screen.getByRole("button", { name: "ORG_CHART$RESUME" }));
    await waitFor(() => expect(asked).toEqual(["resume"]));
    rerender(<PausedBanner paused={null} />);

    expect(screen.queryByTestId("org-paused")).toBeNull();
    const aside = await screen.findByRole("status");
    expect(aside).toHaveTextContent("ORG_CHART$RECOVERY_PUT_ASIDE");
    expect(aside).toHaveTextContent("the team was changed since");
    expect(within(aside).queryByText(/cut off/)).toBeNull();
  });

  it("lists nothing after a resume that put nothing aside", async () => {
    const asked = pauseHandlers({ paused: null, items: [], messages_held: 0 });
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<PausedBanner paused="human" />);

    await user.click(screen.getByRole("button", { name: "ORG_CHART$RESUME" }));
    await waitFor(() => expect(asked).toEqual(["resume"]));
    rerender(<PausedBanner paused={null} />);

    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("a team whose agent was paused while working", () => {
  const NODE: OrgNode = {
    id: "services.api",
    parent_id: "root",
    title: "API",
    boundary: { path: "services/api", writable: ["**"], readonly: [] },
    isolation: "shared",
    worktree_path: "/repo",
    branch: "main",
    agents: [
      {
        role: "ic",
        conversation_id: "c1",
        status: "paused",
        kind: "openhands",
      },
      {
        role: "manager",
        conversation_id: "c2",
        status: "idle",
        kind: "openhands",
      },
    ],
    status: "idle",
    headline: "Serves the checkout API",
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
  };

  it("is marked on its card", () => {
    renderWithProviders(
      <NodeCard node={NODE} current={false} onOpenDetails={() => {}} />,
    );

    expect(
      screen.getByRole("img", { name: "ORG_CHART$AGENT_PAUSED" }),
    ).toBeInTheDocument();
  });

  it("is not marked once its agent runs again", () => {
    const running = {
      ...NODE,
      agents: NODE.agents.map((agent) => ({ ...agent, status: "working" })),
    };
    renderWithProviders(
      <NodeCard node={running} current={false} onOpenDetails={() => {}} />,
    );

    expect(
      screen.queryByRole("img", { name: "ORG_CHART$AGENT_PAUSED" }),
    ).toBeNull();
  });
});

describe("the setting to resume on start", () => {
  const STATE: DirectorSettingsState = {
    max_teams: 32,
    max_depth: 8,
    teams: 2,
    depth: 2,
    max_concurrent_runs: 10,
    allowed_profiles: [],
    resume_on_start: false,
    stall_check_minutes: 120,
    manager_check_accepted_reviews: 5,
    manager_check_ic_setbacks: 3,
    route_requests: true,
  };

  function settings(state: DirectorSettingsState) {
    const saved: unknown[] = [];
    server.use(
      http.get("*/settings", ({ request }) =>
        new URL(request.url).pathname === "/api/director/settings"
          ? HttpResponse.json(state)
          : HttpResponse.json({ detail: "Not Found" }, { status: 404 }),
      ),
      http.patch("*/api/director/settings", async ({ request }) => {
        const change = await request.json();
        saved.push(change);
        return HttpResponse.json({ ...state, ...(change as object) });
      }),
    );
    return saved;
  }

  it("is saved with the limits", async () => {
    const saved = settings(STATE);
    const user = userEvent.setup();
    renderWithProviders(<OrgSettings />);
    await user.click(
      await screen.findByRole("button", { name: "ORG_CHART$SETTINGS" }),
    );
    const modal = await screen.findByTestId("org-settings-modal");

    await user.click(
      within(modal).getByLabelText(/ORG_CHART\$SETTINGS_RESUME_ON_START/),
    );
    await user.click(
      within(modal).getByRole("button", { name: "BUTTON$SAVE" }),
    );

    await waitFor(() =>
      expect(saved).toEqual([
        {
          max_teams: 32,
          max_depth: 8,
          allowed_profiles: [],
          resume_on_start: true,
          stall_check_minutes: 120,
          manager_check_accepted_reviews: 5,
          manager_check_ic_setbacks: 3,
          route_requests: true,
        },
      ]),
    );
  });
});
