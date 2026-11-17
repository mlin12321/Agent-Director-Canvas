import type { NodeId, OrgNode } from "#/api/director/types";
import { cn } from "#/utils/utils";
import { TeamCard } from "./team-card";

interface OrgTreeProps {
  root: OrgNode;
  nodes: ReadonlyMap<NodeId, OrgNode>;
  /** The team the page is on; it is outlined and brought to the middle. */
  currentId: NodeId;
  /** Teams whose committed work conflicts with another team's. */
  collidingIds: ReadonlySet<NodeId>;
  onOpenDetails: () => void;
}

type BranchProps = Omit<OrgTreeProps, "root"> & {
  node: OrgNode;
  isTop: boolean;
};

const LINE = "bg-line-accent";

/**
 * From this many reports up, a team whose reports all have no sub-teams
 * lists them in a column. Side by side they would make the chart much wider
 * without showing any more structure.
 */
const MIN_STACKED_REPORTS = 3;

function Card({ node, ...tree }: Omit<BranchProps, "isTop">) {
  return (
    <TeamCard
      node={node}
      current={node.id === tree.currentId}
      collides={tree.collidingIds.has(node.id)}
      onOpenDetails={tree.onOpenDetails}
      centerInScroller
    />
  );
}

function Branch({ node, isTop, ...tree }: BranchProps) {
  const reports = node.child_ids.flatMap((id) => tree.nodes.get(id) ?? []);
  const stacked =
    reports.length >= MIN_STACKED_REPORTS &&
    reports.every((report) => report.child_ids.length === 0);

  let below: React.ReactNode = null;
  if (stacked) {
    below = (
      <ul
        className={cn(
          "relative flex flex-col gap-1.5 pl-3 pt-1.5",
          // From under the team's card across to the rail on the left.
          "after:absolute after:left-0 after:top-0 after:h-px after:w-1/2 after:bg-line-accent",
        )}
      >
        {reports.map((report) => (
          <li
            key={report.id}
            className={cn(
              "relative",
              // The rail, drawn one report at a time so that it ends level
              // with the last one.
              "after:absolute after:-left-3 after:-top-1.5 after:bottom-0 after:w-px after:bg-line-accent last:after:bottom-1/2",
            )}
          >
            <span
              aria-hidden="true"
              className={cn("absolute -left-3 top-1/2 h-px w-3", LINE)}
            />
            <Card node={report} {...tree} />
          </li>
        ))}
      </ul>
    );
  } else if (reports.length > 0) {
    below = (
      <ul className="flex">
        {reports.map((report) => (
          <Branch key={report.id} node={report} isTop={false} {...tree} />
        ))}
      </ul>
    );
  }

  return (
    <li
      className={cn(
        "relative flex shrink-0 flex-col items-center",
        // The rail to the siblings is drawn as two halves per node, so it
        // stops at the middle of the first and of the last one.
        isTop
          ? null
          : [
              "px-1.5 pt-4",
              "before:absolute before:left-0 before:top-0 before:h-px before:w-1/2 before:bg-line-accent first:before:hidden",
              "after:absolute after:right-0 after:top-0 after:h-px after:w-1/2 after:bg-line-accent last:after:hidden",
            ],
      )}
    >
      {isTop ? null : (
        <span
          aria-hidden="true"
          className={cn("absolute left-1/2 top-0 h-4 w-px", LINE)}
        />
      )}
      <Card node={node} {...tree} />
      {below ? (
        <>
          <span aria-hidden="true" className={cn("h-4 w-px", LINE)} />
          {below}
        </>
      ) : null}
    </li>
  );
}

/**
 * The whole org, top down. Sub-teams sit side by side, or in a column when
 * none of them has sub-teams of its own.
 */
export function OrgTree({ root, ...tree }: OrgTreeProps) {
  return (
    <ul className="flex">
      <Branch node={root} isTop {...tree} />
    </ul>
  );
}
