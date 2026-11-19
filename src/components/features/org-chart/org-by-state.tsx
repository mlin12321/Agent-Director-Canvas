import React from "react";
import { useTranslation } from "react-i18next";
import type { NodeId, OrgNode } from "#/api/director/types";
import { I18nKey } from "#/i18n/declaration";
import { TeamCard } from "./team-card";
import { teamWork, type TeamWork } from "./team-places";
import { OrgSessionsContext } from "./org-sessions";

/** Where a team stands, as one of the board's columns. */
export type TeamState =
  /** Set up and given no task yet: it has no agents. */
  | "not_started"
  /** Started, with nothing to do just now. */
  | "idle"
  | "working"
  | "in_review"
  | "changes_requested"
  | "blocked"
  | "done";

const TEAM_STATES: ReadonlyArray<{ state: TeamState; label: I18nKey }> = [
  { state: "not_started", label: I18nKey.ORG_CHART$TEAM_NOT_STARTED },
  { state: "idle", label: I18nKey.ORG_CHART$STATUS_IDLE },
  { state: "working", label: I18nKey.ORG_CHART$STATUS_WORKING },
  { state: "in_review", label: I18nKey.ORG_CHART$STATE_IN_REVIEW },
  {
    state: "changes_requested",
    label: I18nKey.ORG_CHART$REVIEW_CHANGES_REQUESTED,
  },
  { state: "blocked", label: I18nKey.ORG_CHART$STATUS_BLOCKED },
  { state: "done", label: I18nKey.ORG_CHART$STATUS_DONE },
];

/**
 * The column a team belongs in. The org works a team's status out itself:
 * blocked while its IC waits on an escalation or an agent failed, done once
 * it has submitted its work. A block comes first, then a review that waits
 * for its reviewer, so a team that submitted is "in review" until it is
 * accepted; a team sent back to change its work stays under "changes
 * requested" until it submits again. A team no session has agents at has
 * not been given a task. Nobody works at a team itself: its state is that
 * of what the sessions do there (`teamWork`).
 */
export function teamStateOf(work: TeamWork): TeamState {
  if (work.status === "blocked") return "blocked";
  const review = work.review?.state;
  if (review === "pending") return "in_review";
  if (work.status === "done") return "done";
  if (review === "changes_requested") return "changes_requested";
  if (work.status === "working") return "working";
  return work.agents.length === 0 ? "not_started" : "idle";
}

interface OrgByStateProps {
  /** Every team of the org, in the order of the tree. */
  nodes: ReadonlyMap<NodeId, OrgNode>;
  currentId: NodeId;
  onOpenDetails: () => void;
}

/**
 * Every team of the org as a card under the state it is in. A team moves
 * to another column as soon as the org says its state changed.
 */
export function OrgByState({
  nodes,
  currentId,
  onOpenDetails,
}: OrgByStateProps) {
  const { t } = useTranslation("openhands");
  const sessions = React.useContext(OrgSessionsContext);
  const columns = React.useMemo(() => {
    const byState = new Map<TeamState, OrgNode[]>(
      TEAM_STATES.map(({ state }) => [state, []]),
    );
    for (const node of nodes.values()) {
      byState.get(teamStateOf(teamWork(node, sessions)))?.push(node);
    }
    return byState;
  }, [nodes, sessions]);

  return (
    <div data-testid="org-by-state" className="flex h-full min-w-max gap-2 p-2">
      {TEAM_STATES.map(({ state, label }) => {
        const teams = columns.get(state) ?? [];
        return (
          <section
            key={state}
            data-testid={`org-state-${state}`}
            aria-label={t(label)}
            className="flex h-full w-59 shrink-0 flex-col rounded-lg border border-border bg-surface-raised"
          >
            <h3 className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5 text-xs font-medium text-contrast">
              <span className="w-0 flex-1 truncate">{t(label)}</span>
              <span
                data-testid={`org-state-count-${state}`}
                className="tabular-nums text-muted"
              >
                {teams.length}
              </span>
            </h3>
            <ul className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto p-1">
              {teams.map((node) => (
                <li key={node.id}>
                  <TeamCard
                    node={node}
                    current={node.id === currentId}
                    onOpenDetails={onOpenDetails}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
