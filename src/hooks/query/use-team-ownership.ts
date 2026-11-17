import { ORG_REFRESH_MS } from "#/constants/org-chart";
import { useQuery } from "@tanstack/react-query";
import { DirectorClient } from "#/api/director/director-client";
import type { OrgNode } from "#/api/director/types";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";

/** Files change without the org tree saying so; this is how stale a map gets. */

/**
 * Which direct report owns each file of a team's boundary, and where the
 * teams' committed work collides. Asked again whenever the team's reports
 * change, and every few seconds.
 */
export function useTeamOwnership(node: OrgNode | null) {
  const { backend } = useActiveBackend();
  return useQuery({
    queryKey: [
      ...DIRECTOR_QUERY_KEYS.ownership(backend.id, node?.id ?? ""),
      node?.child_ids.join(",") ?? "",
    ],
    queryFn: () => DirectorClient.getNodeOwnership(node?.id ?? ""),
    enabled: node !== null,
    refetchInterval: ORG_REFRESH_MS,
    retry: false,
    meta: { disableToast: true },
  });
}
