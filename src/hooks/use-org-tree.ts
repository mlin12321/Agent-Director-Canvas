import React from "react";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  subscribeOrgTree,
  type OrgStreamStatus,
} from "#/api/director/director-client";
import type {
  NodeId,
  OpenEscalation,
  OrgEvent,
  OrgNode,
  PauseReason,
  Session,
} from "#/api/director/types";

interface OrgTreeState {
  status: OrgStreamStatus;
  focusId: NodeId | null;
  nodes: ReadonlyMap<NodeId, OrgNode>;
  escalations: OpenEscalation[];
  sessions: Session[];
  orgState: OrgRunState | null;
}

/** Whether the org is paused, and whether a pull waits for choices. */
export interface OrgRunState {
  paused: PauseReason | null;
  merging: boolean;
}

type OrgTreeAction =
  | { kind: "subscribe" }
  | { kind: "status"; status: OrgStreamStatus }
  | { kind: "event"; event: OrgEvent };

const INITIAL_STATE: OrgTreeState = {
  status: "connecting",
  focusId: null,
  nodes: new Map(),
  escalations: [],
  sessions: [],
  orgState: null,
};

function reduce(state: OrgTreeState, action: OrgTreeAction): OrgTreeState {
  // A new subscription keeps what is on screen until its snapshot arrives,
  // but may leave the terminal state of the previous one.
  if (action.kind === "subscribe") {
    return state.status === "not_found"
      ? { ...state, status: "connecting" }
      : state;
  }
  // Terminal for this subscription: later frames about the node's former
  // ancestors must not bring a removed node back.
  if (state.status === "not_found") return state;
  if (action.kind === "status") {
    return state.status === action.status
      ? state
      : { ...state, status: action.status };
  }

  const { event } = action;
  switch (event.type) {
    case "snapshot":
      return {
        status: "live",
        focusId: event.focus_id,
        nodes: new Map(event.nodes.map((node) => [node.id, node])),
        escalations: event.escalations,
        sessions: event.sessions,
        orgState: {
          paused: event.paused ?? null,
          merging: event.merging ?? false,
        },
      };
    case "org_state":
      return {
        ...state,
        orgState: { paused: event.paused, merging: event.merging },
      };
    case "node_upsert": {
      const nodes = new Map(state.nodes);
      nodes.set(event.node.id, event.node);
      return { ...state, nodes };
    }
    case "node_removed": {
      // Losing the followed node means there is nothing left to show here.
      if (event.id === state.focusId) {
        return { ...state, status: "not_found" };
      }
      const nodes = new Map(state.nodes);
      nodes.delete(event.id);
      return { ...state, nodes };
    }
    case "escalations":
      return { ...state, escalations: event.escalations };
    case "sessions":
      return { ...state, sessions: event.sessions };
    default:
      return state;
  }
}

export interface OrgTreeView {
  status: OrgStreamStatus;
  /** The node the stream follows; `null` until its first snapshot. */
  focusId: NodeId | null;
  /** Every node the server has sent for this subscription. */
  nodes: ReadonlyMap<NodeId, OrgNode>;
  /** Every escalation in the tree that waits on the human. */
  escalations: OpenEscalation[];
  /**
   * The sessions that are open: lines of work beside the org's own. They
   * are no nodes of the tree.
   */
  sessions: Session[];
  /** As the stream last said it; `null` before its first event. */
  orgState: OrgRunState | null;
}

/**
 * Live view of one node of the org tree (`nodeId: null` is the root) with
 * its ancestors and direct reports, or with `full` every node below it.
 *
 * Following another node keeps the previous one on screen until the server
 * answers, so moving through the chart does not flash a loading state.
 */
export function useOrgTree(nodeId: NodeId | null, full = false): OrgTreeView {
  const [state, dispatch] = React.useReducer(reduce, INITIAL_STATE);
  // The stream is the active backend's: another backend is another org.
  const backendId = useActiveBackend().backend.id;

  React.useEffect(() => {
    dispatch({ kind: "subscribe" });
    return subscribeOrgTree(
      nodeId,
      {
        onEvent: (event) => dispatch({ kind: "event", event }),
        onStatus: (status) => dispatch({ kind: "status", status }),
      },
      full,
    );
  }, [nodeId, full, backendId]);

  return state;
}
