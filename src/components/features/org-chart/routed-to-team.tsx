import { useTranslation } from "react-i18next";
import { NavigationLink } from "#/components/shared/navigation-link";
import { orgNodePath } from "#/constants/org-chart";
import { I18nKey } from "#/i18n/declaration";
import type { RoutedTo } from "#/stores/optimistic-user-message-store";

/** Under a message the director sent to a team: which team, and why. */
export function RoutedToTeam({ routedTo }: { routedTo?: RoutedTo }) {
  const { t } = useTranslation("openhands");
  if (!routedTo) return null;
  return (
    <p
      role="status"
      data-testid="routed-to-team"
      className="mt-1 text-xs text-muted"
    >
      {t(I18nKey.ORG_CHART$ROUTED_TO)}{" "}
      <NavigationLink
        to={orgNodePath(routedTo.nodeId)}
        className="text-contrast hover:text-link hover:underline"
      >
        {routedTo.team}
      </NavigationLink>
      {routedTo.reason ? ` (${routedTo.reason})` : null}
    </p>
  );
}
