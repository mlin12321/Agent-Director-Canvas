import { useTranslation } from "react-i18next";
import type { NodeId, OrgNode, Thread } from "#/api/director/types";
import { useNodeMessages } from "#/hooks/query/use-node-messages";
import { I18nKey } from "#/i18n/declaration";
import { ROLE_LABEL_KEYS } from "./org-chart-presentation";

interface TeamMessagesProps {
  node: OrgNode;
  /** The teams known to the page, to name the other side of a thread. */
  nodes?: ReadonlyMap<NodeId, OrgNode>;
}

/**
 * What the ICs and Managers around a team have written to each other: the
 * team's own two, its Manager with the ICs directly below, and the Manager
 * above with its IC. Read-only; the agents write these themselves.
 */
export function TeamMessages({ node, nodes }: TeamMessagesProps) {
  const { t } = useTranslation("openhands");
  const messages = useNodeMessages(node.id);

  // The team's reports explain it when the team memory cannot be read.
  if (!messages.isSuccess) return null;

  const titleOf = (id: NodeId) => nodes?.get(id)?.title ?? id;
  const heading = (thread: Thread) => {
    if (thread.manager_node_id !== node.id) {
      return t(I18nKey.ORG_CHART$MESSAGES_ABOVE, {
        team: titleOf(thread.manager_node_id),
      });
    }
    if (thread.ic_node_id !== node.id) {
      return t(I18nKey.ORG_CHART$MESSAGES_BELOW, {
        team: titleOf(thread.ic_node_id),
      });
    }
    return t(I18nKey.ORG_CHART$MESSAGES_OWN);
  };

  return (
    <section
      aria-label={t(I18nKey.ORG_CHART$MESSAGES_TITLE)}
      className="flex flex-col gap-2"
    >
      <h3 className="text-sm font-medium text-contrast">
        {t(I18nKey.ORG_CHART$MESSAGES_TITLE)}
      </h3>
      {messages.data.length === 0 ? (
        <p className="text-xs text-muted">
          {t(I18nKey.ORG_CHART$MESSAGES_EMPTY)}
        </p>
      ) : (
        messages.data.map((thread) => (
          <div
            key={`${thread.manager_node_id}/${thread.ic_node_id}`}
            role="group"
            aria-label={heading(thread)}
            className="flex flex-col gap-1.5"
          >
            <h4 className="text-xs font-medium text-text-secondary">
              {heading(thread)}
            </h4>
            <ul className="flex flex-col gap-1.5 text-xs text-text-secondary">
              {thread.messages.map((message) => (
                <li
                  key={`${message.sender}-${message.at}`}
                  className="flex flex-col"
                >
                  <span className="whitespace-pre-wrap break-words">
                    {message.text}
                  </span>
                  <span className="text-muted">
                    {t(ROLE_LABEL_KEYS[message.sender])}
                    {" · "}
                    <time dateTime={message.at}>
                      {new Date(message.at).toLocaleString()}
                    </time>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
