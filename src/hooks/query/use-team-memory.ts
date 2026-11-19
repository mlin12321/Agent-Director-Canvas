import { useQuery } from "@tanstack/react-query";
import { ORG_REFRESH_MS } from "#/constants/org-chart";
import { DirectorClient } from "#/api/director/director-client";
import type { NodeId } from "#/api/director/types";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";

/** What a team works to and what its agents reported: spec, contracts, reports. */
export function useTeamMemory(nodeId: NodeId) {
  const { backend } = useActiveBackend();
  return useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.memory(backend.id, nodeId),
    queryFn: () => DirectorClient.getNodeMemory(nodeId),
    retry: false,
    // The stream tells of teams, not of what they write.
    refetchInterval: ORG_REFRESH_MS,
  });
}
