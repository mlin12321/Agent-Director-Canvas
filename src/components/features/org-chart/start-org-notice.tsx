import { useTranslation } from "react-i18next";
import type { OrgSummary } from "#/api/director/types";
import { NavigationLink } from "#/components/shared/navigation-link";
import { useNavigation } from "#/context/navigation-context";
import { I18nKey } from "#/i18n/declaration";
import { useOpenFolderRequestStore } from "#/stores/open-folder-request-store";
import { OrgSync } from "./org-sync";

/** Where conversations are started and folders are chosen. */
export const HOME_PATH = "/conversations";

const ACTION_CLASS =
  "rounded-md border border-border px-3 py-1.5 text-sm text-contrast hover:bg-surface-raised";

/**
 * What the chart shows while the director has no org: how to get one. An org
 * starts with the first message of a conversation in a git folder, so the
 * way on is to Home, to its folder chooser when the server's own folder is
 * not in a git repository.
 */
export function StartOrgNotice({ org }: { org: OrgSummary }) {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const requestFolder = useOpenFolderRequestStore((state) => state.request);

  if (!org.is_git_repository) {
    return (
      <>
        <p className="max-w-md text-sm text-muted">
          {t(I18nKey.ORG_CHART$START_NEEDS_GIT, { path: org.repo_path })}
        </p>
        <button
          type="button"
          onClick={() => {
            requestFolder();
            navigate(HOME_PATH);
          }}
          className={ACTION_CLASS}
        >
          {t(I18nKey.ORG_CHART$START_OPEN_FOLDER)}
        </button>
      </>
    );
  }

  return (
    <>
      <p className="max-w-md text-sm text-muted">
        {t(I18nKey.ORG_CHART$START_BODY)}
      </p>
      <NavigationLink to={HOME_PATH} className={ACTION_CLASS}>
        {t(I18nKey.ORG_CHART$START_SUBMIT)}
      </NavigationLink>
      {/* A clone has no org until it takes in the one its remote has. */}
      <OrgSync canPush={false} />
    </>
  );
}
