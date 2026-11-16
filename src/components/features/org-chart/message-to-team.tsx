import React from "react";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DirectorClient, DirectorError } from "#/api/director/director-client";
import type {
  NodeId,
  OpenedSession,
  OrgNode,
  RoutedMessage,
} from "#/api/director/types";
import { NavigationLink } from "#/components/shared/navigation-link";
import { orgNodePath } from "#/constants/org-chart";
import { I18nKey } from "#/i18n/declaration";

type Sent =
  | { session: OpenedSession["session"] }
  | { session: null; routed: RoutedMessage };

/**
 * Writes to the team the page shows. The message goes the way every message
 * of the human goes: to the IC of the nearest team at or above the team's
 * directory that can take it, which the answer names. Written to the top
 * team it is for the org as a whole, and may go straight to the team below
 * that it concerns. It only says something; it prunes, replaces and splits
 * nothing.
 *
 * Sent as a new session, what is written is a request of its own: the team
 * gets one more IC for it, in a git worktree of its own, and the IC of the
 * team above reviews what comes of it. A team of a session is written to
 * as that team; its directory is also another team's.
 */
export function MessageToTeam({
  node,
  nodes,
}: {
  node: OrgNode;
  nodes: ReadonlyMap<NodeId, OrgNode>;
}) {
  const { t } = useTranslation("openhands");
  const [draft, setDraft] = React.useState("");
  const [asSession, setAsSession] = React.useState(false);
  const [name, setName] = React.useState("");
  const inputId = React.useId();
  const send = useMutation({
    mutationFn: async (text: string): Promise<Sent> => {
      if (asSession) {
        // From the top team the director chooses the team, as it does for
        // a message.
        const title = name.trim();
        const opened = await DirectorClient.openSession({
          text,
          ...(title ? { title } : {}),
          ...(node.parent_id === null ? {} : { node_id: node.id }),
        });
        return { session: opened.session };
      }
      const routed = await DirectorClient.routeMessage(
        node.session
          ? { text, node_id: node.id }
          : {
              text,
              path: node.boundary.path,
              // What is written to the top team is for the org as a whole,
              // and its director may send it straight to the team it
              // concerns.
              auto: node.parent_id === null,
            },
      );
      return { session: null, routed };
    },
    onSuccess: () => {
      setDraft("");
      setAsSession(false);
      setName("");
    },
    meta: { disableToast: true },
  });
  const text = draft.trim();
  const routed = send.data && !send.data.session ? send.data.routed : null;
  const opened = send.data?.session ?? null;
  const taken = routed ? nodes.get(routed.node_id) : undefined;

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (text) send.mutate(text);
  };

  return (
    <form
      data-testid="org-message"
      onSubmit={onSubmit}
      className="flex flex-col gap-1.5"
    >
      <label htmlFor={inputId} className="text-xs text-text-secondary">
        {t(I18nKey.ORG_CHART$MESSAGE_LABEL, { team: node.title })}
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id={inputId}
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-0 flex-1 resize-y rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-contrast"
        />
        <button
          type="submit"
          disabled={!text || send.isPending}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-contrast hover:bg-surface-raised disabled:opacity-40"
        >
          <Send width={12} height={12} aria-hidden="true" />
          {t(I18nKey.ORG_CHART$MESSAGE_SEND)}
        </button>
      </div>
      {node.session ? null : (
        <label
          className="flex w-fit items-center gap-1.5 text-xs text-text-secondary"
          title={t(I18nKey.ORG_CHART$SESSION_NEW_HELP)}
        >
          <input
            type="checkbox"
            checked={asSession}
            onChange={(event) => setAsSession(event.target.checked)}
          />
          {t(I18nKey.ORG_CHART$SESSION_NEW)}
        </label>
      )}
      {asSession ? (
        <>
          <input
            type="text"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            aria-label={t(I18nKey.ORG_CHART$SESSION_NAME)}
            placeholder={t(I18nKey.ORG_CHART$SESSION_NAME)}
            className="w-64 max-w-full rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-contrast"
          />
          <p className="text-xs text-muted">
            {t(I18nKey.ORG_CHART$SESSION_NEW_HELP)}
          </p>
        </>
      ) : null}
      {routed ? (
        <p role="status" className="text-xs text-muted">
          {t(I18nKey.ORG_CHART$MESSAGE_SENT, {
            team: taken?.title ?? routed.node_id,
          })}
          {routed.node_id !== node.id && routed.reason
            ? ` (${routed.reason})`
            : null}
        </p>
      ) : null}
      {opened ? (
        <p role="status" className="text-xs text-muted">
          <NavigationLink
            to={orgNodePath(opened.node_id)}
            className="text-link hover:underline"
          >
            {t(I18nKey.ORG_CHART$SESSION_OPENED, {
              title: opened.title,
              team: opened.team,
            })}
          </NavigationLink>
        </p>
      ) : null}
      {send.isError ? (
        <p role="alert" className="text-xs text-feedback-error">
          {send.error instanceof DirectorError && send.error.status < 500
            ? send.error.message
            : t(I18nKey.ORG_CHART$MESSAGE_ERROR)}
        </p>
      ) : null}
    </form>
  );
}
