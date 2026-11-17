import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { routeToOrg } from "#/api/director/route-to-org";
import type { RoutedMessage } from "#/api/director/types";
import { server } from "#/mocks/node";

const ROUTED: RoutedMessage = {
  node_id: "root",
  conversation_id: "conv-ic",
  started_org: true,
  team: "",
  chosen_by: "path",
  reason: "",
};
const CONVERSATION = { conversation_id: "conv-ic" };

function director(answer: () => Response) {
  const sent: unknown[] = [];
  server.use(
    http.post("*/api/director/org/messages", async ({ request }) => {
      sent.push(await request.json());
      return answer();
    }),
  );
  return sent;
}

describe("routeToOrg", () => {
  it("sends the message with its folder and the conversation to start", async () => {
    const sent = director(() => HttpResponse.json(ROUTED));

    const routed = await routeToOrg("Build it", "/work/shop/api", CONVERSATION);

    expect(routed).toEqual(ROUTED);
    expect(sent).toEqual([
      {
        text: "Build it",
        path: "/work/shop/api",
        auto: true,
        conversation: CONVERSATION,
      },
    ]);
  });

  it.each([
    ["the folder is not in a git repository", 503],
    ["the folder is outside the org's repository", 422],
    ["no team can take the message", 409],
  ])("gives the message back when %s", async (_, status) => {
    director(() => HttpResponse.json({ detail: "No" }, { status }));

    expect(await routeToOrg("Build it", "/tmp/x", CONVERSATION)).toBeNull();
  });

  it("gives the message back when the server has no director", async () => {
    director(() => HttpResponse.json({ detail: "Not Found" }, { status: 404 }));

    expect(await routeToOrg("Build it", "/work/shop", CONVERSATION)).toBeNull();
  });
});
