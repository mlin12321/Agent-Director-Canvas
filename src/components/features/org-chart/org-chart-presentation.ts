import type {
  AgentRef,
  AgentRole,
  EscalationKind,
  IsolationMode,
  NodeStatus,
  ReviewState,
  SplitStatus,
  TeamEnforcement,
} from "#/api/director/types";
import { I18nKey } from "#/i18n/declaration";

export const STATUS_LABEL_KEYS: Record<NodeStatus, I18nKey> = {
  idle: I18nKey.ORG_CHART$STATUS_IDLE,
  working: I18nKey.ORG_CHART$STATUS_WORKING,
  done: I18nKey.ORG_CHART$STATUS_DONE,
  blocked: I18nKey.ORG_CHART$STATUS_BLOCKED,
};

export const STATUS_DOT_CLASSES: Record<NodeStatus, string> = {
  idle: "bg-muted",
  // The theme has no orange; these steps stay apart from the red and green
  // beside them on a light and on a dark surface.
  working: "bg-[#d9730d] dark:bg-[#f08a24]",
  done: "bg-success",
  blocked: "bg-danger",
};

export const ROLE_LABEL_KEYS: Record<AgentRole, I18nKey> = {
  ic: I18nKey.ORG_CHART$ROLE_IC,
  manager: I18nKey.ORG_CHART$ROLE_MANAGER,
};

export const ISOLATION_LABEL_KEYS: Record<IsolationMode, I18nKey> = {
  worktree: I18nKey.ORG_CHART$ISOLATION_WORKTREE,
  shared: I18nKey.ORG_CHART$ISOLATION_SHARED,
};

export const ESCALATION_LABEL_KEYS: Record<EscalationKind, I18nKey> = {
  critical_issue: I18nKey.ORG_CHART$ESCALATION_CRITICAL,
  design_decision: I18nKey.ORG_CHART$ESCALATION_DECISION,
};

export const ENFORCEMENT_LABEL_KEYS: Record<TeamEnforcement, I18nKey> = {
  sandbox: I18nKey.ORG_CHART$ENFORCED_SANDBOX,
  checks: I18nKey.ORG_CHART$ENFORCED_CHECKS,
  merge: I18nKey.ORG_CHART$ENFORCED_MERGE,
};

// Product names, the same in every language.
const EXTERNAL_AGENT_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "gemini-cli": "Gemini CLI",
  pi: "Pi",
  opencode: "OpenCode",
};

/**
 * The product an external agent is, when the server could tell; `null` for
 * an OpenHands agent and for an external one it could not name.
 */
export function externalAgentName(agent: AgentRef): string | null {
  if (agent.kind !== "acp" || !agent.acp_server) return null;
  return EXTERNAL_AGENT_NAMES[agent.acp_server] ?? agent.acp_server;
}

export const SPLIT_LABEL_KEYS: Record<SplitStatus, I18nKey> = {
  proposed: I18nKey.ORG_CHART$SPLIT_PROPOSED,
  approved: I18nKey.ORG_CHART$SPLIT_APPROVED,
};

export const REVIEW_LABEL_KEYS: Record<ReviewState, I18nKey> = {
  pending: I18nKey.ORG_CHART$REVIEW_PENDING,
  changes_requested: I18nKey.ORG_CHART$REVIEW_CHANGES_REQUESTED,
  accepted: I18nKey.ORG_CHART$REVIEW_ACCEPTED,
  unreviewed: I18nKey.ORG_CHART$REVIEW_UNREVIEWED,
};
