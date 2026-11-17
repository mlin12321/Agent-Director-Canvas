import { useQuery } from "@tanstack/react-query";
import { DirectorClient } from "#/api/director/director-client";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";

const REFRESH_MS = 30_000;

/**
 * How many escalations of the org wait on the human, for a place that is
 * not the org's own page. Zero where the backend has no director.
 */
export function useWaitingOnHuman(enabled: boolean): number {
  const { backend } = useActiveBackend();
  const { data } = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.sessions(backend.id),
    queryFn: () => DirectorClient.listSessions(),
    enabled,
    retry: false,
    refetchInterval: REFRESH_MS,
    meta: { disableToast: true },
  });
  return (data ?? [])
    .flatMap((session) => session.teams)
    .flatMap((team) => team.escalations)
    .filter((escalation) => escalation.held_by === null).length;
}
