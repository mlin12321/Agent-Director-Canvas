import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { routeToOrg } from "#/api/director/route-to-org";
import type { OrgSummary, RoutedMessage } from "#/api/director/types";
import { server } from "#/mocks/node";

const SUMMARY: OrgSummary = {
  root_id: null,
  node_count: 0,
  repo_path: "/work/shop",
  directory: "",
  is_git_repository: true,
  fixture: false,
  boundary_enforcement: "sandbox",
  paused: null,
};
const ROUTED: RoutedMessage = {
  node_id: "root",
  conversation_id: "conv-ic",
  started_org: true,
};
const CONVERSATION = { conversation_id: "conv-ic" };

function director(summary: OrgSummary, answer: () => Response) {
  const sent: unknown[] = [];
  server.use(
    http.get("*/api/director/org", () => HttpResponse.json(summary)),
    http.post("*/api/director/org/messages", async ({ request }) => {
      sent.push(await request.json());
      return answer();
    }),
  );
  return sent;
}

describe("routeToOrg", () => {
  it("sends the message with its folder and the conversation to start", async () => {
    const sent = director(SUMMARY, () => HttpResponse.json(ROUTED));

    const routed = await routeToOrg("Build it", "/work/shop/api", CONVERSATION);

    expect(routed).toEqual(ROUTED);
    expect(sent).toEqual([
      { text: "Build it", path: "/work/shop/api", conversation: CONVERSATION },
    ]);
  });

  it("leaves a sample tree alone", async () => {
    const sent = director({ ...SUMMARY, fixture: true }, () =>
      HttpResponse.json(ROUTED),
    );

    expect(await routeToOrg("Build it", "/work/shop", CONVERSATION)).toBeNull();
    expect(sent).toEqual([]);
  });

  it.each([
    ["the folder is not in a git repository", 503],
    ["the folder is outside the org's repository", 422],
    ["no team can take the message", 409],
  ])("gives the message back when %s", async (_, status) => {
    director(SUMMARY, () => HttpResponse.json({ detail: "No" }, { status }));

    expect(await routeToOrg("Build it", "/tmp/x", CONVERSATION)).toBeNull();
  });

  it("gives the message back when the server has no director", async () => {
    server.use(
      http.get("*/api/director/org", () =>
        HttpResponse.json({ detail: "Not Found" }, { status: 404 }),
      ),
    );

    expect(await routeToOrg("Build it", "/work/shop", CONVERSATION)).toBeNull();
  });
});
