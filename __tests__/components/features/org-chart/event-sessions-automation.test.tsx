import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import AutomationService from "#/api/automation-service/automation-service.api";
import { EventSessionsAutomation } from "#/components/features/org-chart/event-sessions-automation";
import { server } from "#/mocks/node";
import type { Automation } from "#/types/automation";
import { renderWithProviders } from "test-utils";

const BUNDLE = {
  name: "Open a session of the org",
  entrypoint: "python3 main.py",
  tarball_base64: "H4sI",
};

function bundleHandler() {
  server.use(
    http.get("*/api/director/automations/open-session", () =>
      HttpResponse.json(BUNDLE),
    ),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("EventSessionsAutomation", () => {
  it("adds the director's script for the events of a webhook source, turned off, and links to it", async () => {
    bundleHandler();
    const create = vi
      .spyOn(AutomationService, "createAutomation")
      .mockResolvedValue({ id: "a-1" } as Automation);
    const user = userEvent.setup();
    renderWithProviders(<EventSessionsAutomation />);
    const add = screen.getByRole("button", {
      name: "ORG_CHART$EVENT_AUTOMATION_ADD",
    });

    expect(add).toBeDisabled();
    await user.type(
      screen.getByLabelText("ORG_CHART$EVENT_AUTOMATION_SOURCE"),
      "jira",
    );
    await user.type(
      screen.getByLabelText("ORG_CHART$EVENT_AUTOMATION_ON"),
      "issue.created",
    );
    await user.click(add);

    const added = await screen.findByRole("link", {
      name: "ORG_CHART$EVENT_AUTOMATION_ADDED",
    });
    expect(added).toHaveAttribute("href", "/automations/a-1");
    expect(create).toHaveBeenCalledWith(
      {
        name: BUNDLE.name,
        trigger: { type: "event", source: "jira", on: "issue.created" },
        enabled: false,
        prompt: null,
        script: {
          entrypoint: BUNDLE.entrypoint,
          tarball_base64: BUNDLE.tarball_base64,
        },
      },
      undefined,
    );
  });

  it("says so when the automation service refuses", async () => {
    bundleHandler();
    vi.spyOn(AutomationService, "createAutomation").mockRejectedValue(
      new Error("no"),
    );
    const user = userEvent.setup();
    renderWithProviders(<EventSessionsAutomation />);

    await user.type(
      screen.getByLabelText("ORG_CHART$EVENT_AUTOMATION_SOURCE"),
      "jira",
    );
    await user.type(
      screen.getByLabelText("ORG_CHART$EVENT_AUTOMATION_ON"),
      "*",
    );
    await user.click(
      screen.getByRole("button", { name: "ORG_CHART$EVENT_AUTOMATION_ADD" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "ORG_CHART$EVENT_AUTOMATION_ERROR",
      ),
    );
  });
});
