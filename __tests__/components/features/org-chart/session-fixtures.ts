import type {
  AgentRef,
  OrgNode,
  Session,
  SessionTeam,
} from "#/api/director/types";

/**
 * Nobody works at a team of the org itself: its agents, state, review and
 * escalations are those of the sessions that have a place at it. These
 * build the sessions a test puts beside its teams.
 */

const REVIEWER: AgentRef = {
  role: "ic",
  conversation_id: null,
  status: "idle",
  kind: "openhands",
};

/** What a session has at a team: the team's title and boundary, and `work`. */
export function placeAt(
  team: OrgNode,
  sessionId: string,
  work: Partial<SessionTeam> = {},
): SessionTeam {
  return {
    ...team,
    id: `${team.id}@${sessionId}`,
    child_ids: [],
    worktree_path: ".",
    branch: "main",
    agents: [],
    status: "idle",
    escalations: [],
    pending_split: null,
    review: null,
    waiting_to_start: false,
    session: sessionId,
    team_id: team.id,
    ...work,
  };
}

/** The place a session's work is reviewed from; its IC only reviews. */
export function reviewPlaceAt(
  team: OrgNode,
  sessionId: string,
  work: Partial<SessionTeam> = {},
): SessionTeam {
  return placeAt(team, sessionId, {
    id: `${team.id}@${sessionId}@review`,
    parent_id: null,
    agents: [REVIEWER],
    status: "idle",
    review_only: true,
    ...work,
  });
}

/** A session opened at the team of the first of its places. */
export function sessionOf(
  id: string,
  title: string,
  teams: SessionTeam[],
  rest: Partial<Session> = {},
): Session {
  const [opened] = teams;
  return {
    id,
    title,
    team_id: opened.team_id,
    team: opened.title,
    above_id: opened.parent_id?.split("@")[0] ?? opened.team_id,
    request: "",
    opened_at: "2026-11-01T10:00:00+00:00",
    status: opened.status,
    review: opened.review?.state ?? null,
    conversation_id:
      opened.agents.find((agent) => agent.role === "ic")?.conversation_id ??
      null,
    teams,
    ...rest,
  };
}

/** One session, opened at a team, with `work` there. */
export function atWork(
  team: OrgNode,
  work: Partial<SessionTeam> = {},
  session: { id: string; title: string } = { id: "s1", title: "Work" },
): Session[] {
  return [
    sessionOf(session.id, session.title, [placeAt(team, session.id, work)]),
  ];
}
