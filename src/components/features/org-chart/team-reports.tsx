import { useTranslation } from "react-i18next";
import type { OrgNode } from "#/api/director/types";
import { useTeamMemory } from "#/hooks/query/use-team-memory";
import { I18nKey } from "#/i18n/declaration";
import { useMemberWords, useTeamTypes } from "./team-types";

interface TeamReportsProps {
  node: OrgNode;
}

/**
 * What the two agents of a team recorded for themselves: decisions,
 * setbacks, reflections. Read-only; only that team's agents add to it.
 */
export function TeamReports({ node }: TeamReportsProps) {
  const { t } = useTranslation("openhands");
  const types = useTeamTypes();
  const words = useMemberWords();
  const memory = useTeamMemory(node.id);

  let body: React.ReactNode;
  if (memory.isPending) {
    body = null;
  } else if (memory.isError) {
    body = (
      <p role="alert" className="text-xs text-feedback-error">
        {t(I18nKey.ORG_CHART$REPORTS_UNAVAILABLE)}
      </p>
    );
  } else {
    const reports = memory.data.reports ?? [];
    body =
      reports.length === 0 ? (
        <p className="text-xs text-muted">
          {t(I18nKey.ORG_CHART$REPORTS_EMPTY)}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-xs text-text-secondary">
          {reports.map((report) => (
            <li key={`${report.role}-${report.at}`} className="flex flex-col">
              <span className="whitespace-pre-wrap break-words">
                {report.text}
              </span>
              <span className="text-muted">
                {report.handed_over
                  ? t(I18nKey.ORG_CHART$REPORT_HANDED_OVER)
                  : words.label(types.member(report.role, node.agent_type))}
                {" · "}
                <time dateTime={report.at}>
                  {new Date(report.at).toLocaleString()}
                </time>
                {report.compacted
                  ? ` · ${t(I18nKey.ORG_CHART$REPORT_COMPACTED)}`
                  : null}
                {report.session
                  ? ` · ${t(I18nKey.ORG_CHART$SESSION_MARK, { title: report.session })}`
                  : null}
              </span>
            </li>
          ))}
        </ul>
      );
  }

  return (
    <section
      aria-label={t(I18nKey.ORG_CHART$REPORTS_TITLE)}
      className="flex flex-col gap-2"
    >
      <h3 className="text-sm font-medium text-contrast">
        {t(I18nKey.ORG_CHART$REPORTS_TITLE)}
      </h3>
      {body}
    </section>
  );
}
