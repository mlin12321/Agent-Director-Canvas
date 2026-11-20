import { useQuery } from "@tanstack/react-query";
import { DirectorClient } from "#/api/director/director-client";
import type { AgentTypeInfo } from "#/api/director/types";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "./query-keys";

export interface OrgStartingAgentTypes {
  /** The type the server gives the top team when none is named. */
  defaultType: string;
  /** The other types the top team may be. */
  others: AgentTypeInfo[];
}

/**
 * The agent types the top team of a new org may be, for a first message
 * that would start one. `null` when there is nothing to choose: the server
 * has no director (or cannot be asked), or it already has an org, whose
 * teams the message goes to as they are.
 */
export function useOrgStartingAgentTypes(
  enabled: boolean,
): OrgStartingAgentTypes | null {
  const { backend } = useActiveBackend();
  const settings = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.orgSettings(backend.id),
    queryFn: () => DirectorClient.getOrgSettings(),
    enabled,
    retry: false,
    staleTime: 0,
    meta: { disableToast: true },
  });
  const org = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.org(backend.id),
    queryFn: () => DirectorClient.getOrg(),
    enabled,
    retry: false,
    staleTime: 0,
    meta: { disableToast: true },
  });
  // Until the server has said that it has no org, there is none to start.
  if (!enabled || !settings.data || org.data?.root_id !== null) return null;
  const defaultType = settings.data.default_agent_type;
  return {
    defaultType,
    others: settings.data.agent_types.filter(
      (type) => type.allowed && type.name !== defaultType,
    ),
  };
}
