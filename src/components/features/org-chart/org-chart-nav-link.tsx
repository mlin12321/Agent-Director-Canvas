import { useTranslation } from "react-i18next";
import { Network } from "lucide-react";
import { SidebarNavLink } from "#/components/features/sidebar/sidebar-nav-link";
import { ORG_CHART_PATH } from "#/constants/org-chart";
import { useWaitingOnHuman } from "#/hooks/use-waiting-on-human";
import { I18nKey } from "#/i18n/declaration";

const ICON_SIZE = 18;

/**
 * The sidebar's way to the org chart, marked while a team waits on the
 * human. The director only runs next to a local backend, so a cloud one
 * has no such link.
 */
export function OrgChartNavLink({
  collapsed,
  isCloudBackend,
}: {
  collapsed: boolean;
  isCloudBackend: boolean;
}) {
  const { t } = useTranslation("openhands");
  // What waits on the human in the org shows wherever they are.
  const waitingOnHuman = useWaitingOnHuman(!isCloudBackend);
  if (isCloudBackend) return null;
  return (
    <SidebarNavLink
      to={ORG_CHART_PATH}
      label={
        waitingOnHuman > 0
          ? t(I18nKey.ORG_CHART$NAV_WAITING, { count: waitingOnHuman })
          : t(I18nKey.ORG_CHART$NAV)
      }
      testId="sidebar-org-chart-link"
      collapsed={collapsed}
      icon={
        <span className="relative inline-flex">
          <Network width={ICON_SIZE} height={ICON_SIZE} />
          {waitingOnHuman > 0 ? (
            <span
              data-testid="sidebar-org-waiting"
              className="absolute -right-1 -top-1 size-2 rounded-full bg-feedback-warning"
            />
          ) : null}
        </span>
      }
    />
  );
}
