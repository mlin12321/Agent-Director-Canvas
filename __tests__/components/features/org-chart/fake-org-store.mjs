/**
 * Test double for the Agent Server's director org tree. It derives
 * `child_ids`, `descendant_counts` and `escalation_count` and emits the same events, scoped the
 * same way, as `openhands.agent_server.director.org_store` in the SDK, so UI
 * tests can drive realistic event sequences without a server.
 *
 * @import { StatusCounts, NodeStatus, NodeId, OpenEscalation, OrgEvent, OrgNode } from "../../../../src/api/director/types.ts"
 */

/** @type {readonly NodeStatus[]} */
export const NODE_STATUSES = Object.freeze([
  "idle",
  "working",
  "done",
  "blocked",
]);

/** @returns {StatusCounts} */
export function emptyStatusCounts() {
  return /** @type {StatusCounts} */ (
    Object.fromEntries(NODE_STATUSES.map((status) => [status, 0]))
  );
}

/**
 * What a caller supplies; the store fills in the derived fields.
 * @typedef {Omit<OrgNode, "child_ids" | "session_ids" | "descendant_counts" | "escalation_count">} OrgNodeInput
 * @typedef {(event: OrgEvent) => void} OrgListener
 * @typedef {{ event: OrgEvent, id: NodeId, parent_id: NodeId | null }} Emission
 */

export class OrgStoreError extends Error {
  constructor(message) {
    super(message);
    this.name = "OrgStoreError";
  }
}

/** @param {StatusCounts} a @param {StatusCounts} b */
function sameCounts(a, b) {
  return NODE_STATUSES.every((status) => a[status] === b[status]);
}

/** @param {Pick<OrgNode, "escalations">} node */
function waitingOnHuman(node) {
  return node.escalations.filter((escalation) => escalation.held_by === null)
    .length;
}

export class OrgStore {
  /** @type {Map<NodeId, OrgNode>} */
  #nodes = new Map();

  /** @type {NodeId | null} */
  #rootId = null;

  /** @type {Set<{ deliver: (emission: Emission) => void, announce: () => void }>} */
  #listeners = new Set();

  get rootId() {
    return this.#rootId;
  }

  get size() {
    return this.#nodes.size;
  }

  /** @param {NodeId} id @returns {OrgNode | undefined} */
  get(id) {
    return this.#nodes.get(id);
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
      session_ids: existing ? existing.session_ids : [],
      descendant_counts: existing
        ? existing.descendant_counts
        : emptyStatusCounts(),
      escalation_count:
        waitingOnHuman(input) +
        this.children(input.id).reduce(
          (sum, child) => sum + child.escalation_count,
          0,
        ),
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
          session_ids:
            node.session === parent.session
              ? parent.session_ids
              : [...parent.session_ids, node.id],
        });
      }
    }

    this.#emit({ type: "node_upsert", node }, node.id, node.parent_id);
    // A new child changes its parent's `child_ids`, so the parent is always
    // re-announced on insert; above that, only changed rollups are.
    this.#refreshAncestors(node.parent_id, !existing);
    this.#announceEscalations();
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
          session_ids: parent.session_ids.filter((childId) => childId !== id),
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

    this.#refreshAncestors(node.parent_id, true);
    this.#announceEscalations();
    return true;
  }

  /**
   * Every escalation at or below `focusId` that waits on the human: critical
   * issues first, then the longest waiting.
   *
   * @param {NodeId} focusId
   * @returns {OpenEscalation[]}
   */
  escalations(focusId) {
    /** @type {OpenEscalation[]} */
    const found = [];
    const focus = this.#nodes.get(focusId);
    const stack = focus ? [focus] : [];
    while (stack.length > 0) {
      const node = /** @type {OrgNode} */ (stack.pop());
      const path = [...this.ancestors(node.id), node].map(({ id, title }) => ({
        id,
        title,
      }));
      node.escalations
        .filter((escalation) => escalation.held_by === null)
        .forEach((escalation) => {
          found.push({ node_id: node.id, escalation, path });
        });
      stack.push(...this.children(node.id).reverse());
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

  /** @param {OrgNode} node */
  #rollup(node) {
    const counts = emptyStatusCounts();
    let escalationCount = waitingOnHuman(node);
    this.children(node.id).forEach((child) => {
      counts[child.status] += 1;
      NODE_STATUSES.forEach((status) => {
        counts[status] += child.descendant_counts[status];
      });
      escalationCount += child.escalation_count;
    });
    return { counts, escalationCount };
  }

  /**
   * Recompute rollups from `startId` up to the root, announcing every node
   * whose rollup changed.
   *
   * @param {NodeId | null} startId
   * @param {boolean} alwaysAnnounceFirst
   */
  #refreshAncestors(startId, alwaysAnnounceFirst) {
    let currentId = startId;
    let first = true;
    while (currentId !== null) {
      const current = this.#nodes.get(currentId);
      if (!current) return;
      const { counts, escalationCount } = this.#rollup(current);
      const changed =
        !sameCounts(counts, current.descendant_counts) ||
        escalationCount !== current.escalation_count;
      const announced = changed
        ? {
            ...current,
            descendant_counts: counts,
            escalation_count: escalationCount,
          }
        : current;
      if (changed) this.#nodes.set(announced.id, announced);
      if (changed || (first && alwaysAnnounceFirst)) {
        this.#emit(
          { type: "node_upsert", node: announced },
          announced.id,
          announced.parent_id,
        );
      }
      first = false;
      currentId = current.parent_id;
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

  /** Tell each subscriber whose list of escalations just changed. */
  #announceEscalations() {
    [...this.#listeners].forEach((listener) => listener.announce());
  }
}
