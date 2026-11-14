import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DirectorClient } from "#/api/director/director-client";
import type { NodeId, OrgNode, OrgSummary } from "#/api/director/types";
import { NavigationLink } from "#/components/shared/navigation-link";
import { ORG_CHART_PATH, orgNodePath } from "#/constants/org-chart";
import { useNavigation } from "#/context/navigation-context";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";
import { useNodeOwnership } from "#/hooks/query/use-node-ownership";
import { useOrgTree } from "#/hooks/use-org-tree";
import { I18nKey } from "#/i18n/declaration";
import { useOrgChartStore } from "#/stores/org-chart-store";
import { cn } from "#/utils/utils";
import { AgentInspectorDrawer } from "./agent-inspector-drawer";
import { MergeConflicts } from "./org-merge";
import { ChartToolbar } from "./chart-toolbar";
import { EscalationsPanel } from "./escalations-panel";
import { FocusedChart, fitFocusedChart } from "./focused-chart";
import { OrgBreadcrumb } from "./org-breadcrumb";
import { PauseButton, PausedBanner } from "./org-pause";
import { OrgSync } from "./org-sync";
import { OrgSettings } from "./org-settings";
import { OrgByState } from "./org-by-state";
import { OrgTree } from "./org-tree";
import { OwnershipMap } from "./ownership-map";
import { HOME_PATH, StartOrgNotice } from "./start-org-notice";
import { TeamSearch } from "./team-search";

interface OrgChartViewProps {
  /** The team the page is on; `null` is the root of the tree. */
  nodeId: NodeId | null;
}

function Notice({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-base font-medium text-contrast">{title}</h1>
      {children}
    </div>
  );
}

/** Root first, excluding the node itself; stops where the page has no more. */
function ancestorsOf(node: OrgNode, nodes: ReadonlyMap<NodeId, OrgNode>) {
  const ancestors: OrgNode[] = [];
  let parentId = node.parent_id;
  while (parentId !== null) {
    const parent = nodes.get(parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    parentId = parent.parent_id;
  }
  return ancestors;
}

/** Kept free on each axis around one team's chart: the padding and more. */
const CHART_MARGIN = 48;
/** How much the whole org is enlarged before the reader zooms. */
const FULL_SCALE = 1.25;

/**
 * Whatever chart is drawn sits in the middle of its frame, both ways, with
 * room around it, and scrolls once it is larger.
 */
function ChartCanvas({
  full,
  zoom,
  children,
}: {
  full: boolean;
  zoom: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        full
          ? "flex min-h-full w-max min-w-full items-center justify-center p-4"
          : "flex min-h-full w-full items-center justify-center p-4"
      }
    >
      <div
        data-testid="org-chart-zoom"
        style={{ "--org-chart-zoom": zoom } as React.CSSProperties}
        className={cn("org-chart-zoom", full || "w-full")}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * An org chart of agent teams. It is on one team at a time and draws either
 * that team with its direct reports, or the whole org with that team in the
 * middle. Besides the org itself, only what waits on the human is shown.
 */
export function OrgChartView({ nodeId }: OrgChartViewProps) {
  const { t } = useTranslation("openhands");
  const view = useOrgChartStore((state) => state.view);
  const zoom = useOrgChartStore((state) => state.zoom);
  const byState = view === "by_state";
  // Both views of the whole org; `byState` says which.
  const full = view !== "focused";
  // The whole org is one subscription whichever team the page is on.
  const { status, focusId, nodes, escalations, orgState } = useOrgTree(
    full ? null : nodeId,
    full,
  );
  // A director without a tree answers the stream like a server without a
  // director; only asking tells "start an org" from "nothing to talk to".
  // It also says how far the server holds teams to their boundaries.
  const { backend } = useActiveBackend();
  const org = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.org(backend.id),
    queryFn: () => DirectorClient.getOrg(),
    retry: false,
    meta: { disableToast: true },
  });
  // A server that comes back may have left its org paused.
  const refetchOrg = org.refetch;
  React.useEffect(() => {
    if (status === "live") refetchOrg();
  }, [status, refetchOrg]);
  // A pause or a merge begun elsewhere shows as soon as the stream says so.
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (orgState === null) return;
    const key = DIRECTOR_QUERY_KEYS.org(backend.id);
    const known = queryClient.getQueryData<OrgSummary>(key);
    if (
      !known ||
      (known.paused === orgState.paused && known.merging === orgState.merging)
    )
      return;
    queryClient.setQueryData<OrgSummary>(key, { ...known, ...orgState });
    queryClient.invalidateQueries({
      queryKey: DIRECTOR_QUERY_KEYS.recovery(backend.id),
    });
    queryClient.invalidateQueries({
      queryKey: DIRECTOR_QUERY_KEYS.merge(backend.id),
    });
  }, [orgState, backend.id, queryClient]);
  // Details belong to the team they were opened on.
  const [detailsId, setDetailsId] = React.useState<NodeId | null>(null);
  const closeDetails = React.useCallback(() => setDetailsId(null), []);
  // The room the chart has, less the space kept free around what is drawn.
  const [frame, setFrame] = React.useState<HTMLElement | null>(null);
  const [space, setSpace] = React.useState({ width: 0, height: 0 });
  React.useLayoutEffect(() => {
    if (!frame) return undefined;
    const measure = () =>
      setSpace((previous) => {
        const width = frame.clientWidth - CHART_MARGIN;
        const height = frame.clientHeight - CHART_MARGIN;
        return previous.width === width && previous.height === height
          ? previous
          : { width, height };
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frame]);
  const top = focusId === null ? null : (nodes.get(focusId) ?? null);
  const current = full && nodeId !== null ? (nodes.get(nodeId) ?? null) : top;
  // The same function while the page stays on a team, so that cards are not
  // drawn again for it.
  const currentId = current?.id ?? null;
  const openDetails = React.useCallback(
    () => setDetailsId(currentId),
    [currentId],
  );
  // Alt+ArrowUp goes to the team above, which the chart does not draw.
  const { navigate } = useNavigation();
  const parentId = current?.parent_id ?? null;
  React.useEffect(() => {
    if (parentId === null || detailsId !== null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable]");
      if (event.altKey && event.key === "ArrowUp" && !typing) {
        event.preventDefault();
        navigate(orgNodePath(parentId));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [parentId, detailsId, navigate]);
  // A server without the route answers with an error and gets no map.
  const ownership = useNodeOwnership(current).data;
  const colliding = React.useMemo(
    () =>
      new Set(ownership?.collisions.flatMap((collision) => collision.node_ids)),
    [ownership],
  );

  // In the whole-org view an unknown team is one the tree does not hold.
  if (status === "not_found" || (top && !current)) {
    return (
      <Notice title={t(I18nKey.ORG_CHART$NOT_FOUND_TITLE)}>
        <NavigationLink
          to={ORG_CHART_PATH}
          className="text-sm text-link hover:underline"
        >
          {t(I18nKey.ORG_CHART$BACK_TO_ROOT)}
        </NavigationLink>
      </Notice>
    );
  }

  if (!top || !current) {
    if (status === "unavailable" && org.data?.root_id === null) {
      return (
        <Notice title={t(I18nKey.ORG_CHART$START_TITLE)}>
          <StartOrgNotice org={org.data} />
        </Notice>
      );
    }
    return status === "unavailable" ? (
      <Notice title={t(I18nKey.ORG_CHART$UNAVAILABLE_TITLE)}>
        <p className="max-w-md text-sm text-muted">
          {t(I18nKey.ORG_CHART$UNAVAILABLE_BODY)}
        </p>
      </Notice>
    ) : (
      <Notice title={t(I18nKey.ORG_CHART$LOADING)} />
    );
  }

  const ancestors = ancestorsOf(current, nodes);
  const stale = status === "reconnecting" || status === "unavailable";
  const reports = current.child_ids.flatMap((id) => nodes.get(id) ?? []);
  // One team is zoomed to be as large as fits. The whole org is not fitted:
  // it scrolls.
  const fit = full
    ? { columns: 1, scale: FULL_SCALE }
    : fitFocusedChart(
        {
          reports: reports.length,
          hasParent: ancestors.length > 0,
          hasSubTeams: reports.some((report) => report.child_ids.length > 0),
        },
        space,
      );

  return (
    <div data-testid="org-chart" className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <OrgBreadcrumb ancestors={ancestors} current={current} />
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
            {stale ? (
              <span role="status" className="text-xs text-feedback-warning">
                {t(I18nKey.ORG_CHART$RECONNECTING)}
              </span>
            ) : null}
            <TeamSearch />
            {org.data && !org.data.fixture ? (
              <OrgSync merging={org.data.merging} />
            ) : null}
            <ChartToolbar />
            {org.data && !org.data.fixture && org.data.paused === null ? (
              <PauseButton />
            ) : null}
            {org.data && !org.data.fixture ? <OrgSettings /> : null}
          </div>
        </div>
        {org.data?.paused !== undefined ? (
          <PausedBanner paused={org.data.paused} />
        ) : null}
        {org.data?.merging ? <MergeConflicts /> : null}
        <EscalationsPanel escalations={escalations} />
        <section
          ref={setFrame}
          aria-label={t(I18nKey.ORG_CHART$NAV)}
          className="min-h-0 flex-1 overflow-auto rounded-xl border border-border"
        >
          {byState ? (
            <OrgByState
              nodes={nodes}
              currentId={current.id}
              collidingIds={colliding}
              onOpenDetails={openDetails}
            />
          ) : (
            <ChartCanvas full={full} zoom={zoom * fit.scale}>
              {full ? (
                <OrgTree
                  root={top}
                  nodes={nodes}
                  currentId={current.id}
                  collidingIds={colliding}
                  onOpenDetails={openDetails}
                />
              ) : (
                <FocusedChart
                  current={current}
                  parent={ancestors.at(-1) ?? null}
                  reports={reports}
                  columns={fit.columns}
                  collidingIds={colliding}
                  onOpenDetails={openDetails}
                />
              )}
            </ChartCanvas>
          )}
        </section>
        <OwnershipMap node={current} ownership={ownership} />
        {org.data ? (
          <p className="text-xs text-muted">
            {t(I18nKey.ORG_CHART$TALK_HINT, { path: org.data.repo_path })}{" "}
            <NavigationLink
              to={HOME_PATH}
              className="text-link hover:underline"
            >
              {t(I18nKey.ORG_CHART$START_SUBMIT)}
            </NavigationLink>
          </p>
        ) : null}
      </div>
      {detailsId === current.id ? (
        <AgentInspectorDrawer
          key={current.id}
          node={current}
          nodes={nodes}
          enforcement={org.data?.boundary_enforcement}
          onClose={closeDetails}
        />
      ) : null}
    </div>
  );
}
