import { ORG_REFRESH_MS } from "#/constants/org-chart";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DirectorClient } from "#/api/director/director-client";
import type {
  ConversationLink,
  ConversationPlace,
  ConversationRelation,
} from "#/api/director/types";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { SubChatContext } from "#/context/sub-chat";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";
import { I18nKey } from "#/i18n/declaration";
import { useMemberWords, useTeamTypes } from "./team-types";

const RELATIONS: ConversationRelation[] = ["above", "beside", "below"];

const RELATION_LABEL_KEYS: Record<ConversationRelation, I18nKey> = {
  above: I18nKey.ORG_CHART$LINK_ABOVE,
  beside: I18nKey.ORG_CHART$LINK_BESIDE,
  below: I18nKey.ORG_CHART$LINK_BELOW,
};

/** Where a conversation is in the org; nothing for one that is no agent's. */
function useConversationPlace(conversationId: string | null) {
  const { backend } = useActiveBackend();
  return useQuery<ConversationPlace | null>({
    queryKey: DIRECTOR_QUERY_KEYS.conversationPlace(backend.id, conversationId),
    // Most conversations belong to no org, and a server may have no
    // director at all: neither is an error to show.
    queryFn: () =>
      DirectorClient.getConversationPlace(conversationId!).catch(() => null),
    enabled: Boolean(conversationId),
    refetchInterval: (query) => (query.state.data ? ORG_REFRESH_MS : false),
    retry: false,
    meta: { disableToast: true },
  });
}

/** What a conversation is called by where its agent works. */
export function useLinkLabel() {
  const types = useTeamTypes();
  const words = useMemberWords();
  return React.useCallback(
    (link: Pick<ConversationLink, "team" | "role" | "session">) => {
      const agent = `${link.team} ${words.label(types.member(link.role))}`;
      return link.session ? `${agent} · ${link.session}` : agent;
    },
    [types, words],
  );
}

/**
 * The conversations one level from the one being read, as links: the agents
 * of the team above, the other agent of the same team, the ICs of the
 * sub-teams and of the sessions this team reviews. A link opens that
 * conversation inside this chat window. Shown only for a conversation of an
 * org's agent, and only where a sub-chat can be opened.
 */
export function ConversationLinks({
  conversationId,
}: {
  conversationId: string;
}) {
  const { t } = useTranslation("openhands");
  const open = React.useContext(SubChatContext);
  const place = useConversationPlace(open ? conversationId : null);
  const label = useLinkLabel();
  const links = place.data?.links ?? [];
  if (!open || links.length === 0) return null;

  return (
    <nav
      data-testid="conversation-links"
      aria-label={t(I18nKey.ORG_CHART$CONVERSATION_LINKS)}
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-3 py-1.5 text-xs text-text-secondary"
    >
      {RELATIONS.map((relation) => {
        const group = links.filter((link) => link.relation === relation);
        if (group.length === 0) return null;
        return (
          <span key={relation} className="flex flex-wrap items-center gap-x-2">
            <span className="text-muted">
              {t(RELATION_LABEL_KEYS[relation])}
            </span>
            {group.map((link) => (
              <button
                key={link.conversation_id}
                type="button"
                onClick={() => open(link)}
                className="text-link hover:underline"
              >
                {label(link)}
              </button>
            ))}
          </span>
        );
      })}
    </nav>
  );
}
