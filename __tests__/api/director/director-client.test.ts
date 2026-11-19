import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DirectorClient,
  forgetServersWithoutDirector,
} from "#/api/director/director-client";
import { server } from "#/mocks/node";

describe("DirectorClient on a server without a director", () => {
  beforeEach(() => forgetServersWithoutDirector());

  it("asks once, then answers for the server without asking it", async () => {
    let asked = 0;
    server.use(
      http.get("*/api/director/*", () => {
        asked += 1;
        return HttpResponse.json({ detail: "Not Found" }, { status: 404 });
      }),
    );

    await expect(DirectorClient.listSessions()).rejects.toMatchObject({
      status: 404,
    });
    await expect(DirectorClient.searchTeams("api")).rejects.toMatchObject({
      status: 404,
    });
    await expect(DirectorClient.listSessions()).rejects.toMatchObject({
      status: 404,
    });

    expect(asked).toBe(1);
  });

  it("goes on asking a director that only does not know one thing", async () => {
    let asked = 0;
    server.use(
      http.get("*/api/director/org/sessions", () => {
        asked += 1;
        return HttpResponse.json([]);
      }),
      http.get("*/api/director/org/search", () =>
        HttpResponse.json({ detail: "Not Found" }, { status: 404 }),
      ),
    );

    await expect(DirectorClient.searchTeams("api")).rejects.toMatchObject({
      status: 404,
    });
    await DirectorClient.listSessions();
    await DirectorClient.listSessions();

    expect(asked).toBe(2);
  });
});
