import { useTranslation } from "react-i18next";
import type { NodeId, OrgNode, SplitProposal } from "#/api/director/types";
import { I18nKey } from "#/i18n/declaration";
import { SPLIT_LABEL_KEYS } from "./org-chart-presentation";

interface ProposedTeamsProps {
  proposal: SplitProposal;
  /** The teams known to the page, to name the ones kept and replaced. */
  nodes?: ReadonlyMap<NodeId, OrgNode>;
}

/**
 * The sub-teams a team's IC proposed and its Manager has not carried out
 * yet, with what becomes of the sub-teams the team has now.
 */
export function ProposedTeams({ proposal, nodes }: ProposedTeamsProps) {
  const { t } = useTranslation("openhands");
  const titles = (ids: NodeId[] | undefined) =>
    (ids ?? []).map((id) => nodes?.get(id)?.title ?? id).join(", ");
  const keeps = titles(proposal.keeps);
  const replaces = titles(proposal.replaces);
  const label = t(SPLIT_LABEL_KEYS[proposal.status]);

  return (
    <section aria-label={label} className="flex flex-col gap-1">
      <h3 className="text-sm font-medium text-contrast">{label}</h3>
      <p className="text-xs text-text-secondary">
        {proposal.children.map((child) => child.title).join(", ")}
      </p>
      {proposal.reason ? (
        <p className="whitespace-pre-wrap break-words text-xs text-muted">
          {proposal.reason}
        </p>
      ) : null}
      {proposal.children.some((child) => child.reason) ? (
        // Why the IC wants each team, where it said.
        <ul className="flex flex-col gap-0.5 text-xs text-muted">
          {proposal.children
            .filter((child) => child.reason)
            .map((child) => (
              <li key={child.path} className="break-words">
                <span className="text-text-secondary">{child.title}</span>
                {": "}
                {child.reason}
              </li>
            ))}
        </ul>
      ) : null}
      {keeps ? (
        <p className="text-xs text-muted">
          {t(I18nKey.ORG_CHART$SPLIT_KEEPS, { teams: keeps })}
        </p>
      ) : null}
      {replaces ? (
        <p className="text-xs text-muted">
          {t(I18nKey.ORG_CHART$SPLIT_REPLACES, { teams: replaces })}
        </p>
      ) : null}
    </section>
  );
}
