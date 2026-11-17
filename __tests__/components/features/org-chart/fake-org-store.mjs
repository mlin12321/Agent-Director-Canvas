/**
 * Test double for the Agent Server's director org tree. It derives
 * `child_ids` and emits the same events, scoped the same way, as
 * `openhands.agent_server.director.org_store` in the SDK, so UI tests can
 * drive realistic event sequences without a server.
 *
 * The tree is the org's structure: nobody works at a team itself. Work is
 * what a session has at a team (`openSession`, `place`), and the page is
 * told of it with the sessions.
 *
 * @import { AgentRef, NodeId, OpenEscalation, OrgEvent, OrgNode, Session, SessionTeam } from "../../../../src/api/director/types.ts"
 */

/**
 * What a caller supplies; the store fills in the derived field.
 * @typedef {Omit<OrgNode, "child_ids">} OrgNodeInput
 * @typedef {(event: OrgEvent) => void} OrgListener
 * @typedef {Pick<Session, "id" | "title" | "team_id"> & Partial<Pick<Session, "request" | "opened_at">>} SessionInput
 * @typedef {Partial<Omit<SessionTeam, "id" | "parent_id" | "child_ids" | "session" | "team_id" | "division_lead">>} Work
 * @typedef {{ event: OrgEvent, id: NodeId, parent_id: NodeId | null }} Emission
 */

export class OrgStoreError extends Error {
  constructor(message) {
    super(message);
    this.name = "OrgStoreError";
  }
}

/** The id of what a session has at a team. */
export function placeId(
  /** @type {NodeId} */ teamId,
  /** @type {string} */ sessionId,
) {
  return `${teamId}@${sessionId}`;
}

/** The id of the place a session's work is reviewed from. */
export function divisionLeadId(
  /** @type {NodeId} */ teamId,
  /** @type {string} */ sessionId,
) {
  return `${teamId}@${sessionId}@lead`;
}

/** @type {AgentRef} */
const DIVISION_LEAD_IC = {
  role: "ic",
  conversation_id: null,
  status: "idle",
  kind: "openhands",
};

export class OrgStore {
  /** @type {Map<NodeId, OrgNode>} */
  #nodes = new Map();

  /** @type {NodeId | null} */
  #rootId = null;

  /** @type {Map<string, Required<SessionInput> & { above_id: NodeId }>} */
  #sessions = new Map();

  /** What each session has at each of its teams, by its own id. */
  /** @type {Map<string, SessionTeam>} */
  #places = new Map();

  /** @type {Set<{ deliver: (emission: Emission) => void, announce: () => void, tell: OrgListener }>} */
  #listeners = new Set();

  get rootId() {
    return this.#rootId;
  }

  /** @param {NodeId} id @returns {OrgNode[]} */
  children(id) {
    const node = this.#nodes.get(id);
    if (!node) return [];
    return node.child_ids.flatMap((childId) => {
      const child = this.#nodes.get(childId);
      return child ? [child] : [];
    });
  }

  /**
   * @param {NodeId} id
   * @returns {OrgNode[]} Root first, excluding the node itself.
   */
  ancestors(id) {
    /** @type {OrgNode[]} */
    const chain = [];
    let parent_id = this.#nodes.get(id)?.parent_id ?? null;
    while (parent_id !== null) {
      const parent = this.#nodes.get(parent_id);
      if (!parent) break;
      chain.unshift(parent);
      parent_id = parent.parent_id;
    }
    return chain;
  }

  /** @returns {OrgNode[]} Every node, parents before children. */
  all() {
    /** @type {OrgNode[]} */
    const ordered = [];
    const queue = this.#rootId === null ? [] : [this.#rootId];
    for (let index = 0; index < queue.length; index += 1) {
      const node = this.#nodes.get(queue[index]);
      if (node) {
        ordered.push(node);
        queue.push(...node.child_ids);
      }
    }
    return ordered;
  }

  /**
   * Insert a node or update an existing one. A node cannot move to a
   * different parent; remove it and insert it again instead.
   *
   * @param {OrgNodeInput} input
   * @returns {OrgNode}
   */
  upsert(input) {
    const existing = this.#nodes.get(input.id);
    if (existing) {
      if (existing.parent_id !== input.parent_id) {
        throw new OrgStoreError(
          `Node ${input.id} cannot change parent from ${existing.parent_id} to ${input.parent_id}`,
        );
      }
    } else if (input.parent_id === null) {
      if (this.#rootId !== null) {
        throw new OrgStoreError(
          `The tree already has a root (${this.#rootId}); ${input.id} needs a parent`,
        );
      }
    } else if (!this.#nodes.has(input.parent_id)) {
      throw new OrgStoreError(
        `Parent ${input.parent_id} of node ${input.id} does not exist`,
      );
    }

    /** @type {OrgNode} */
    const node = {
      ...structuredClone(input),
      child_ids: existing ? existing.child_ids : [],
    };
    this.#nodes.set(node.id, node);

    if (!existing) {
      if (node.parent_id === null) {
        this.#rootId = node.id;
      } else {
        const parent = /** @type {OrgNode} */ (this.#nodes.get(node.parent_id));
        this.#nodes.set(parent.id, {
          ...parent,
          child_ids: [...parent.child_ids, node.id],
        });
      }
    }

    this.#emit({ type: "node_upsert", node }, node.id, node.parent_id);
    // A new child changes its parent's `child_ids`.
    if (!existing) this.#announce(node.parent_id);
    return node;
  }

  /**
   * Remove a node and everything below it.
   *
   * @param {NodeId} id
   * @returns {boolean} Whether the node existed.
   */
  remove(id) {
    const node = this.#nodes.get(id);
    if (!node) return false;

    /** @type {OrgNode[]} */
    const doomed = [];
    const stack = [node];
    while (stack.length > 0) {
      const current = /** @type {OrgNode} */ (stack.pop());
      doomed.push(current);
      stack.push(...this.children(current.id));
    }
    // Leaves first, so a subscriber never holds a child of a missing parent.
    doomed.reverse();

    if (node.parent_id === null) {
      this.#rootId = null;
    } else {
      const parent = this.#nodes.get(node.parent_id);
      if (parent) {
        this.#nodes.set(parent.id, {
          ...parent,
          child_ids: parent.child_ids.filter((childId) => childId !== id),
        });
      }
    }
    // Announce while the doomed nodes are still resolvable, so a subscriber
    // focused inside the removed subtree can still be matched.
    doomed.forEach((gone) => {
      this.#emit(
        { type: "node_removed", id: gone.id },
        gone.id,
        gone.parent_id,
      );
    });
    doomed.forEach((gone) => this.#nodes.delete(gone.id));

    // What the sessions had at the removed teams goes with them.
    const gone = new Set(doomed.map((team) => team.id));
    const placesBefore = this.#places.size;
    [...this.#sessions.values()]
      .filter((session) => gone.has(session.team_id))
      .forEach((session) => this.#sessions.delete(session.id));
    [...this.#places.values()]
      .filter(
        (place) =>
          gone.has(place.team_id) || !this.#sessions.has(place.session),
      )
      .forEach((place) => this.#places.delete(place.id));

    this.#announce(node.parent_id);
    if (this.#places.size !== placesBefore) this.#announceSessions();
    this.#announceEscalations();
    return true;
  }

  /**
   * Open a session at a team. Its work is reviewed from the team above, or
   * from the team itself at the top: that place is the session's first, and
   * its IC only reviews.
   *
   * @param {SessionInput} input
   * @param {AgentRef[]} [leads] The agents of its Division Lead place.
   * @returns {Session}
   */
  openSession(input, leads = [DIVISION_LEAD_IC]) {
    const team = this.#nodes.get(input.team_id);
    if (!team) {
      throw new OrgStoreError(`Team ${input.team_id} does not exist`);
    }
    if (this.#sessions.has(input.id)) {
      throw new OrgStoreError(`Session ${input.id} is already open`);
    }
    const aboveId = team.parent_id ?? team.id;
    this.#sessions.set(input.id, {
      request: "",
      opened_at: "",
      ...structuredClone(input),
      above_id: aboveId,
    });
    const id = divisionLeadId(aboveId, input.id);
    this.#places.set(id, {
      ...this.#reference(/** @type {OrgNode} */ (this.#nodes.get(aboveId))),
      id,
      parent_id: null,
      agents: structuredClone(leads),
      session: input.id,
      team_id: aboveId,
      division_lead: true,
    });
    this.#announceSessions();
    return /** @type {Session} */ (
      this.sessions().find((session) => session.id === input.id)
    );
  }

  /**
   * Set what a session has at a team: its agents, state, review and
   * escalations there. What is left out is as at a team nothing was done at.
   *
   * @param {string} sessionId
   * @param {NodeId} teamId
   * @param {Work} [work]
   * @returns {SessionTeam}
   */
  place(sessionId, teamId, work = {}) {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new OrgStoreError(`Session ${sessionId} is not open`);
    const team = this.#nodes.get(teamId);
    if (!team) throw new OrgStoreError(`Team ${teamId} does not exist`);
    /** @type {SessionTeam} */
    const place = {
      ...this.#reference(team),
      ...structuredClone(work),
      id: placeId(teamId, sessionId),
      parent_id:
        teamId === session.team_id
          ? divisionLeadId(session.above_id, sessionId)
          : placeId(/** @type {NodeId} */ (team.parent_id), sessionId),
      session: sessionId,
      team_id: teamId,
    };
    this.#places.set(place.id, place);
    this.#announceSessions();
    this.#announceEscalations();
    return place;
  }

  /**
   * The open sessions as a client reads them, oldest first: each with the
   * team it was opened at first and the place it is reviewed from last.
   *
   * @returns {Session[]}
   */
  sessions() {
    return [...this.#sessions.values()].map((session) => {
      const places = [...this.#places.values()]
        .filter((place) => place.session === session.id)
        .map((place) => ({
          ...place,
          child_ids: [...this.#places.values()]
            .filter((below) => below.parent_id === place.id)
            .map((below) => below.id),
        }));
      const teams = [
        ...places.filter((place) => !place.division_lead),
        ...places.filter((place) => place.division_lead),
      ];
      const opened = this.#places.get(placeId(session.team_id, session.id));
      return {
        ...session,
        team: this.#nodes.get(session.team_id)?.title ?? "",
        status: opened?.status ?? "idle",
        review: opened?.review?.state ?? null,
        conversation_id:
          opened?.agents.find((agent) => agent.role === "ic")
            ?.conversation_id ?? null,
        teams,
      };
    });
  }

  /**
   * A team as a place of a session starts from it: the team's own title and
   * boundary, and nothing done.
   *
   * @param {OrgNode} team
   * @returns {Omit<SessionTeam, "id" | "parent_id" | "session" | "team_id">}
   */
  #reference(team) {
    return {
      ...structuredClone(team),
      child_ids: [],
      worktree_path: ".",
      branch: `agents/${team.id}`,
      agents: [],
      status: "idle",
      escalations: [],
      pending_split: null,
      review: null,
      waiting_to_start: false,
    };
  }

  /**
   * Every escalation that waits on the human: critical issues first, then
   * the longest waiting. Only a session's place raises one.
   *
   * @param {NodeId} focusId
   * @returns {OpenEscalation[]}
   */
  escalations(focusId) {
    /** @type {OpenEscalation[]} */
    const found = [];
    // A session is under no node: what its teams wait on the human for is
    // told with the whole org's.
    if (focusId === this.#rootId) {
      this.#places.forEach((place) => {
        const session = this.#sessions.get(place.session);
        /** @type {SessionTeam[]} */
        const way = [];
        for (
          let step = /** @type {SessionTeam | undefined} */ (place);
          step;
          step = this.#places.get(step.parent_id ?? "")
        ) {
          // At the top the work is reviewed from the team it was opened at.
          if (way[0]?.team_id !== step.team_id) way.unshift(step);
        }
        place.escalations
          .filter((escalation) => escalation.held_by === null)
          .forEach((escalation) => {
            found.push({
              node_id: place.team_id,
              session_id: place.session,
              session: session?.title ?? "",
              escalation,
              path: way.map((step) => ({
                id: step.team_id,
                title: step.title,
              })),
            });
          });
      });
    }
    const rank = (/** @type {OpenEscalation} */ item) =>
      item.escalation.kind === "critical_issue" ? 0 : 1;
    return found.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.escalation.raised_at.localeCompare(b.escalation.raised_at),
    );
  }

  /**
   * The focused node, its ancestors, and the direct reports of the focused
   * node; with `full`, every node below it instead.
   *
   * @param {NodeId} focusId
   * @param {boolean} [full]
   * @returns {Extract<OrgEvent, { type: "snapshot" }> | null}
   */
  snapshot(focusId, full = false) {
    const focus = this.#nodes.get(focusId);
    if (!focus) return null;
    /** @type {Map<NodeId, OrgNode>} */
    const nodes = new Map();
    [
      ...this.ancestors(focusId),
      focus,
      ...this.children(focusId),
      ...(full ? this.#below(focusId) : []),
    ].forEach((node) => nodes.set(node.id, node));
    return {
      type: "snapshot",
      focus_id: focusId,
      nodes: [...nodes.values()],
      escalations: this.#waitingAnywhere(),
      sessions: this.sessions(),
    };
  }

  /** What waits on the human in the whole tree. */
  #waitingAnywhere() {
    return this.#rootId === null ? [] : this.escalations(this.#rootId);
  }

  /** @param {NodeId} id @returns {OrgNode[]} Every node below `id`. */
  #below(id) {
    return this.children(id).flatMap((child) => [
      child,
      ...this.#below(child.id),
    ]);
  }

  /**
   * Receive events for what a snapshot of `focusId` contains.
   *
   * @param {NodeId} focusId
   * @param {OrgListener} listener
   * @param {boolean} [full]
   * @returns {() => void} Unsubscribe.
   */
  subscribe(focusId, listener, full = false) {
    let told = JSON.stringify(this.#waitingAnywhere());
    const subscription = {
      /** @param {Emission} emission */
      deliver: (emission) => {
        if (
          this.#isVisibleFrom(focusId, emission.id, emission.parent_id) ||
          (full &&
            this.ancestors(emission.id).some(
              (ancestor) => ancestor.id === focusId,
            ))
        ) {
          listener(emission.event);
        }
      },
      announce: () => {
        const escalations = this.#waitingAnywhere();
        const current = JSON.stringify(escalations);
        if (current === told) return;
        told = current;
        listener({ type: "escalations", escalations });
      },
      tell: listener,
    };
    this.#listeners.add(subscription);
    return () => {
      this.#listeners.delete(subscription);
    };
  }

  /**
   * @param {NodeId} focusId
   * @param {NodeId} id
   * @param {NodeId | null} parent_id
   */
  #isVisibleFrom(focusId, id, parent_id) {
    if (id === focusId || parent_id === focusId) return true;
    return this.ancestors(focusId).some((ancestor) => ancestor.id === id);
  }

  /** Announce a team again. @param {NodeId | null} id */
  #announce(id) {
    const node = id === null ? undefined : this.#nodes.get(id);
    if (node) {
      this.#emit({ type: "node_upsert", node }, node.id, node.parent_id);
    }
  }

  /**
   * @param {OrgEvent} event
   * @param {NodeId} id
   * @param {NodeId | null} parent_id
   */
  #emit(event, id, parent_id) {
    [...this.#listeners].forEach((listener) =>
      listener.deliver({ event, id, parent_id }),
    );
  }

  /** Tell every subscriber what the sessions are now. */
  #announceSessions() {
    const sessions = this.sessions();
    [...this.#listeners].forEach((listener) =>
      listener.tell({ type: "sessions", sessions }),
    );
  }

  /** Tell each subscriber whose list of escalations just changed. */
  #announceEscalations() {
    [...this.#listeners].forEach((listener) => listener.announce());
  }
}
