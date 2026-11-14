import { useQuery } from "@tanstack/react-query";
import { DirectorClient } from "#/api/director/director-client";
import type { NodeId } from "#/api/director/types";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";

/** What a team works to and what its agents reported: spec, contracts, reports. */
export function useNodeMemory(nodeId: NodeId) {
  const { backend } = useActiveBackend();
  return useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.memory(backend.id, nodeId),
    queryFn: () => DirectorClient.getNodeMemory(nodeId),
    retry: false,
  });
}
