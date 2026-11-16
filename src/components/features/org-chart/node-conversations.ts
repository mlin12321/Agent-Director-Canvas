import type {
  AgentRef,
  AgentRole,
  OrgNode,
  Session,
  SessionTeam,
} from "#/api/director/types";

/** One conversation that goes on at a team. */
export interface NodeConversation {
  key: string;
  /** `null` while the agent has no conversation to open. */
  conversationId: string | null;
  role: AgentRole;
  status: string;
  agent: AgentRef;
  /** The session it is the work of. */
  session: string;
  /** What the session has at this team. */
  place: SessionTeam;
  /** The IC that only reviews the session's work from here. */
  review: boolean;
  /** The IC's second conversation, in which it hands work over. */
  handOver: boolean;
  /** A hand-over that could not be started. */
  lost: boolean;
  /** The human started it at this team. */
  mine: boolean;
}

/**
 * What the sessions have at a team: the places their agents work at, and
 * the places their work is reviewed from. Nobody works at a team itself.
 */
export function placesAt(
  nodeId: string,
  sessions: readonly Session[],
): SessionTeam[] {
  return sessions.flatMap((session) =>
    session.teams.filter((team) => team.team_id === nodeId),
  );
}

/**
 * Every conversation at a team: those of the agents each session has
 * there, an IC's hand-over, and the IC that reviews a session from there.
 * The ones the human started at this team are the ICs of the sessions
 * opened here.
 */
export function conversationsAt(
  node: OrgNode,
  sessions: readonly Session[],
): NodeConversation[] {
  const found: NodeConversation[] = [];
  sessions.forEach((session) => {
    session.teams
      .filter((team) => team.team_id === node.id)
      .forEach((place) => {
        const review = Boolean(place.review_only);
        place.agents.forEach((agent) => {
          const shared = {
            role: agent.role,
            agent,
            session: session.title,
            place,
            review,
          };
          found.push({
            ...shared,
            key: `${place.id}:${agent.role}`,
            conversationId: agent.conversation_id,
            status: agent.status,
            handOver: false,
            lost: false,
            mine: !review && session.team_id === node.id && agent.role === "ic",
          });
          if (agent.hand_over) {
            const lost = agent.hand_over.status === "lost";
            found.push({
              ...shared,
              key: `${place.id}:${agent.role}:hand-over`,
              conversationId: lost ? null : agent.hand_over.conversation_id,
              status: agent.hand_over.status,
              handOver: true,
              lost,
              mine: false,
            });
          }
        });
      });
  });
  return found;
}

const BY_URGENCY = ["blocked", "working", "done", "idle"] as const;

/**
 * A team with what goes on at it: the agents of every session at work
 * there, the most pressing of their states, and what they wait for. A team
 * of the org has none of that itself.
 */
export function teamAtWork(
  node: OrgNode,
  sessions: readonly Session[],
): OrgNode {
  const places = placesAt(node.id, sessions).filter(
    (place) => !place.review_only,
  );
  if (places.length === 0) return node;
  const started = places.filter((place) => place.agents.length > 0);
  const latest = started[started.length - 1];
  return {
    ...node,
    agents: started.flatMap((place) => place.agents),
    status:
      BY_URGENCY.find((status) =>
        started.some((place) => place.status === status),
      ) ?? "idle",
    headline: latest?.headline ?? node.headline,
    review: latest?.review ?? null,
    stopped: places.find((place) => place.stopped)?.stopped,
    pending_split:
      places.find((place) => place.pending_split)?.pending_split ?? null,
    waiting_to_start: places.some((place) => place.waiting_to_start),
    escalations: places.flatMap((place) => place.escalations),
    escalation_count: places.reduce(
      (count, place) =>
        count +
        place.escalations.filter((escalation) => escalation.held_by === null)
          .length,
      0,
    ),
  };
}
