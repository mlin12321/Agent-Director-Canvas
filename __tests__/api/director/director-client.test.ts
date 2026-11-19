import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DirectorClient,
  forgetServersWithoutDirector,
} from "#/api/director/director-client";
import { server } from "#/mocks/node";

describe("DirectorClient on a server without a director", () => {
  beforeEach(() => forgetServersWithoutDirector());
  afterEach(() => vi.useRealTimers());

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

  it("asks again a while later, when the server may have a director", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let director = false;
    server.use(
      http.get("*/api/director/org/sessions", () =>
        director
          ? HttpResponse.json([])
          : HttpResponse.json({ detail: "Not Found" }, { status: 404 }),
      ),
    );
    await expect(DirectorClient.listSessions()).rejects.toMatchObject({
      status: 404,
    });

    director = true;
    vi.setSystemTime(Date.now() + 60_000);

    await expect(DirectorClient.listSessions()).resolves.toEqual([]);
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
