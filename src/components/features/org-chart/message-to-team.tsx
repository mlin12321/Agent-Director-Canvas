import React from "react";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DirectorClient, DirectorError } from "#/api/director/director-client";
import type { OpenedSession, OrgNode } from "#/api/director/types";
import { NavigationLink } from "#/components/shared/navigation-link";
import { I18nKey } from "#/i18n/declaration";
import { conversationPath } from "./org-sessions";

/**
 * Asks something of the team the page shows. Every request is a session of
 * its own: the team gets an IC for it, in a git worktree of its own, and
 * the IC of the team above reviews what comes of it before it is merged.
 * What is written to a team goes to that team; only what is written to the
 * top team may go straight to the team below that it concerns. It only
 * says something; it prunes, replaces and splits nothing.
 *
 * A session is then read and written to in its own conversation, which the
 * answer links to.
 */
export function MessageToTeam({ node }: { node: OrgNode }) {
  const { t } = useTranslation("openhands");
  const [draft, setDraft] = React.useState("");
  const [name, setName] = React.useState("");
  const inputId = React.useId();
  const send = useMutation({
    mutationFn: (text: string): Promise<OpenedSession> => {
      const title = name.trim();
      return DirectorClient.openSession({
        text,
        ...(title ? { title } : {}),
        // From the top team the director chooses the team.
        ...(node.parent_id === null ? {} : { node_id: node.id }),
      });
    },
    onSuccess: () => {
      setDraft("");
      setName("");
    },
    meta: { disableToast: true },
  });
  const text = draft.trim();
  const opened = send.data ?? null;

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
      {opened ? (
        <p role="status" className="text-xs text-muted">
          <NavigationLink
            to={conversationPath(opened.conversation_id)}
            className="text-link hover:underline"
          >
            {t(I18nKey.ORG_CHART$SESSION_OPENED, {
              title: opened.session.title,
              team: opened.session.team,
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
