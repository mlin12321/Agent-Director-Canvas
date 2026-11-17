import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { useWaitingOnHuman } from "#/hooks/use-waiting-on-human";
import { server } from "#/mocks/node";
import { renderWithProviders } from "test-utils";

function Waiting({ enabled = true }: { enabled?: boolean }) {
  return <output>{useWaitingOnHuman(enabled)}</output>;
}

const ESCALATION = {
  id: "ic-failed",
  kind: "critical_issue" as const,
  raised_by: "ic" as const,
  title: "The IC of 'API' failed",
  detail: "",
  raised_at: "2026-11-17T10:00:00+00:00",
  handoffs: [],
};

describe("useWaitingOnHuman", () => {
  it("counts the escalations no team holds, over every session", async () => {
    server.use(
      http.get("*/api/director/org/sessions", () =>
        // Only what the count reads of a session.
        HttpResponse.json([
          {
            id: "s1",
            teams: [
              {
                escalations: [
                  { ...ESCALATION, held_by: null },
                  { ...ESCALATION, id: "e2", held_by: "root@s1" },
                ],
              },
              { escalations: [] },
            ],
          },
          {
            id: "s2",
            teams: [{ escalations: [{ ...ESCALATION, held_by: null }] }],
          },
        ]),
      ),
    );

    renderWithProviders(<Waiting />);

    expect(await screen.findByText("2")).toBeInTheDocument();
  });

  it("is zero where the backend has no director, and asks nothing when off", async () => {
    let asked = 0;
    server.use(
      http.get("*/api/director/org/sessions", () => {
        asked += 1;
        return HttpResponse.json({ detail: "Not Found" }, { status: 404 });
      }),
    );

    renderWithProviders(<Waiting enabled={false} />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(asked).toBe(0);
  });
});
