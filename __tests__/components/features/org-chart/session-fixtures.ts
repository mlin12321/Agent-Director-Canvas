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

const DIVISION_LEAD_IC: AgentRef = {
  role: "ic",
  conversation_id: null,
  status: "idle",
  kind: "openhands",
  acp_server: null,
  model: null,
  reason: null,
  hand_over: null,
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
    base_commit: "",
    boundary_enforcement: null,
    division_lead: false,
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

/** A session's Division Lead place; its IC only reviews. */
export function leadPlaceAt(
  team: OrgNode,
  sessionId: string,
  work: Partial<SessionTeam> = {},
): SessionTeam {
  return placeAt(team, sessionId, {
    id: `${team.id}@${sessionId}@lead`,
    parent_id: null,
    agents: [DIVISION_LEAD_IC],
    status: "idle",
    division_lead: true,
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
    source: {
      kind: "human",
      name: "",
      automation_id: "",
      run_id: "",
      event_key: "",
    },
    opened_at: "2026-11-01T10:00:00+00:00",
    branch: "main",
    usage: { input_tokens: 0, output_tokens: 0, cost: 0, unpriced_tokens: 0 },
    cost_allowance: 0,
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
