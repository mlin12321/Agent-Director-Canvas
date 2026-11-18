import React from "react";
import { useMutation } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DirectorClient, DirectorError } from "#/api/director/director-client";
import type {
  NodeId,
  NodeStatus,
  OrgNode,
  Session,
} from "#/api/director/types";
import { NavigationLink } from "#/components/shared/navigation-link";
import { orgNodePath } from "#/constants/org-chart";
import { I18nKey } from "#/i18n/declaration";
import { CollapsibleSection } from "./collapsible-section";
import { teamWork, workPlacesAt, type TeamWork } from "./team-places";
import { StatusBadge } from "./status-badge";

/**
 * The sessions that are open, for the parts of the chart that say something
 * of them. A session is not a team of the chart: the chart is the org's
 * structure, and a session is work that goes on in a part of it.
 */
export const OrgSessionsContext = React.createContext<readonly Session[]>([]);

/** How many sessions are open at a team. */
export function useSessionsAt(nodeId: NodeId): number {
  const sessions = React.useContext(OrgSessionsContext);
  return sessions.filter((session) => session.team_id === nodeId).length;
}

/**
 * The state of each session that has something going on at a team, whether
 * it was opened there or at a team above: one that works, is blocked, or is
 * done and waits for its review. A session that rests there, or whose work
 * was accepted, stays open until the human closes it and is left out, so
 * that sessions kept open do not pile up as idle or done.
 */
export function useSessionStatusesAt(nodeId: NodeId): NodeStatus[] {
  const sessions = React.useContext(OrgSessionsContext);
  return workPlacesAt(nodeId, sessions)
    .filter(
      (team) => team.status !== "idle" && team.review?.state !== "accepted",
    )
    .map((team) => team.status);
}

/** What the sessions have going on at a team. */
export function useTeamWork(node: OrgNode): TeamWork {
  const sessions = React.useContext(OrgSessionsContext);
  return React.useMemo(() => teamWork(node, sessions), [node, sessions]);
}

/** Where a conversation is read in the normal chat window. */
export function conversationPath(conversationId: string): string {
  return `/conversations/${conversationId}`;
}

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

function tokensOf(session: Session): number {
  return session.usage.input_tokens + session.usage.output_tokens;
}

/** A count as it is read at a glance: 12,340 is "12K". */
function compact(count: number, language: string): string {
  return new Intl.NumberFormat(language, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
}

function dollars(cost: number): string {
  return "$" + cost.toFixed(2);
}

/**
 * What a session has cost, of what it may cost where it is limited, with the
 * tokens beside it. Tokens of a model without a price are in no cost, and
 * are said apart.
 */
function SessionUse({ session }: { session: Session }) {
  const { t, i18n } = useTranslation("openhands");
  const used = tokensOf(session);
  const { cost, unpriced_tokens: unpriced } = session.usage;
  if (used === 0 && session.cost_allowance === 0) return null;
  return (
    <span data-testid={"org-session-use-" + session.id}>
      {session.cost_allowance > 0
        ? t(I18nKey.ORG_CHART$SESSION_COST_OF, {
            used: dollars(cost),
            limit: dollars(session.cost_allowance),
          })
        : dollars(cost)}
      {" · "}
      {t(I18nKey.ORG_CHART$SESSIONS_USE, {
        used: compact(used, i18n.language),
      })}
      {unpriced > 0 ? (
        <span
          data-testid={"org-session-unpriced-" + session.id}
          className="text-feedback-warning"
        >
          {" · "}
          {t(I18nKey.ORG_CHART$SESSION_UNPRICED, {
            count: compact(unpriced, i18n.language),
          })}
        </span>
      ) : null}
    </span>
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
  const [confirming, setConfirming] = React.useState(false);
  // The server closes it once its agents are quiet; the stream then says so.
  const close = useMutation({
    mutationFn: () => DirectorClient.closeSession(session.id),
    meta: { disableToast: true },
  });
  const above = nodes.get(session.above_id);
  const started = session.teams.filter(
    (team) => team.agents.length > 0 && !team.division_lead,
  );

  return (
    <li
      data-testid={`org-session-${session.id}`}
      className="flex flex-col gap-1 text-xs text-text-secondary"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {session.conversation_id ? (
          <NavigationLink
            to={conversationPath(session.conversation_id)}
            title={t(I18nKey.ORG_CHART$SESSION_OPEN_CHAT)}
            className="font-medium text-contrast hover:text-link hover:underline"
          >
            {session.title}
          </NavigationLink>
        ) : (
          <span className="font-medium text-contrast">{session.title}</span>
        )}
        <NavigationLink
          to={orgNodePath(session.team_id)}
          className="hover:text-link hover:underline"
        >
          {session.team}
        </NavigationLink>
        <StatusBadge status={session.status} />
        <span>
          {t(I18nKey.ORG_CHART$SESSION_TEAMS, { count: started.length })}
        </span>
        <SessionUse session={session} />
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
 * beside the org's own. They are no teams of the chart. Each is read and
 * written to in its conversation, and closed here.
 */
export function OrgSessionsPanel({
  sessions,
  nodes,
  startsOpen = false,
}: {
  sessions: readonly Session[];
  nodes: ReadonlyMap<NodeId, OrgNode>;
  startsOpen?: boolean;
}) {
  const { t, i18n } = useTranslation("openhands");
  const total = sessions.reduce(
    (sum, session) => ({
      tokens: sum.tokens + tokensOf(session),
      cost: sum.cost + session.usage.cost,
    }),
    { tokens: 0, cost: 0 },
  );

  return (
    <CollapsibleSection
      title={t(I18nKey.ORG_CHART$SESSIONS_OPEN)}
      testId="org-sessions"
      startsOpen={startsOpen}
      bodyClassName="max-h-64 overflow-y-auto"
      summary={
        <>
          {sessions.length > 0 ? (
            <span className="rounded-full bg-surface-raised px-1.5 text-xs font-normal text-text-secondary">
              {sessions.length}
            </span>
          ) : null}
          {total.tokens > 0 ? (
            <span
              data-testid="org-sessions-use"
              className="text-xs font-normal text-text-secondary"
            >
              {dollars(total.cost)}
              {" · "}
              {t(I18nKey.ORG_CHART$SESSIONS_USE, {
                used: compact(total.tokens, i18n.language),
              })}
            </span>
          ) : null}
        </>
      }
    >
      {sessions.length === 0 ? (
        <p className="text-xs text-muted">
          {t(I18nKey.ORG_CHART$SESSIONS_EMPTY)}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {sessions.map((session) => (
          <SessionRow key={session.id} session={session} nodes={nodes} />
        ))}
      </ul>
    </CollapsibleSection>
  );
}
