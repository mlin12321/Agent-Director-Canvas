import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { expect, it, vi } from "vitest";
import type { OrgSummary } from "#/api/director/types";
import { PauseButton } from "#/components/features/org-chart/org-pause";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";
import { server } from "#/mocks/node";

const mocks = vi.hoisted(() => ({ backendId: "one" }));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({ backend: { id: mocks.backendId } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

it("writes what a pause did to the backend it was asked of", async () => {
  let answer: () => void = () => {};
  server.use(
    http.post("*/api/director/org/pause", async () => {
      await new Promise<void>((resolve) => {
        answer = resolve;
      });
      return HttpResponse.json({
        paused: "human",
        items: [],
        messages_held: 0,
      });
    }),
  );
  const queryClient = new QueryClient();
  const running = { paused: null } as OrgSummary;
  queryClient.setQueryData(DIRECTOR_QUERY_KEYS.org("one"), running);
  queryClient.setQueryData(DIRECTOR_QUERY_KEYS.org("two"), running);
  const view = () => (
    <QueryClientProvider client={queryClient}>
      <PauseButton />
    </QueryClientProvider>
  );
  const { rerender } = render(view());
  await userEvent.click(screen.getByRole("button"));

  mocks.backendId = "two";
  rerender(view());
  answer();

  await waitFor(() =>
    expect(
      queryClient.getQueryData<OrgSummary>(DIRECTOR_QUERY_KEYS.org("one"))
        ?.paused,
    ).toBe("human"),
  );
  expect(
    queryClient.getQueryData<OrgSummary>(DIRECTOR_QUERY_KEYS.org("two"))
      ?.paused,
  ).toBeNull();
});
