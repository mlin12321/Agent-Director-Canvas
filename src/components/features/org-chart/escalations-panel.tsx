import React from "react";
import { useMutation } from "@tanstack/react-query";
import { CircleHelp, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DirectorClient } from "#/api/director/director-client";
import type { OpenEscalation } from "#/api/director/types";
import { NavigationLink } from "#/components/shared/navigation-link";
import { orgNodePath } from "#/constants/org-chart";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { ESCALATION_LABEL_KEYS } from "./org-chart-presentation";
import { SessionMark } from "./org-sessions";

interface EscalationsPanelProps {
  /** In the server's order: critical issues first, then longest waiting. */
  escalations: OpenEscalation[];
}

/**
 * One thing no team could settle: where it came from, why each team above
 * passed it on, and the answer box that settles it. The entry leaves the
 * list when the server says so, not when the answer is sent.
 */
function EscalationCard({ item }: { item: OpenEscalation }) {
  const { t } = useTranslation("openhands");
  const { escalation } = item;
  const [draft, setDraft] = React.useState("");
  const inputId = React.useId();
  const critical = escalation.kind === "critical_issue";
  const Icon = critical ? TriangleAlert : CircleHelp;
  const titles = new Map(item.path.map((step) => [step.id, step.title]));
  const answer = useMutation({
    meta: { disableToast: true },
    // One a team raised in a session is answered to the session's IC.
    mutationFn: (text: string): Promise<unknown> =>
      item.session_id
        ? DirectorClient.answerSessionEscalation(
            item.session_id,
            item.node_id,
            escalation.id,
            text,
          )
        : DirectorClient.answerEscalation(item.node_id, escalation.id, text),
  });
  const text = draft.trim();

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (text) answer.mutate(text);
  };

  return (
    <li className="flex min-w-64 flex-1 flex-col gap-1 rounded-lg border border-border bg-surface p-2.5 text-left">
      <span
        className={cn(
          "flex items-center gap-1 text-xs font-medium",
          critical ? "text-feedback-error" : "text-text-secondary",
        )}
      >
        <Icon width={12} height={12} aria-hidden="true" />
        {t(ESCALATION_LABEL_KEYS[escalation.kind])}
      </span>
      <span className="text-sm text-contrast">{escalation.title}</span>
      {escalation.detail ? (
        <span className="text-xs text-text-secondary">{escalation.detail}</span>
      ) : null}
      <NavigationLink
        to={orgNodePath(item.node_id)}
        className="self-start text-xs text-muted hover:text-link hover:underline"
      >
        {item.path.map((step) => step.title).join(" › ")}
      </NavigationLink>
      {item.session ? (
        <span className="flex">
          <SessionMark title={item.session} />
        </span>
      ) : null}
      {escalation.handoffs.length > 0 ? (
        <span className="flex flex-col gap-0.5 border-t border-border pt-1 text-xs text-text-secondary">
          <span className="text-muted">
            {t(I18nKey.ORG_CHART$ESCALATION_PASSED_UP)}
          </span>
          {escalation.handoffs.map((handoff) => (
            <span key={handoff.node_id}>
              <span className="text-contrast">
                {titles.get(handoff.node_id) ?? handoff.node_id}
              </span>
              {": "}
              {handoff.reason}
            </span>
          ))}
        </span>
      ) : null}
      <form onSubmit={onSubmit} className="mt-1 flex flex-col gap-1.5">
        <label htmlFor={inputId} className="sr-only">
          {t(I18nKey.ORG_CHART$ESCALATION_ANSWER_LABEL, {
            title: escalation.title,
          })}
        </label>
        <textarea
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          placeholder={t(
            escalation.raised_by === "manager"
              ? I18nKey.ORG_CHART$ESCALATION_ANSWER_TO_MANAGER
              : I18nKey.ORG_CHART$ESCALATION_ANSWER_TO_IC,
            { team: titles.get(item.node_id) ?? item.node_id },
          )}
          className="rounded-md border border-border-input bg-field p-2 text-sm text-field-foreground"
        />
        {answer.isError ? (
          <p role="alert" className="text-xs text-feedback-error">
            {t(I18nKey.ORG_CHART$ESCALATION_ANSWER_FAILED)}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!text || answer.isPending || answer.isSuccess}
          className="self-start rounded-md border border-border px-2.5 py-1 text-sm text-contrast hover:bg-surface-raised disabled:opacity-50"
        >
          {t(I18nKey.ORG_CHART$ESCALATION_ANSWER_SUBMIT)}
        </button>
      </form>
    </li>
  );
}

/**
 * The only work the chart puts in front of the human: what no team on the
 * way up could settle. Answering an entry settles it and sends the answer
 * to the team that raised it.
 */
export function EscalationsPanel({ escalations }: EscalationsPanelProps) {
  const { t } = useTranslation("openhands");
  const title = t(I18nKey.ORG_CHART$ESCALATIONS);

  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-medium text-contrast">
        {title}
        {escalations.length > 0 ? (
          <span className="rounded-full bg-surface-raised px-1.5 text-xs text-text-secondary">
            {escalations.length}
          </span>
        ) : null}
      </h2>
      {escalations.length === 0 ? (
        <p className="text-sm text-muted">
          {t(I18nKey.ORG_CHART$ESCALATIONS_EMPTY)}
        </p>
      ) : (
        <ul className="flex max-h-72 flex-wrap gap-2 overflow-y-auto">
          {escalations.map((item) => (
            <EscalationCard
              key={`${item.node_id}/${item.escalation.id}`}
              item={item}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
