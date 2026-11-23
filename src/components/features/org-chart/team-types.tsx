import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DirectorClient } from "#/api/director/director-client";
import type { AgentTypeInfo, MemberInfo } from "#/api/director/types";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";
import { I18nKey } from "#/i18n/declaration";

/**
 * Who the members of a team are, by its type. A type names its members
 * whatever it likes, so nothing on the page knows a member by name: it asks
 * here what a member is called and what its part is.
 */
export interface TeamTypes {
  /**
   * The member an agent's `role` names in a team of a type. Where the type
   * is not given or not known, the first member of that name in any type;
   * a member no type has is called by its role and has no part.
   */
  member(role: string, agentType?: string | null): MemberInfo;
  /** The members of a team of a type, in the type's order. */
  members(agentType: string | null | undefined): readonly MemberInfo[];
}

export function teamTypesOf(types: readonly AgentTypeInfo[]): TeamTypes {
  const byType = new Map(types.map((type) => [type.name, type.members]));
  const members = (agentType: string | null | undefined) =>
    (agentType ? byType.get(agentType) : undefined) ?? [];
  return {
    members,
    member(role, agentType) {
      const named = (member: MemberInfo) => member.name === role;
      return (
        members(agentType).find(named) ??
        // A team whose type is not known here, or not given.
        types.flatMap((type) => type.members).find(named) ?? {
          name: role,
          title: role,
          writes: false,
          reviews: false,
          oversees: false,
        }
      );
    },
  };
}

/** Types given from outside; `null` leaves them to be asked of the server. */
export const TeamTypesContext = React.createContext<TeamTypes | null>(null);

const NO_TYPES = teamTypesOf([]);

export function useTeamTypes(): TeamTypes {
  const given = React.useContext(TeamTypesContext);
  const { backend } = useActiveBackend();
  const settings = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.orgSettings(backend.id),
    queryFn: () => DirectorClient.getOrgSettings(),
    enabled: given === null,
    retry: false,
    meta: { disableToast: true },
  });
  const types = settings.data?.agent_types;
  const asked = React.useMemo(
    () => (types ? teamTypesOf(types) : NO_TYPES),
    [types],
  );
  return given ?? asked;
}

/**
 * The words of the page for the titles of the shipped types, which are
 * translated; a title of another type is shown as the type gives it.
 */
const TRANSLATED: Record<
  string,
  { label: I18nKey; lead: I18nKey; answer: I18nKey; notStarted?: I18nKey }
> = {
  IC: {
    label: I18nKey.ORG_CHART$ROLE_IC,
    lead: I18nKey.ORG_CHART$DIVISION_LEAD_IC,
    answer: I18nKey.ORG_CHART$ESCALATION_ANSWER_TO_IC,
  },
  Manager: {
    label: I18nKey.ORG_CHART$ROLE_MANAGER,
    lead: I18nKey.ORG_CHART$DIVISION_LEAD_MANAGER,
    answer: I18nKey.ORG_CHART$ESCALATION_ANSWER_TO_MANAGER,
    notStarted: I18nKey.ORG_CHART$MANAGER_NOT_STARTED,
  },
};

/** What the page calls a member, alone and in the phrases that name one. */
export function useMemberWords() {
  const { t } = useTranslation("openhands");
  return React.useMemo(() => {
    const known = (member: MemberInfo) =>
      Object.hasOwn(TRANSLATED, member.title)
        ? TRANSLATED[member.title]
        : undefined;
    const label = (member: MemberInfo) => {
      const words = known(member);
      return words ? t(words.label) : member.title;
    };
    return {
      label,
      /** The member where its team only reviews a session's work. */
      lead(member: MemberInfo) {
        const words = known(member);
        return words
          ? t(words.lead)
          : t(I18nKey.ORG_CHART$DIVISION_LEAD_MEMBER, {
              member: member.title,
            });
      },
      /** Where an answer to what the member raised goes. */
      answerTo(member: MemberInfo, team: string) {
        const words = known(member);
        return words
          ? t(words.answer, { team })
          : t(I18nKey.ORG_CHART$ESCALATION_ANSWER_TO_MEMBER, {
              member: member.title,
              team,
            });
      },
      notStarted(member: MemberInfo) {
        const key = known(member)?.notStarted;
        return key
          ? t(key)
          : t(I18nKey.ORG_CHART$MEMBER_NOT_STARTED, { member: label(member) });
      },
    };
  }, [t]);
}
