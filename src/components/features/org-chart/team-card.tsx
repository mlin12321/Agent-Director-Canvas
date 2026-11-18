import React from "react";
import { CircleStop, GitMerge, Pause, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NodeStatus, OrgNode } from "#/api/director/types";
import { NavigationLink } from "#/components/shared/navigation-link";
import { Tooltip } from "#/components/shared/tooltip";
import { orgNodePath } from "#/constants/org-chart";
import { I18nKey } from "#/i18n/declaration";
import { useOrgChartStore } from "#/stores/org-chart-store";
import { cn } from "#/utils/utils";
import { TeamHoverCard } from "./team-hover-card";
import {
  useSessionsAt,
  useSessionStatusesAt,
  useTeamWork,
} from "./org-sessions";
import { StatusDots } from "./status-badge";

interface TeamCardProps {
  node: OrgNode;
  /** The team the page is on. Its card opens its details. */
  current: boolean;
  /** Its committed work conflicts with another team's. */
  collides?: boolean;
  onOpenDetails: () => void;
  /** Bring the current team to the middle of a chart that scrolls. */
  centerInScroller?: boolean;
}

// Every card is the same size wherever it is drawn. Fitting a chart to the
// page zooms it as a whole.
const MAIN_CLASS =
  "flex size-full flex-col items-start justify-center gap-0.5 rounded-lg px-2.5 text-left hover:bg-surface-raised";

/**
 * One team. Clicking it moves the page to that team; clicking the team the
 * page is already on opens its details. A card is drawn again only when its
 * own team changed, which keeps an org of hundreds cheap to update.
 */
export const TeamCard = React.memo(function TeamCard({
  node,
  current,
  collides = false,
  onOpenDetails,
  centerInScroller = false,
}: TeamCardProps) {
  const { t } = useTranslation("openhands");
  const ref = React.useRef<HTMLDivElement>(null);
  // Only the card being kept in the middle follows the zoom.
  const zoom = useOrgChartStore((state) =>
    current && centerInScroller ? state.zoom : null,
  );
  const onScreen = React.useRef(false);
  const lastZoom = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    if (zoom !== null) {
      ref.current?.scrollIntoView?.({
        block: "center",
        inline: "center",
        // Glide when the page moves to a team already on screen; jump on
        // arrival and when zooming, so the team stays under the reader.
        behavior:
          onScreen.current && lastZoom.current === null ? "smooth" : "instant",
      });
    }
    lastZoom.current = zoom;
    onScreen.current = true;
  }, [zoom]);

  // Nobody works at a team itself: what the card says of its work is what
  // the sessions have going on there.
  const work = useTeamWork(node);
  // A team whose IC already works says what it delivers, even while its
  // Manager still waits to start.
  const waiting = work.waiting_to_start && work.status !== "working";
  // An agent that was working when the org was paused.
  const paused = work.agents.some((agent) => agent.status === "paused");
  // Sessions are no part of the chart; the card says how many are open here.
  const sessions = useSessionsAt(node.id);
  const subTeams = node.child_ids.length;
  // One state for each session at work here: a team with sessions is in
  // several states at once. Idle is what a team is when nothing goes on at
  // it, so it is shown alone or not at all.
  const sessionStatuses = useSessionStatusesAt(node.id);
  const statuses = React.useMemo<NodeStatus[]>(
    () => (sessionStatuses.length > 0 ? sessionStatuses : ["idle"]),
    [sessionStatuses],
  );

  const body = (
    <>
      <span className="flex w-full items-center gap-1.5">
        <StatusDots statuses={statuses} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-contrast">
          {node.title}
        </span>
        {paused ? (
          <span
            role="img"
            aria-label={t(I18nKey.ORG_CHART$AGENT_PAUSED)}
            title={t(I18nKey.ORG_CHART$AGENT_PAUSED)}
            className="flex shrink-0 text-feedback-warning"
          >
            <Pause width={11} height={11} aria-hidden="true" />
          </span>
        ) : null}
        {work.stopped ? (
          <span
            role="img"
            aria-label={t(I18nKey.ORG_CHART$STOPPED)}
            title={t(I18nKey.ORG_CHART$STOPPED)}
            className="flex shrink-0 text-feedback-warning"
          >
            <CircleStop width={11} height={11} aria-hidden="true" />
          </span>
        ) : null}
        {collides ? (
          <span
            role="img"
            aria-label={t(I18nKey.ORG_CHART$COLLISION_MARK)}
            title={t(I18nKey.ORG_CHART$COLLISION_MARK)}
            className="flex shrink-0 text-feedback-error"
          >
            <GitMerge width={11} height={11} aria-hidden="true" />
          </span>
        ) : null}
        {work.waiting.length > 0 ? (
          <span
            role="img"
            aria-label={t(I18nKey.ORG_CHART$ESCALATION_COUNT, {
              count: work.waiting.length,
            })}
            className="flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-feedback-error"
          >
            <TriangleAlert width={11} height={11} aria-hidden="true" />
            {work.waiting.length}
          </span>
        ) : null}
      </span>
      {waiting ? (
        <span className="w-full truncate text-[11px] text-contrast">
          {t(I18nKey.ORG_CHART$WAITING_TO_START)}
        </span>
      ) : null}
      {work.headline && !waiting ? (
        <span
          data-testid="org-team-headline"
          className="line-clamp-3 w-full text-[11px] leading-snug text-text-secondary"
        >
          {work.headline}
        </span>
      ) : null}
      {subTeams > 0 || sessions > 0 ? (
        <span className="w-full truncate text-[11px] text-contrast">
          {subTeams > 0
            ? t(I18nKey.ORG_CHART$SUB_TEAMS, { count: subTeams })
            : null}
          {subTeams > 0 && sessions > 0 ? " · " : null}
          {sessions > 0
            ? t(I18nKey.ORG_CHART$SESSIONS_COUNT, { count: sessions })
            : null}
        </span>
      ) : null}
    </>
  );

  return (
    <div
      ref={ref}
      data-testid={`org-node-${node.id}`}
      data-current={current || undefined}
      className={cn(
        "h-24 w-56 rounded-lg border bg-background",
        current ? "border-primary ring-1 ring-primary" : "border-border",
      )}
    >
      <Tooltip
        content={<TeamHoverCard node={node} />}
        placement="bottom"
        delay={300}
      >
        {current ? (
          <button
            type="button"
            aria-current="true"
            aria-label={t(I18nKey.ORG_CHART$OPEN_DETAILS, {
              title: node.title,
            })}
            onClick={onOpenDetails}
            className={MAIN_CLASS}
          >
            {body}
          </button>
        ) : (
          <NavigationLink to={orgNodePath(node.id)} className={MAIN_CLASS}>
            {body}
          </NavigationLink>
        )}
      </Tooltip>
    </div>
  );
});
