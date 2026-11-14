import { useQuery } from "@tanstack/react-query";
import { DirectorClient } from "#/api/director/director-client";
import type { NodeId } from "#/api/director/types";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";

/** What the ICs and Managers around a team have written to each other. */
export function useNodeMessages(nodeId: NodeId) {
  const { backend } = useActiveBackend();
  return useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.messages(backend.id, nodeId),
    queryFn: () => DirectorClient.getNodeMessages(nodeId),
    retry: false,
  });
}
