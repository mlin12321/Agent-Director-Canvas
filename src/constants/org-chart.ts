import type { NodeId } from "#/api/director/types";

export const ORG_CHART_PATH = "/org";

/** How often what is read of the org beside the tree is read again. */
export const ORG_REFRESH_MS = 15_000;

/**
 * The team a place is at. What a session has at a team is named
 * `<team>@<session>`, and its Division Lead place `<team>@<session>@lead`.
 */
export function teamOfPlace(placeId: string): NodeId {
  return placeId.split("@")[0];
}

/** Route to the chart at one node; `null` is the root of the tree. */
export function orgNodePath(nodeId: NodeId | null) {
  return nodeId === null
    ? ORG_CHART_PATH
    : `${ORG_CHART_PATH}/${encodeURIComponent(nodeId)}`;
}
