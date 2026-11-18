import React from "react";
import { ArrowUp, Ellipsis } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NodeId, OrgNode } from "#/api/director/types";
import { NavigationLink } from "#/components/shared/navigation-link";
import { orgNodePath } from "#/constants/org-chart";
import { I18nKey } from "#/i18n/declaration";
import { TeamCard } from "./team-card";

interface FocusedChartProps {
  current: OrgNode;
  parent: OrgNode | null;
  reports: OrgNode[];
  /** Reports to a row, from `fitFocusedChart`. */
  columns: number;
  /** Teams whose committed work conflicts with another team's. */
  collidingIds: ReadonlySet<NodeId>;
  onOpenDetails: () => void;
}

const LINE = "w-px bg-line-accent";

// Sizes in px of what `FocusedChart` draws, for working out what fits.
// They mirror its classes: w-56 h-24 cards, gap-4, h-4 lines, size-4 icons,
// an h-6 way up.
const CARD_WIDTH = 224;
const CARD_HEIGHT = 96;
const GAP = 16;
const UP_MARKER = 40;
const TEAM_TO_REPORTS = 29;
const DOWN_MARKER = 24;

/** The chart is never drawn smaller than it is; it scrolls instead. */
const MIN_SCALE = 1;
/** A small team is enlarged up to this, not until it fills the space. */
const MAX_SCALE = 1.6;

interface FocusedChartFit {
  columns: number;
  /** How much the chart is zoomed, between `MIN_SCALE` and `MAX_SCALE`. */
  scale: number;
}

/**
 * How many reports to put in a row, and how much to zoom the chart, so that
 * a team and its reports are as large as fits in a space of the given size.
 * Of the arrangements that come out equally large, the one with the fewest
 * rows wins, and its rows are evened out.
 */
export function fitFocusedChart(
  chart: { reports: number; hasParent: boolean; hasSubTeams: boolean },
  space: { width: number; height: number },
): FocusedChartFit {
  const count = chart.reports;
  // Not measured yet (or not measurable): a single row, not zoomed.
  if (space.width <= 0 || space.height <= 0 || count === 0) {
    const height = (chart.hasParent ? UP_MARKER : 0) + CARD_HEIGHT;
    const known = space.width > 0 && space.height > 0;
    return {
      columns: Math.max(1, count),
      scale: known
        ? Math.max(
            MIN_SCALE,
            Math.min(
              MAX_SCALE,
              space.width / CARD_WIDTH,
              space.height / height,
            ),
          )
        : 1,
    };
  }

  const rowHeight = CARD_HEIGHT + (chart.hasSubTeams ? DOWN_MARKER : 0);
  let best: (FocusedChartFit & { rows: number }) | null = null;
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const width = columns * CARD_WIDTH + (columns - 1) * GAP;
    const height =
      (chart.hasParent ? UP_MARKER : 0) +
      CARD_HEIGHT +
      TEAM_TO_REPORTS +
      rows * rowHeight +
      (rows - 1) * GAP;
    const scale = Math.min(
      MAX_SCALE,
      space.width / width,
      space.height / height,
    );
    if (
      best === null ||
      scale > best.scale ||
      (scale === best.scale && rows < best.rows)
    ) {
      best = { columns, rows, scale };
    }
  }
  if (best !== null && best.scale >= MIN_SCALE) {
    return { columns: best.columns, scale: best.scale };
  }
  // Too many reports to show at once: as many to a row as stay readable.
  return {
    columns: Math.max(
      1,
      Math.floor((space.width / MIN_SCALE + GAP) / (CARD_WIDTH + GAP)),
    ),
    scale: MIN_SCALE,
  };
}

/** Stands for the part of the org that is not drawn. */
function More() {
  return <Ellipsis width={16} height={16} aria-hidden="true" />;
}

/**
 * One team and its direct reports. The rest of the org is not drawn: above
 * the team is the way up to the team above it, when there is one, and below
 * each report that has sub-teams of its own is an ellipsis.
 */
export function FocusedChart({
  current,
  parent,
  reports,
  columns,
  collidingIds,
  onOpenDetails,
}: FocusedChartProps) {
  const { t } = useTranslation("openhands");
  const anyReportHasSubTeams = reports.some(
    (report) => report.child_ids.length > 0,
  );

  return (
    <div className="flex w-full flex-col items-center">
      {parent ? (
        <NavigationLink
          to={orgNodePath(parent.id)}
          title={t(I18nKey.ORG_CHART$GO_UP, { title: parent.title })}
          className="group flex flex-col items-center text-muted hover:text-contrast"
        >
          <span className="flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium group-hover:border-contrast">
            <ArrowUp width={12} height={12} aria-hidden="true" />
            {t(I18nKey.ORG_CHART$UP_ONE_LEVEL)}
          </span>
          <span
            aria-hidden="true"
            className={`h-4 ${LINE} group-hover:bg-contrast`}
          />
        </NavigationLink>
      ) : null}
      <TeamCard
        node={current}
        current
        collides={collidingIds.has(current.id)}
        onOpenDetails={onOpenDetails}
      />
      {reports.length > 0 ? (
        <>
          <span aria-hidden="true" className={`h-4 ${LINE}`} />
          <ul
            style={{ "--org-chart-columns": columns } as React.CSSProperties}
            className="org-chart-reports flex flex-wrap justify-center gap-4 border-t border-line-accent pt-3"
          >
            {reports.map((report) => (
              <li key={report.id} className="flex flex-col items-center">
                <TeamCard
                  node={report}
                  current={false}
                  collides={collidingIds.has(report.id)}
                  onOpenDetails={onOpenDetails}
                />
                {report.child_ids.length > 0 ? (
                  <span
                    aria-hidden="true"
                    data-has-sub-teams
                    className="flex flex-col items-center text-muted"
                  >
                    <span className={`h-2 ${LINE}`} />
                    <More />
                  </span>
                ) : (
                  // Keeps the rows evenly spaced when only some reports
                  // have sub-teams.
                  anyReportHasSubTeams && (
                    <span aria-hidden="true" className="h-6" />
                  )
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
