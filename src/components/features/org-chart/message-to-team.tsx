import React from "react";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DirectorClient, DirectorError } from "#/api/director/director-client";
import type { NodeId, OrgNode } from "#/api/director/types";
import { I18nKey } from "#/i18n/declaration";

/**
 * Writes to the team the page shows. The message goes the way every message
 * of the human goes: to the IC of the nearest team at or above the team's
 * directory that can take it, which the answer names. Written to the top
 * team it is for the org as a whole, and may go straight to the team below
 * that it concerns. It only says something; it prunes, replaces and splits
 * nothing.
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
  const inputId = React.useId();
  const send = useMutation({
    mutationFn: (text: string) =>
      DirectorClient.routeMessage({
        text,
        path: node.boundary.path,
        // What is written to the top team is for the org as a whole, and
        // its director may send it straight to the team it concerns.
        auto: node.parent_id === null,
      }),
    onSuccess: () => setDraft(""),
    meta: { disableToast: true },
  });
  const text = draft.trim();
  const taken = send.data ? nodes.get(send.data.node_id) : undefined;

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
      {send.isSuccess ? (
        <p role="status" className="text-xs text-muted">
          {t(I18nKey.ORG_CHART$MESSAGE_SENT, {
            team: taken?.title ?? send.data.node_id,
          })}
          {send.data.node_id !== node.id && send.data.reason
            ? ` (${send.data.reason})`
            : null}
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
