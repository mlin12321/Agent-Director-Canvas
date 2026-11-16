import React from "react";
import { ChevronRight, ExternalLink, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ConversationLink } from "#/api/director/types";
import { NavigationLink } from "#/components/shared/navigation-link";
import { SubChatContext } from "#/context/sub-chat";
import { I18nKey } from "#/i18n/declaration";
import { AgentConversation } from "./agent-conversation";
import { useLinkLabel } from "./conversation-links";
import { conversationPath } from "./org-sessions";

/**
 * Lets the chat window open the conversation of another agent of the org on
 * top of the one it shows, and another from there: a path of sub-chats, each
 * one level from the last. The path is shown above the sub-chat, and each
 * step of it goes back to that conversation.
 *
 * Only one conversation is live at a time, so the conversation the window
 * was opened on is put away while a sub-chat is read and comes back when
 * the path is left.
 */
export function SubChatHost({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("openhands");
  const [path, setPath] = React.useState<ConversationLink[]>([]);
  const label = useLinkLabel();
  const open = React.useCallback((link: ConversationLink) => {
    setPath((current) => {
      // Going to one already on the path goes back to it.
      const at = current.findIndex(
        (step) => step.conversation_id === link.conversation_id,
      );
      return at >= 0 ? current.slice(0, at + 1) : [...current, link];
    });
  }, []);
  const shown = path[path.length - 1];

  return (
    <SubChatContext.Provider value={open}>
      {shown ? (
        <div data-testid="sub-chat" className="flex h-full min-h-0 flex-col">
          <nav
            aria-label={t(I18nKey.ORG_CHART$SUB_CHAT_PATH)}
            className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-3 py-1.5 text-xs text-text-secondary"
          >
            <button
              type="button"
              onClick={() => setPath([])}
              className="text-link hover:underline"
            >
              {t(I18nKey.ORG_CHART$SUB_CHAT_ROOT)}
            </button>
            {path.map((step, index) => (
              <React.Fragment key={step.conversation_id}>
                <ChevronRight width={12} height={12} aria-hidden="true" />
                {step === shown ? (
                  <span aria-current="page" className="text-contrast">
                    {label(step)}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPath(path.slice(0, index + 1))}
                    className="text-link hover:underline"
                  >
                    {label(step)}
                  </button>
                )}
              </React.Fragment>
            ))}
            <NavigationLink
              to={conversationPath(shown.conversation_id)}
              title={t(I18nKey.ORG_CHART$SUB_CHAT_OPEN_FULL)}
              aria-label={t(I18nKey.ORG_CHART$SUB_CHAT_OPEN_FULL)}
              className="ml-auto flex h-6 w-6 items-center justify-center rounded-md hover:bg-surface-raised hover:text-contrast"
            >
              <ExternalLink width={12} height={12} aria-hidden="true" />
            </NavigationLink>
            <button
              type="button"
              onClick={() => setPath([])}
              title={t(I18nKey.ORG_CHART$SUB_CHAT_CLOSE)}
              aria-label={t(I18nKey.ORG_CHART$SUB_CHAT_CLOSE)}
              className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-surface-raised hover:text-contrast"
            >
              <X width={12} height={12} aria-hidden="true" />
            </button>
          </nav>
          <div className="min-h-0 flex-1">
            <AgentConversation
              key={shown.conversation_id}
              conversationId={shown.conversation_id}
            />
          </div>
        </div>
      ) : (
        children
      )}
    </SubChatContext.Provider>
  );
}
