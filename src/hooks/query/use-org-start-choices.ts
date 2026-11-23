import { useQuery } from "@tanstack/react-query";
import { DirectorClient } from "#/api/director/director-client";
import type { AgentTypeInfo } from "#/api/director/types";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "./query-keys";

export interface OrgStartChoices {
  /** Whether the server already has an org, which takes the message. */
  hasOrg: boolean;
  /** The type the server gives the top team of a new org that names none. */
  defaultType: AgentTypeInfo;
  /** The other types the top team of a new org may be; none with an org. */
  others: AgentTypeInfo[];
}

/**
 * What a first message can be offered to on a server with a director: the
 * org it has, or a new org whose top team is of one of these agent types.
 * `null` on a server without a director, or one that cannot be asked.
 */
export function useOrgStartChoices(enabled: boolean): OrgStartChoices | null {
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
  if (!enabled || !settings.data || !org.data) return null;
  const hasOrg = org.data.root_id !== null;
  const name = settings.data.default_agent_type;
  const types = settings.data.agent_types;
  return {
    hasOrg,
    defaultType: types.find((type) => type.name === name) ?? {
      name,
      description: "",
      allowed: true,
      sas_profile: null,
      members: [],
    },
    others: hasOrg
      ? []
      : types.filter((type) => type.allowed && type.name !== name),
  };
}
