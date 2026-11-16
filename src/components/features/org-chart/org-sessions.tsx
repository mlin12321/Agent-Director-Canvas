import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DirectorClient, DirectorError } from "#/api/director/director-client";
import type { NodeId, OrgNode, Session } from "#/api/director/types";
import { NavigationLink } from "#/components/shared/navigation-link";
import { orgNodePath } from "#/constants/org-chart";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";
import { I18nKey } from "#/i18n/declaration";
import { StatusBadge } from "./status-badge";

const REFRESH_MS = 15_000;

/** Marks a team as one of a session, with what the human called it. */
export function SessionMark({ title }: { title: string }) {
  const { t } = useTranslation("openhands");
  const label = t(I18nKey.ORG_CHART$SESSION_MARK, { title });
  return (
    <span
      data-testid="org-session-mark"
      aria-label={label}
      title={label}
      className="flex max-w-20 shrink-0 items-center gap-0.5 rounded-sm border border-border px-1 text-2xs text-text-secondary"
    >
      <GitBranch
        width={10}
        height={10}
        aria-hidden="true"
        className="shrink-0"
      />
      <span className="truncate">{title}</span>
    </span>
  );
}

/** Opens and closes the list of sessions. */
export function SessionsButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("openhands");
  return (
    <button
      type="button"
      data-testid="org-sessions-button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-text-secondary hover:bg-surface-raised hover:text-contrast"
    >
      <GitBranch width={12} height={12} aria-hidden="true" />
      {t(I18nKey.ORG_CHART$SESSIONS_OPEN)}
    </button>
  );
}

function SessionRow({
  session,
  nodes,
}: {
  session: Session;
  nodes: ReadonlyMap<NodeId, OrgNode>;
}) {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = React.useState(false);
  const close = useMutation({
    mutationFn: () => DirectorClient.closeSession(session.id),
    // The server closes it once its agents are quiet; the list follows.
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: DIRECTOR_QUERY_KEYS.sessions(backend.id),
      }),
    meta: { disableToast: true },
  });
  const above = nodes.get(session.above_id);

  return (
    <li
      data-testid={`org-session-${session.id}`}
      className="flex flex-col gap-1 text-xs text-text-secondary"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <NavigationLink
          to={orgNodePath(session.node_id)}
          className="font-medium text-contrast hover:text-link hover:underline"
        >
          {session.title}
        </NavigationLink>
        <span>{session.team}</span>
        <StatusBadge status={session.status} />
        <span>
          {t(I18nKey.ORG_CHART$SESSION_TEAMS, { count: session.teams })}
        </span>
        <span>
          {t(I18nKey.ORG_CHART$SESSION_REVIEWED_BY, {
            team: above?.title ?? session.above_id,
          })}
        </span>
        {confirming ? null : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={close.isPending || close.isSuccess}
            className="ml-auto rounded-md border border-border px-2 py-0.5 text-contrast hover:bg-surface-raised disabled:opacity-40"
          >
            {t(I18nKey.ORG_CHART$SESSION_CLOSE)}
          </button>
        )}
      </div>
      {confirming ? (
        <div
          role="group"
          aria-label={t(I18nKey.ORG_CHART$SESSION_CLOSE_YES)}
          className="flex flex-wrap items-center gap-2"
        >
          <span>{t(I18nKey.ORG_CHART$SESSION_CLOSE_CONFIRM)}</span>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              close.mutate();
            }}
            className="rounded-md border border-feedback-error px-2 py-0.5 text-feedback-error hover:bg-surface-raised"
          >
            {t(I18nKey.ORG_CHART$SESSION_CLOSE_YES)}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md border border-border px-2 py-0.5 text-contrast hover:bg-surface-raised"
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </button>
        </div>
      ) : null}
      {close.isError ? (
        <p role="alert" className="text-feedback-error">
          {close.error instanceof DirectorError && close.error.status !== null
            ? close.error.message
            : t(I18nKey.ORG_CHART$SESSION_CLOSE_ERROR)}
        </p>
      ) : null}
    </li>
  );
}

/**
 * The sessions that are open: lines of work the human opened at a team
 * beside the org's own. Each is a team of the chart; here they are in one
 * list, and here one is closed.
 */
export function OrgSessionsPanel({
  nodes,
}: {
  nodes: ReadonlyMap<NodeId, OrgNode>;
}) {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const sessions = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.sessions(backend.id),
    queryFn: () => DirectorClient.listSessions(),
    refetchInterval: REFRESH_MS,
    meta: { disableToast: true },
  });
  // A session is opened and closed as a team of the tree: ask again when
  // the teams of sessions change.
  const inSessions = [...nodes.values()]
    .filter((node) => node.session)
    .map((node) => `${node.id}:${node.status}:${node.review?.state ?? ""}`)
    .join(" ");
  const { refetch } = sessions;
  React.useEffect(() => {
    refetch();
  }, [inSessions, refetch]);

  return (
    <section
      data-testid="org-sessions"
      aria-label={t(I18nKey.ORG_CHART$SESSIONS_OPEN)}
      className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-xl border border-border p-3"
    >
      <h3 className="text-xs font-medium text-contrast">
        {t(I18nKey.ORG_CHART$SESSIONS_OPEN)}
      </h3>
      {sessions.isError ? (
        <p role="alert" className="text-xs text-feedback-error">
          {t(I18nKey.ORG_CHART$SESSIONS_ERROR)}
        </p>
      ) : null}
      {sessions.data?.length === 0 ? (
        <p className="text-xs text-muted">
          {t(I18nKey.ORG_CHART$SESSIONS_EMPTY)}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {sessions.data?.map((session) => (
          <SessionRow key={session.id} session={session} nodes={nodes} />
        ))}
      </ul>
    </section>
  );
}
