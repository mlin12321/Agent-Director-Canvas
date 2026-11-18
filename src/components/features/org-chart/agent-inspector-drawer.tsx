import React from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  BoundaryEnforcement,
  NodeId,
  OrgNode,
} from "#/api/director/types";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { MergeWaits } from "./merge-waits";
import { MessageToTeam } from "./message-to-team";
import { ProposedTeams } from "./proposed-teams";
import { TeamMessages } from "./team-messages";
import { TeamRecord } from "./team-record";
import { TeamReports } from "./team-reports";
import { ReviewSummary } from "./review-summary";
import { SpecAndContracts } from "./spec-and-contracts";
import { isLost, StartAgain } from "./start-again";
import { conversationsAt, placesAt, workPlacesAt } from "./team-places";
import { OrgSessionsContext } from "./org-sessions";
import {
  ENFORCEMENT_LABEL_KEYS,
  externalAgentName,
  ROLE_LABEL_KEYS,
} from "./org-chart-presentation";

// The conversation UI pulls in the chat, terminal and diff stack, so it only
// loads once an agent with a live conversation is inspected.
const AgentConversation = React.lazy(() =>
  import("./agent-conversation").then((module) => ({
    default: module.AgentConversation,
  })),
);

// Monaco comes with the changes, so they load when first asked for.
const TeamChanges = React.lazy(() =>
  import("./team-changes").then((module) => ({
    default: module.TeamChanges,
  })),
);

const TAB_CLASS =
  "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-sm text-contrast hover:bg-surface-raised";
const TAB_CHOSEN_CLASS =
  "bg-surface-raised director:border-primary director:bg-interactive-selected";

interface AgentInspectorDrawerProps {
  node: OrgNode;
  /** The teams known to the page, to name the other side of a thread. */
  nodes?: ReadonlyMap<NodeId, OrgNode>;
  /**
   * How far the server holds teams to their boundaries, once known. What the
   * team's own node says comes first.
   */
  enforcement?: BoundaryEnforcement;
  onClose: () => void;
}

const ROW_CLASS =
  "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm";
// What the org runs by itself stands back,
const ROW_PLAIN_CLASS =
  "border-border-subtle bg-tertiary text-text-secondary hover:bg-interactive-hover-low disabled:hover:bg-tertiary";
// and what the human started here is in the page's main colour.
const ROW_MINE_CLASS =
  "border-border bg-background text-contrast hover:bg-surface-raised";
const ROW_OPEN_CLASS = "ring-2 ring-primary";

/**
 * One team's details: its boundary memory, and the conversations that go on
 * at it. The conversations are a list; one is opened by choosing it, and
 * another by choosing that one, so they are flipped between from the list.
 */
export function AgentInspectorDrawer({
  node,
  nodes,
  enforcement,
  onClose,
}: AgentInspectorDrawerProps) {
  const { t } = useTranslation("openhands");
  const titleId = React.useId();
  const sessions = React.useContext(OrgSessionsContext);
  const conversations = conversationsAt(node, sessions);
  // Tracked by key so the drawer follows the conversation across live
  // updates; nothing is open until one is chosen.
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const [showsChanges, setShowsChanges] = React.useState(false);
  const open =
    conversations.find(
      (candidate) => candidate.key === openKey && candidate.conversationId,
    ) ?? null;
  const conversationId = open?.conversationId ?? null;
  const lost = conversations.some((candidate) => candidate.lost);
  // Nobody works at a team itself: what is being done here is what each
  // session has at it.
  const places = workPlacesAt(node.id, sessions);
  const titles = new Map(
    sessions.map((session) => [session.id, session.title]),
  );
  // The changes are those of the session whose conversation is open.
  const changed = open && !open.divisionLead ? open.place : (places[0] ?? null);
  const noneToOpen =
    conversations.length === 0
      ? I18nKey.ORG_CHART$TEAM_NOT_STARTED_HELP
      : I18nKey.ORG_CHART$NO_CONVERSATION;
  const nothingOpenKey = conversations.some(
    (candidate) => candidate.conversationId,
  )
    ? I18nKey.ORG_CHART$CONVERSATION_PICK
    : noneToOpen;

  // How a team is held is known once an IC ran there, which is a session's.
  const held =
    places.find((place) => place.boundary_enforcement)?.boundary_enforcement ??
    enforcement;

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <aside
      role="dialog"
      aria-labelledby={titleId}
      className="flex h-full w-1/2 max-w-2xl shrink-0 flex-col border-l border-border bg-surface"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <h2
          id={titleId}
          className="min-w-0 truncate text-sm font-medium text-contrast"
        >
          {node.title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t(I18nKey.ORG_CHART$INSPECTOR_CLOSE)}
          className="rounded-md p-1 text-muted hover:bg-surface-raised hover:text-contrast"
        >
          <X width={16} height={16} aria-hidden="true" />
        </button>
      </div>

      <div className="flex max-h-2/5 flex-col gap-3 overflow-y-auto border-b border-border p-3">
        {held ? (
          <p className="text-xs text-muted">
            {t(ENFORCEMENT_LABEL_KEYS[held], {
              path: node.boundary.path || t(I18nKey.ORG_CHART$BOUNDARY_ROOT),
            })}
          </p>
        ) : null}
        {places.map((place) =>
          place.stopped ||
          place.pending_split ||
          place.review ||
          isLost(place) ? (
            <section
              key={place.id}
              data-testid={`org-session-work-${place.session}`}
              className="flex flex-col gap-2"
            >
              <h3 className="text-xs font-medium text-text-secondary">
                {titles.get(place.session) ?? place.session}
              </h3>
              {place.stopped ? (
                <p role="status" className="text-xs text-feedback-warning">
                  {t(I18nKey.ORG_CHART$STOPPED_REASON, {
                    reason: place.stopped.reason,
                  })}
                </p>
              ) : null}
              <StartAgain node={place} />
              {place.pending_split ? (
                <ProposedTeams
                  proposal={place.pending_split}
                  places={
                    sessions.find((session) => session.id === place.session)
                      ?.teams
                  }
                />
              ) : null}
              {place.review ? <ReviewSummary review={place.review} /> : null}
            </section>
          ) : null,
        )}
        {placesAt(node.id, sessions).map((place) =>
          place.division_lead && place.merge ? (
            <MergeWaits
              key={place.id}
              session={place.session}
              title={titles.get(place.session) ?? place.session}
              merge={place.merge}
              nodes={nodes}
            />
          ) : null,
        )}
        <SpecAndContracts node={node} />
        <TeamReports node={node} />
        <TeamRecord node={node} />
        <TeamMessages node={node} places={places} nodes={nodes} />
      </div>

      <div
        role="group"
        aria-label={t(I18nKey.ORG_CHART$AGENTS)}
        className={cn(
          "flex flex-col gap-2 border-b border-border p-3",
          open || showsChanges ? "max-h-1/4 shrink-0" : "min-h-0 flex-1",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium text-text-secondary">
            {t(I18nKey.ORG_CHART$CONVERSATIONS)}
          </h3>
          {changed ? (
            <button
              type="button"
              data-testid="org-team-changes-tab"
              aria-pressed={showsChanges}
              onClick={() => setShowsChanges((shown) => !shown)}
              className={cn(TAB_CLASS, showsChanges ? TAB_CHOSEN_CLASS : null)}
            >
              {t(I18nKey.ORG_CHART$CHANGES)}
            </button>
          ) : null}
        </div>
        <ul
          data-testid="org-node-conversations"
          className="flex min-h-0 flex-col gap-1.5 overflow-y-auto"
        >
          {conversations.map((candidate) => {
            const chosen = !showsChanges && candidate.key === open?.key;
            return (
              <li key={candidate.key}>
                <button
                  type="button"
                  aria-pressed={chosen}
                  disabled={!candidate.conversationId}
                  data-mine={candidate.mine || undefined}
                  title={
                    candidate.mine
                      ? t(I18nKey.ORG_CHART$CONVERSATION_YOURS)
                      : undefined
                  }
                  onClick={() => {
                    setShowsChanges(false);
                    // Choosing the one that is open puts it away again.
                    setOpenKey(chosen ? null : candidate.key);
                  }}
                  className={cn(
                    ROW_CLASS,
                    candidate.mine ? ROW_MINE_CLASS : ROW_PLAIN_CLASS,
                    chosen ? ROW_OPEN_CLASS : null,
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {candidate.divisionLead
                      ? t(
                          candidate.role === "ic"
                            ? I18nKey.ORG_CHART$DIVISION_LEAD_IC
                            : I18nKey.ORG_CHART$DIVISION_LEAD_MANAGER,
                        )
                      : t(ROLE_LABEL_KEYS[candidate.role])}
                    {` · ${candidate.session}`}
                    {candidate.handOver
                      ? ` · ${t(I18nKey.ORG_CHART$HAND_OVER_MODE)}`
                      : null}
                  </span>
                  {candidate.agent.kind === "acp" && !candidate.handOver ? (
                    <span className="rounded-sm border border-border px-1 text-2xs text-text-secondary">
                      {externalAgentName(candidate.agent) ??
                        t(I18nKey.ORG_CHART$EXTERNAL_AGENT)}
                    </span>
                  ) : null}
                  {candidate.agent.model && !candidate.handOver ? (
                    <span
                      data-testid="org-agent-model"
                      title={candidate.agent.model}
                      className="max-w-40 truncate text-2xs text-text-secondary"
                    >
                      {candidate.agent.model}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      candidate.mine ? null : "text-muted",
                    )}
                  >
                    {candidate.status}
                  </span>
                </button>
                {candidate.agent.reason && !candidate.handOver ? (
                  <p
                    role="status"
                    className="px-2 pt-1 text-xs text-feedback-warning"
                  >
                    {candidate.agent.reason}
                  </p>
                ) : null}
              </li>
            );
          })}
          {conversations.length === 0 ? (
            // Work starts here when something is first sent to the team.
            <li className={cn(ROW_CLASS, "border-border text-muted")}>
              {t(I18nKey.ORG_CHART$TEAM_NOT_STARTED)}
            </li>
          ) : null}
        </ul>
        {lost ? (
          <p role="status" className="text-xs text-feedback-warning">
            {t(I18nKey.ORG_CHART$HAND_OVER_LOST)}
          </p>
        ) : null}
        {!open && !(showsChanges && changed) ? (
          <p className="p-3 text-center text-sm text-muted">
            {t(nothingOpenKey)}
          </p>
        ) : null}
      </div>

      {!open && !(showsChanges && changed) ? (
        // A new request to the team is written here, beside its conversations.
        <div className="shrink-0 border-b border-border p-3">
          <MessageToTeam key={node.id} node={node} />
        </div>
      ) : null}
      {showsChanges && changed ? (
        <div className="min-h-0 flex-1">
          <React.Suspense fallback={null}>
            <TeamChanges key={changed.id} node={changed} />
          </React.Suspense>
        </div>
      ) : null}
      {!(showsChanges && changed) && open && conversationId ? (
        <>
          <p className="border-b border-border px-3 py-1.5 text-xs text-muted">
            {open.handOver
              ? t(I18nKey.ORG_CHART$HAND_OVER_MODE_HELP)
              : t(I18nKey.ORG_CHART$MESSAGE_AGENT_HINT, {
                  role: t(ROLE_LABEL_KEYS[open.role]),
                })}
          </p>
          <div className="min-h-0 flex-1">
            <React.Suspense fallback={null}>
              <AgentConversation
                key={conversationId}
                conversationId={conversationId}
              />
            </React.Suspense>
          </div>
        </>
      ) : null}
    </aside>
  );
}
