import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DirectorClient, DirectorError } from "#/api/director/director-client";
import type { OrgSync as SyncResult } from "#/api/director/types";
import { I18nKey } from "#/i18n/declaration";

const BUTTON =
  "flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-2 text-xs text-text-secondary hover:bg-surface-raised hover:text-contrast disabled:opacity-40 disabled:hover:bg-transparent";

const OUTCOME_KEYS = {
  up_to_date: I18nKey.ORG_CHART$SYNC_UP_TO_DATE,
  fast_forward: I18nKey.ORG_CHART$SYNC_PULLED,
  merged: I18nKey.ORG_CHART$SYNC_PULLED,
  conflicts: I18nKey.ORG_CHART$SYNC_CONFLICTS,
  pushed: I18nKey.ORG_CHART$SYNC_PUSHED,
} satisfies Record<SyncResult["result"], I18nKey>;

/**
 * Exchanges the org with the repository's `origin`, as git does a branch:
 * the tree of teams, their specs, contracts and rules, and the branches of
 * their work. Nothing travels until one of the two is pressed.
 */
export function OrgSync({
  canPush = true,
  merging = false,
}: {
  canPush?: boolean;
  /** A pull waits for choices; its conflicts are shown by the page. */
  merging?: boolean;
}) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const sync = useMutation({
    mutationFn: (direction: "pull" | "push") =>
      direction === "pull"
        ? DirectorClient.pullOrg()
        : DirectorClient.pushOrg(),
    onSuccess: (result) => {
      // A pull can change anything the page shows of the org.
      if (result.result !== "pushed") {
        queryClient.invalidateQueries({ queryKey: ["director"] });
      }
    },
    meta: { disableToast: true },
  });
  // Once a merge is finished or abandoned there is nothing left to say
  // about the pull that began it.
  const result =
    sync.data?.result === "conflicts" && !merging ? undefined : sync.data;
  const keptLocal = result?.memory?.kept_local ?? [];
  const diverged = (result?.branches ?? []).filter(
    (branch) => branch.result === "diverged",
  );
  const refused =
    sync.error instanceof DirectorError && sync.error.status === 409;

  return (
    <div className="flex items-center gap-2">
      <div
        role="group"
        aria-label={t(I18nKey.ORG_CHART$SYNC_LABEL)}
        className="flex items-center rounded-lg border border-border p-0.5"
      >
        <span className="px-2 text-xs text-muted">
          {t(I18nKey.ORG_CHART$SYNC_LABEL)}
        </span>
        <button
          type="button"
          disabled={sync.isPending}
          onClick={() => sync.mutate("pull")}
          className={BUTTON}
        >
          {t(I18nKey.ORG_CHART$SYNC_PULL)}
        </button>
        {canPush ? (
          <button
            type="button"
            disabled={sync.isPending}
            onClick={() => sync.mutate("push")}
            className={BUTTON}
          >
            {t(I18nKey.ORG_CHART$SYNC_PUSH)}
          </button>
        ) : null}
      </div>
      {sync.isError ? (
        <span role="alert" className="text-xs text-feedback-error">
          {t(
            refused
              ? I18nKey.ORG_CHART$SYNC_REFUSED
              : I18nKey.ORG_CHART$SYNC_ERROR,
          )}
        </span>
      ) : null}
      {result && !sync.isError ? (
        <span role="status" className="text-xs text-muted">
          {t(OUTCOME_KEYS[result.result], { remote: result.remote })}
          {keptLocal.length > 0 ? (
            <span className="text-feedback-warning">
              {" "}
              {t(I18nKey.ORG_CHART$SYNC_KEPT_LOCAL, {
                paths: keptLocal.join(", "),
              })}
            </span>
          ) : null}
          {diverged.length > 0 ? (
            <span className="text-feedback-warning">
              {" "}
              {t(I18nKey.ORG_CHART$SYNC_DIVERGED, {
                teams: diverged.map((branch) => branch.title).join(", "),
              })}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
