import React from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  AgentRole,
  BoundaryEnforcement,
  NodeId,
  OrgNode,
} from "#/api/director/types";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { TeamMessages } from "./team-messages";
import { TeamReports } from "./team-reports";
import { ReviewSummary } from "./review-summary";
import { SpecAndContracts } from "./spec-and-contracts";
import { StartAgain } from "./start-again";
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

/** One team's details: its boundary memory and its agents' conversations. */
export function AgentInspectorDrawer({
  node,
  nodes,
  enforcement,
  onClose,
}: AgentInspectorDrawerProps) {
  const { t } = useTranslation("openhands");
  const titleId = React.useId();
  // Tracked by role so the drawer follows the agent across live updates.
  const [role, setRole] = React.useState<AgentRole | null>(null);
  const [showsChanges, setShowsChanges] = React.useState(false);
  const agent =
    node.agents.find((candidate) => candidate.role === role) ??
    node.agents.at(0) ??
    null;

  const held = node.boundary_enforcement ?? enforcement;

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
        <StartAgain node={node} />
        {node.review ? <ReviewSummary review={node.review} /> : null}
        <SpecAndContracts node={node} />
        <TeamReports node={node} />
        <TeamMessages node={node} nodes={nodes} />
      </div>

      <div
        role="group"
        aria-label={t(I18nKey.ORG_CHART$AGENTS)}
        className="flex flex-wrap gap-2 border-b border-border p-3"
      >
        {node.agents.map((candidate) => (
          <button
            key={candidate.role}
            type="button"
            aria-pressed={!showsChanges && candidate.role === agent?.role}
            onClick={() => {
              setRole(candidate.role);
              setShowsChanges(false);
            }}
            className={cn(
              TAB_CLASS,
              !showsChanges && candidate.role === agent?.role
                ? TAB_CHOSEN_CLASS
                : null,
            )}
          >
            {t(ROLE_LABEL_KEYS[candidate.role])}
            <span className="text-xs text-muted">{candidate.status}</span>
            {candidate.kind === "acp" ? (
              <span className="rounded-sm border border-border px-1 text-[11px] text-text-secondary">
                {externalAgentName(candidate) ??
                  t(I18nKey.ORG_CHART$EXTERNAL_AGENT)}
              </span>
            ) : null}
          </button>
        ))}
        <button
          type="button"
          data-testid="org-team-changes-tab"
          aria-pressed={showsChanges}
          onClick={() => setShowsChanges(true)}
          className={cn(
            TAB_CLASS,
            "ml-auto",
            showsChanges ? TAB_CHOSEN_CLASS : null,
          )}
        >
          {t(I18nKey.ORG_CHART$CHANGES)}
        </button>
      </div>

      {showsChanges ? (
        <div className="min-h-0 flex-1">
          <React.Suspense fallback={null}>
            <TeamChanges key={node.id} node={node} />
          </React.Suspense>
        </div>
      ) : null}
      {!showsChanges && agent?.conversation_id ? (
        <p className="border-b border-border px-3 py-1.5 text-xs text-muted">
          {t(I18nKey.ORG_CHART$MESSAGE_AGENT_HINT, {
            role: t(ROLE_LABEL_KEYS[agent.role]),
          })}
        </p>
      ) : null}
      <div className={cn("min-h-0 flex-1", showsChanges && "hidden")}>
        {agent?.conversation_id ? (
          <React.Suspense fallback={null}>
            <AgentConversation
              key={agent.conversation_id}
              conversationId={agent.conversation_id}
            />
          </React.Suspense>
        ) : (
          <p className="p-6 text-center text-sm text-muted">
            {t(I18nKey.ORG_CHART$NO_CONVERSATION)}
          </p>
        )}
      </div>
    </aside>
  );
}
