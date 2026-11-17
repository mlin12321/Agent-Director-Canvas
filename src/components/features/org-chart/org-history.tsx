import { useInfiniteQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DirectorClient } from "#/api/director/director-client";
import type {
  HistoryEvent,
  NodeId,
  OrgNode,
  TeamEventKind,
} from "#/api/director/types";
import { NavigationLink } from "#/components/shared/navigation-link";
import { orgNodePath } from "#/constants/org-chart";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";
import { I18nKey } from "#/i18n/declaration";
import { SessionMark } from "./org-sessions";

const PAGE = 50;
const REFRESH_MS = 15_000;

const KIND_KEYS = {
  set_up: I18nKey.ORG_CHART$HISTORY_SET_UP,
  accepted: I18nKey.ORG_CHART$HISTORY_ACCEPTED,
  sent_back: I18nKey.ORG_CHART$HISTORY_SENT_BACK,
  reconciled: I18nKey.ORG_CHART$HISTORY_RECONCILED,
  stalled: I18nKey.ORG_CHART$HISTORY_STALLED,
  stopped: I18nKey.ORG_CHART$HISTORY_STOPPED,
  replaced: I18nKey.ORG_CHART$HISTORY_REPLACED,
  pruned: I18nKey.ORG_CHART$HISTORY_PRUNED,
  asked: I18nKey.ORG_CHART$HISTORY_ASKED,
  misrouted: I18nKey.ORG_CHART$HISTORY_MISROUTED,
  not_taken: I18nKey.ORG_CHART$HISTORY_NOT_TAKEN,
  moved: I18nKey.ORG_CHART$HISTORY_MOVED,
} satisfies Partial<Record<TeamEventKind, I18nKey>>;

function EventWords({ event }: { event: HistoryEvent }) {
  const { t } = useTranslation("openhands");
  const detail = event.detail ?? "";
  switch (event.kind) {
    case "proposed":
      return t(I18nKey.ORG_CHART$TEAM_RECORD_PROPOSED, { teams: detail });
    case "approved":
      return t(I18nKey.ORG_CHART$TEAM_RECORD_APPROVED, { teams: detail });
    case "declined":
      return t(I18nKey.ORG_CHART$TEAM_RECORD_DECLINED, { teams: detail });
    case "woken":
      return t(I18nKey.ORG_CHART$TEAM_RECORD_WOKEN, { reason: detail });
    case "needed":
      return null;
    case "asked_team":
      return t(I18nKey.ORG_CHART$HISTORY_ASKED_TEAM, {
        other: event.other ?? "",
        what: detail,
      });
    case "answered":
      return t(I18nKey.ORG_CHART$HISTORY_ANSWERED, {
        other: event.other ?? "",
        how: detail,
      });
    case "session_opened":
    case "session_closed":
      return (
        <>
          {t(
            event.kind === "session_opened"
              ? I18nKey.ORG_CHART$HISTORY_SESSION_OPENED
              : I18nKey.ORG_CHART$HISTORY_SESSION_CLOSED,
            { session: event.session ?? "" },
          )}
          {detail ? ` (${detail})` : null}
        </>
      );
    default:
      return (
        <>
          {t(KIND_KEYS[event.kind])}
          {detail ? ` (${detail})` : null}
        </>
      );
  }
}

/** Opens and closes the history of the org. */
export function HistoryButton({
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
      data-testid="org-history-button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-text-secondary hover:bg-surface-raised hover:text-contrast"
    >
      <History width={12} height={12} aria-hidden="true" />
      {t(I18nKey.ORG_CHART$HISTORY_OPEN)}
    </button>
  );
}

/**
 * What became of every team of the org, newest first: one list across all
 * teams, read further back on request. A team that is still there links to
 * itself; one that is gone is only named.
 */
export function OrgHistoryPanel({
  nodes,
}: {
  nodes: ReadonlyMap<NodeId, OrgNode>;
}) {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const history = useInfiniteQuery({
    queryKey: DIRECTOR_QUERY_KEYS.history(backend.id),
    queryFn: ({ pageParam }) => DirectorClient.getOrgHistory(PAGE, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.earlier ? last.events.at(-1)?.at : undefined,
    refetchInterval: REFRESH_MS,
    meta: { disableToast: true },
  });
  const events = history.data?.pages.flatMap((page) => page.events) ?? [];

  return (
    <section
      data-testid="org-history"
      aria-label={t(I18nKey.ORG_CHART$HISTORY_TITLE)}
      className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-xl border border-border p-3"
    >
      <h3 className="text-xs font-medium text-contrast">
        {t(I18nKey.ORG_CHART$HISTORY_TITLE)}
      </h3>
      {history.isError ? (
        <p role="alert" className="text-xs text-feedback-error">
          {t(I18nKey.ORG_CHART$HISTORY_ERROR)}
        </p>
      ) : null}
      {history.isSuccess && events.length === 0 ? (
        <p className="text-xs text-muted">
          {t(I18nKey.ORG_CHART$HISTORY_EMPTY)}
        </p>
      ) : null}
      <ol className="flex flex-col gap-1">
        {events.map((event) => {
          // An event about no single team is told of the team it is kept
          // under.
          const id = event.team_id || event.above_id;
          const name = event.team || event.above;
          return (
            <li
              key={`${event.above_id} ${event.at} ${event.kind} ${event.team_id ?? ""} ${event.detail ?? ""}`}
              className="flex flex-wrap items-baseline gap-x-2 text-xs text-text-secondary"
            >
              <time dateTime={event.at} className="text-muted">
                {new Date(event.at).toLocaleString()}
              </time>
              {nodes.has(id) ? (
                <NavigationLink
                  to={orgNodePath(id)}
                  className="text-contrast hover:text-link hover:underline"
                >
                  {name}
                </NavigationLink>
              ) : (
                <span className="text-contrast">{name}</span>
              )}
              {event.session ? <SessionMark title={event.session} /> : null}
              <span>
                <EventWords event={event} />
              </span>
            </li>
          );
        })}
      </ol>
      {history.hasNextPage ? (
        <button
          type="button"
          disabled={history.isFetchingNextPage}
          onClick={() => history.fetchNextPage()}
          className="self-start rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface-raised hover:text-contrast disabled:opacity-40"
        >
          {t(I18nKey.ORG_CHART$HISTORY_EARLIER)}
        </button>
      ) : null}
    </section>
  );
}
