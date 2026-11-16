import { useTranslation } from "react-i18next";
import type { OrgNode } from "#/api/director/types";
import { I18nKey } from "#/i18n/declaration";
import { useTeamAtWork } from "./org-sessions";
import { StatusBadge } from "./status-badge";
import { useReviewLabel } from "./review-summary";
import {
  ESCALATION_LABEL_KEYS,
  externalAgentName,
  ISOLATION_LABEL_KEYS,
  ROLE_LABEL_KEYS,
  SPLIT_LABEL_KEYS,
} from "./org-chart-presentation";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-contrast">{children}</dd>
    </div>
  );
}

interface NodeHoverCardProps {
  node: OrgNode;
}

/**
 * What a team is doing and what it owns. Shown only while its card is
 * hovered or focused, so the chart itself stays a plain picture of the org.
 */
export function NodeHoverCard({ node: team }: NodeHoverCardProps) {
  const { t } = useTranslation("openhands");
  // Nobody works at a team itself: its work is what the sessions do there.
  const node = useTeamAtWork(team);
  const { boundary } = node;
  const reviewLabel = useReviewLabel();
  // What a team above still holds is that team's to settle, not the human's.
  const waiting = node.escalations.filter(
    (escalation) => escalation.held_by === null,
  );

  return (
    <div className="flex w-80 max-w-full flex-col gap-2 break-normal p-1 text-left text-xs">
      <p className="text-sm font-medium text-contrast">{node.title}</p>
      {node.headline ? (
        <p className="text-text-secondary">{node.headline}</p>
      ) : null}
      {node.spec_summary && node.spec_summary !== node.headline ? (
        <p className="text-muted">{node.spec_summary}</p>
      ) : null}
      <dl className="flex flex-col gap-1">
        <Row label={t(I18nKey.ORG_CHART$STATUS)}>
          <StatusBadge status={node.status} />
          {node.stopped ? (
            <span className="ml-1.5 rounded-sm border border-border px-1 text-2xs text-feedback-warning">
              {t(I18nKey.ORG_CHART$STOPPED)}
            </span>
          ) : null}
        </Row>
        {node.review ? (
          <Row label={t(I18nKey.ORG_CHART$REVIEW)}>
            {reviewLabel(node.review)}
          </Row>
        ) : null}
        <Row label={t(I18nKey.ORG_CHART$BOUNDARY)}>
          <code className="break-all">
            {boundary.path || t(I18nKey.ORG_CHART$BOUNDARY_ROOT)}
          </code>
          <span className="text-muted">
            {" · "}
            {t(ISOLATION_LABEL_KEYS[node.isolation])}
          </span>
        </Row>
        {boundary.writable.length > 0 ? (
          <Row label={t(I18nKey.ORG_CHART$WRITABLE)}>
            <code className="break-all">{boundary.writable.join(", ")}</code>
          </Row>
        ) : null}
        {boundary.readonly.length > 0 ? (
          <Row label={t(I18nKey.ORG_CHART$READONLY)}>
            <code className="break-all">{boundary.readonly.join(", ")}</code>
          </Row>
        ) : null}
        {node.agents.length === 0 ? (
          <Row label={t(I18nKey.ORG_CHART$AGENTS)}>
            {t(I18nKey.ORG_CHART$TEAM_NOT_STARTED)}
          </Row>
        ) : null}
        {node.agents.length > 0 ? (
          <Row label={t(I18nKey.ORG_CHART$AGENTS)}>
            {node.agents
              .map((agent) => {
                // An external agent is named; an OpenHands one is the rule.
                const external =
                  agent.kind === "acp"
                    ? ` · ${externalAgentName(agent) ?? t(I18nKey.ORG_CHART$EXTERNAL_AGENT)}`
                    : "";
                return `${t(ROLE_LABEL_KEYS[agent.role])} (${agent.status}${external})`;
              })
              // A Manager starts when something is first written to it.
              .concat(
                node.agents.some((agent) => agent.role === "manager")
                  ? []
                  : [t(I18nKey.ORG_CHART$MANAGER_NOT_STARTED)],
              )
              .join(", ")}
          </Row>
        ) : null}
        {node.agent_profile ? (
          <Row label={t(I18nKey.ORG_CHART$AGENT_PROFILE)}>
            {node.agent_profile}
          </Row>
        ) : null}
      </dl>
      {node.stopped ? (
        <p className="border-t border-border pt-2 text-text-secondary">
          {t(I18nKey.ORG_CHART$STOPPED_REASON, {
            reason: node.stopped.reason,
          })}
        </p>
      ) : null}
      {node.pending_split ? (
        // A split the team's Manager has not approved, or is carrying out.
        <div className="flex flex-col gap-0.5 border-t border-border pt-2">
          <span className="text-contrast">
            {t(SPLIT_LABEL_KEYS[node.pending_split.status])}
          </span>
          <span className="text-muted">
            {node.pending_split.children.map((child) => child.title).join(", ")}
          </span>
        </div>
      ) : null}
      {waiting.length > 0 ? (
        <ul className="flex flex-col gap-1 border-t border-border pt-2">
          {waiting.map((escalation) => (
            <li key={escalation.id} className="flex flex-col">
              <span className="text-contrast">{escalation.title}</span>
              <span className="text-muted">
                {t(ESCALATION_LABEL_KEYS[escalation.kind])}
                {" · "}
                {t(I18nKey.ORG_CHART$ESCALATION_WAITING)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
