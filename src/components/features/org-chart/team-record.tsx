import { useTranslation } from "react-i18next";
import type { OrgNode, TeamEvent } from "#/api/director/types";
import { useNodeMemory } from "#/hooks/query/use-node-memory";
import { I18nKey } from "#/i18n/declaration";

interface TeamRecordProps {
  node: OrgNode;
}

interface Counts {
  id: string;
  team: string;
  accepted: number;
  sentBack: number;
  stalled: number;
  stopped: number;
  /**
   * Its tasks: work that was accepted, or the work in hand once its IC's
   * escalations on it reached the number that wakes the Manager.
   */
  tasks: number;
  /** The tasks that were accepted without reaching that number. */
  succeeded: number;
  /** How the team ended, when it is gone. */
  ended: "replaced" | "pruned" | null;
}

const WOKEN_SHOWN = 3;
const DECISIONS_SHOWN = 5;
const DECISION_KEYS = {
  proposed: I18nKey.ORG_CHART$TEAM_RECORD_PROPOSED,
  approved: I18nKey.ORG_CHART$TEAM_RECORD_APPROVED,
  declined: I18nKey.ORG_CHART$TEAM_RECORD_DECLINED,
} as const;

function isDecision(
  event: TeamEvent,
): event is TeamEvent & { kind: keyof typeof DECISION_KEYS } {
  return event.kind in DECISION_KEYS;
}

/**
 * What is counted of each team the events are of, in the order the teams
 * were set up. A team set up in the place of one that is gone is counted
 * apart from it, as the server's own reading of the record does.
 */
export function countsOf(events: readonly TeamEvent[]): Counts[] {
  const all: Counts[] = [];
  const latest = new Map<string, Counts>();
  // The teams whose escalations reached the number on the work in hand.
  const reached = new Set<Counts>();
  for (const event of events) {
    const id = event.team_id ?? "";
    if (id) {
      let kept = latest.get(id);
      if (!kept || event.kind === "set_up") {
        kept = {
          id,
          team: event.team ?? id,
          accepted: 0,
          sentBack: 0,
          stalled: 0,
          stopped: 0,
          tasks: 0,
          succeeded: 0,
          ended: null,
        };
        all.push(kept);
        latest.set(id, kept);
      }
      if (event.kind === "accepted") {
        kept.accepted += 1;
        // Work on which the number was reached is a task already.
        if (!reached.delete(kept)) {
          kept.tasks += 1;
          kept.succeeded += 1;
        }
      } else if (event.kind === "woken") {
        if (!reached.has(kept)) kept.tasks += 1;
        reached.add(kept);
      } else if (event.kind === "sent_back") kept.sentBack += 1;
      else if (event.kind === "stalled") kept.stalled += 1;
      else if (event.kind === "stopped") kept.stopped += 1;
      else if (event.kind === "replaced" || event.kind === "pruned")
        kept.ended = event.kind;
    }
  }
  return all;
}

function counted(team: Counts) {
  return (
    team.accepted + team.sentBack + team.stalled + team.stopped + team.tasks > 0
  );
}

/**
 * How the teams directly below a team have done so far, when its Manager
 * was last woken and why, and the teams that were removed from below it
 * with what they left. Read-only, and absent while there is nothing to show.
 */
export function TeamRecord({ node }: TeamRecordProps) {
  const { t } = useTranslation("openhands");
  const memory = useNodeMemory(node.id);
  const history = memory.data?.history ?? [];
  const former = memory.data?.former_teams ?? [];
  if (history.length === 0 && former.length === 0) return null;

  const all = countsOf(history);
  // The teams that are there now; the ones that are gone are listed below.
  const counts = all.filter((team) => team.ended === null);
  const line = (team: Counts) =>
    t(I18nKey.ORG_CHART$TEAM_RECORD_LINE, {
      accepted: team.accepted,
      sentBack: team.sentBack,
      stalled: team.stalled,
      stopped: team.stopped,
    });
  const rate = (team: Counts) =>
    team.tasks > 0 ? (
      <span
        className="text-muted"
        title={t(I18nKey.ORG_CHART$TEAM_RECORD_SUCCESS_HELP)}
      >
        {t(I18nKey.ORG_CHART$TEAM_RECORD_SUCCESS, {
          succeeded: team.succeeded,
          tasks: team.tasks,
          percent: Math.round((100 * team.succeeded) / team.tasks),
        })}
      </span>
    ) : null;
  const decisions = history.filter(isDecision).slice(-DECISIONS_SHOWN);
  const countsOfFormer = (id: string, title: string) =>
    all.find(
      (team) => team.ended !== null && team.id === id && team.team === title,
    );
  const woken = history
    .filter((event) => event.kind === "woken")
    .slice(-WOKEN_SHOWN);

  return (
    <>
      {counts.length > 0 || woken.length > 0 || decisions.length > 0 ? (
        <section
          aria-label={t(I18nKey.ORG_CHART$TEAM_RECORD_TITLE)}
          className="flex flex-col gap-2"
        >
          <h3 className="text-sm font-medium text-contrast">
            {t(I18nKey.ORG_CHART$TEAM_RECORD_TITLE)}
          </h3>
          <ul className="flex flex-col gap-1.5 text-xs text-text-secondary">
            {counts.map((team) => (
              <li key={team.id} className="flex flex-col">
                <span className="text-contrast">{team.team}</span>
                <span className="text-muted">{line(team)}</span>
                {rate(team)}
              </li>
            ))}
            {decisions.map((event) => (
              <li key={`${event.kind}-${event.at}`} className="flex flex-col">
                <span className="whitespace-pre-wrap break-words">
                  {t(DECISION_KEYS[event.kind], { teams: event.detail ?? "" })}
                </span>
                <time dateTime={event.at} className="text-muted">
                  {new Date(event.at).toLocaleString()}
                </time>
              </li>
            ))}
            {woken.map((event) => (
              <li key={event.at} className="flex flex-col">
                <span className="break-words">
                  {t(I18nKey.ORG_CHART$TEAM_RECORD_WOKEN, {
                    reason: event.detail ?? "",
                  })}
                </span>
                <time dateTime={event.at} className="text-muted">
                  {new Date(event.at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {former.length > 0 ? (
        <section
          aria-label={t(I18nKey.ORG_CHART$FORMER_TEAMS_TITLE)}
          className="flex flex-col gap-2"
        >
          <h3 className="text-sm font-medium text-contrast">
            {t(I18nKey.ORG_CHART$FORMER_TEAMS_TITLE)}
          </h3>
          <ul className="flex flex-col gap-1.5 text-xs text-text-secondary">
            {former.map((team) => {
              const record = countsOfFormer(team.id, team.title);
              return (
                <li key={`${team.id}-${team.at}`}>
                  <details>
                    <summary className="cursor-pointer">
                      <span className="text-contrast">{team.title}</span>
                      <span className="text-muted">
                        {" · "}
                        {team.path}
                        {" · "}
                        {t(
                          team.ended === "pruned"
                            ? I18nKey.ORG_CHART$FORMER_TEAM_PRUNED
                            : I18nKey.ORG_CHART$FORMER_TEAM_REPLACED,
                        )}
                      </span>
                    </summary>
                    <div className="mt-1 flex flex-col gap-1.5 border-l border-border pl-2">
                      <p className="whitespace-pre-wrap break-words">
                        {team.purpose}
                      </p>
                      {record && counted(record) ? (
                        <p className="flex flex-col text-muted">
                          <span>{line(record)}</span>
                          {rate(record)}
                        </p>
                      ) : null}
                      {team.compacted_report ? (
                        <>
                          <p className="text-muted">
                            {t(I18nKey.ORG_CHART$FORMER_TEAM_REPORT)}
                          </p>
                          <p className="whitespace-pre-wrap break-words">
                            {team.compacted_report}
                          </p>
                        </>
                      ) : null}
                      {team.contracts ? (
                        <>
                          <p className="text-muted">
                            {t(I18nKey.ORG_CHART$CONTRACTS_OWN)}
                          </p>
                          <p className="whitespace-pre-wrap break-words">
                            {team.contracts}
                          </p>
                        </>
                      ) : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
