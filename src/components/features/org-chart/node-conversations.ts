import type {
  AgentRef,
  AgentRole,
  OrgNode,
  Session,
} from "#/api/director/types";

/** One conversation that goes on at a team. */
export interface NodeConversation {
  key: string;
  /** `null` while the agent has no conversation to open. */
  conversationId: string | null;
  role: AgentRole;
  status: string;
  agent: AgentRef;
  /** The session it is the work of; `""` for the team's own. */
  session: string;
  /** The IC's second conversation, in which it hands work over. */
  handOver: boolean;
  /** A hand-over that could not be started. */
  lost: boolean;
  /** The human started it at this team. */
  mine: boolean;
}

/**
 * Every conversation at a team: its own agents', an IC's hand-over, and
 * those of the sessions that have agents here. The ones the human started
 * at this team are the top team's IC, which the org was started with, and
 * the IC of each session opened here.
 */
export function conversationsAt(
  node: OrgNode,
  sessions: readonly Session[],
): NodeConversation[] {
  const found: NodeConversation[] = [];
  const add = (
    owner: string,
    agent: AgentRef,
    session: string,
    mine: boolean,
  ) => {
    found.push({
      key: `${owner}:${agent.role}`,
      conversationId: agent.conversation_id,
      role: agent.role,
      status: agent.status,
      agent,
      session,
      handOver: false,
      lost: false,
      mine,
    });
    if (agent.hand_over) {
      const lost = agent.hand_over.status === "lost";
      found.push({
        key: `${owner}:${agent.role}:hand-over`,
        conversationId: lost ? null : agent.hand_over.conversation_id,
        role: agent.role,
        status: agent.hand_over.status,
        agent,
        session,
        handOver: true,
        lost,
        mine: false,
      });
    }
  };
  node.agents.forEach((agent) =>
    add(node.id, agent, "", node.parent_id === null && agent.role === "ic"),
  );
  sessions.forEach((session) => {
    const here = session.teams.find((team) => team.team_id === node.id);
    here?.agents.forEach((agent) =>
      add(
        here.id,
        agent,
        session.title,
        session.team_id === node.id && agent.role === "ic",
      ),
    );
  });
  return found;
}
