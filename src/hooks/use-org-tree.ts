import React from "react";
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
} from "#/api/director/types";

interface OrgTreeState {
  status: OrgStreamStatus;
  focusId: NodeId | null;
  nodes: ReadonlyMap<NodeId, OrgNode>;
  escalations: OpenEscalation[];
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
        orgState: { paused: event.paused, merging: event.merging },
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
  /** As the stream last said it; `null` before its first event. */
  orgState: OrgRunState | null;
}

/**
 * Live view of one node of the org tree (`nodeId: null` is the root) with
 * its ancestors and direct reports, or with `full` every node below it.
 *
 * Following another node keeps the previous one on screen until the server
 * answers, so moving through the chart does not flash a loading state.
 *
 * @returns The view, and `reconnect` to connect again at once when the
 *   caller knows the tree has just changed on the server (an org was
 *   started) and waiting out the retry delay would only stall the page.
 */
export function useOrgTree(
  nodeId: NodeId | null,
  full = false,
): OrgTreeView & { reconnect: () => void } {
  const [state, dispatch] = React.useReducer(reduce, INITIAL_STATE);
  const [connection, setConnection] = React.useState(0);
  const reconnect = React.useCallback(
    () => setConnection((current) => current + 1),
    [],
  );

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
  }, [nodeId, full, connection]);

  return React.useMemo(() => ({ ...state, reconnect }), [state, reconnect]);
}
