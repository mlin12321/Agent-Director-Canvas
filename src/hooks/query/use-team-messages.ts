import { useQueries } from "@tanstack/react-query";
import { ORG_REFRESH_MS } from "#/constants/org-chart";
import { DirectorClient } from "#/api/director/director-client";
import type { NodeId } from "#/api/director/types";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";

/**
 * What the ICs and Managers around a team have written to each other, in
 * each of the places sessions have at it. Nobody works at a team itself, so
 * the server keeps threads per place.
 */
export function useTeamMessages(placeIds: NodeId[]) {
  const { backend } = useActiveBackend();
  return useQueries({
    queries: placeIds.map((placeId) => ({
      queryKey: DIRECTOR_QUERY_KEYS.messages(backend.id, placeId),
      queryFn: () => DirectorClient.getNodeMessages(placeId),
      retry: false,
      // The stream tells of teams, not of what they write.
      refetchInterval: ORG_REFRESH_MS,
    })),
    combine: (results) => ({
      isSuccess: results.every((result) => result.isSuccess),
      data: results.flatMap((result) => result.data ?? []),
    }),
  });
}
