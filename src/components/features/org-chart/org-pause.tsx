import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DirectorClient, refusalOf } from "#/api/director/director-client";
import type {
  OrgSummary,
  PauseReason,
  Recovery,
  RecoveryItem,
} from "#/api/director/types";
import { NavigationLink } from "#/components/shared/navigation-link";
import { orgNodePath, teamOfPlace } from "#/constants/org-chart";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

const REASON_KEYS: Record<PauseReason, I18nKey> = {
  human: I18nKey.ORG_CHART$PAUSED_HUMAN,
  shutdown: I18nKey.ORG_CHART$PAUSED_SHUTDOWN,
  crash: I18nKey.ORG_CHART$PAUSED_CRASH,
};

const BUTTON =
  "flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-text-secondary hover:bg-surface-raised hover:text-contrast disabled:opacity-40";

/** Changes whether the org is paused, and tells the rest of the page. */
function usePauseSwitch() {
  const queryClient = useQueryClient();
  const { backend } = useActiveBackend();
  return useMutation({
    mutationFn: (pause: boolean) =>
      pause ? DirectorClient.pauseOrg() : DirectorClient.resumeOrg(),
    onSuccess: (recovery) => {
      queryClient.setQueryData<OrgSummary>(
        DIRECTOR_QUERY_KEYS.org(backend.id),
        (org) => org && { ...org, paused: recovery.paused },
      );
      queryClient.invalidateQueries({
        queryKey: DIRECTOR_QUERY_KEYS.recovery(backend.id),
      });
    },
    meta: { disableToast: true },
  });
}

/** Holds the org. A paused org is resumed from its banner. */
export function PauseButton() {
  const { t } = useTranslation("openhands");
  const pause = usePauseSwitch();

  return (
    <>
      {pause.isError ? (
        <span role="alert" className="text-xs text-feedback-error">
          {refusalOf(pause.error) ?? t(I18nKey.ORG_CHART$PAUSE_ERROR)}
        </span>
      ) : null}
      <button
        type="button"
        disabled={pause.isPending}
        onClick={() => pause.mutate(true)}
        className={BUTTON}
      >
        <Pause width={12} height={12} aria-hidden="true" />
        {t(I18nKey.ORG_CHART$PAUSE)}
      </button>
    </>
  );
}

function Items({ items }: { items: RecoveryItem[] }) {
  return (
    <ul className="mt-1 flex max-h-48 flex-col gap-1 overflow-auto text-xs">
      {items.map((item, index) => (
        // The same team can be listed more than once, with the same words.
        <li key={index} className="flex gap-2">
          {item.node_id ? (
            <NavigationLink
              to={orgNodePath(teamOfPlace(item.node_id))}
              className="shrink-0 font-medium text-link hover:underline"
            >
              {item.title || item.node_id}
            </NavigationLink>
          ) : null}
          <span
            className={cn(
              item.kind === "dropped" || item.kind === "cannot_resume"
                ? "text-feedback-warning"
                : "text-text-secondary",
            )}
          >
            {item.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PutAside({ recovery }: { recovery: Recovery | undefined }) {
  const { t } = useTranslation("openhands");
  if (recovery?.paused !== null || recovery.items.length === 0) return null;
  return (
    <div
      role="status"
      className="rounded-lg border border-border px-3 py-2 text-xs"
    >
      <span className="text-feedback-warning">
        {t(I18nKey.ORG_CHART$RECOVERY_PUT_ASIDE)}
      </span>
      <Items items={recovery.items} />
    </div>
  );
}

/**
 * Says that the org is paused and why, what resuming does, and resumes it.
 * After a resume it says what was put aside because it no longer fits the
 * org.
 */
export function PausedBanner({ paused }: { paused: PauseReason | null }) {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const resume = usePauseSwitch();
  const recovery = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.recovery(backend.id),
    queryFn: () => DirectorClient.getRecovery(),
    enabled: paused !== null,
    retry: false,
    meta: { disableToast: true },
  }).data;

  if (paused === null) return <PutAside recovery={resume.data} />;
  const items = recovery?.paused ? recovery.items : [];
  const held = recovery?.paused ? recovery.messages_held : 0;

  return (
    <div
      role="status"
      data-testid="org-paused"
      className="flex flex-col gap-1 rounded-lg border border-feedback-warning px-3 py-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-contrast">
          {t(REASON_KEYS[paused])}
          {held > 0 ? (
            <span className="text-text-secondary">
              {" "}
              {t(I18nKey.ORG_CHART$MESSAGES_HELD, { count: held })}
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-2">
          {resume.isError ? (
            <span role="alert" className="text-xs text-feedback-error">
              {refusalOf(resume.error) ?? t(I18nKey.ORG_CHART$PAUSE_ERROR)}
            </span>
          ) : null}
          <button
            type="button"
            disabled={resume.isPending}
            onClick={() => resume.mutate(false)}
            className={BUTTON}
          >
            <Play width={12} height={12} aria-hidden="true" />
            {t(I18nKey.ORG_CHART$RESUME)}
          </button>
        </span>
      </div>
      {recovery?.paused ? (
        <details className="text-xs text-text-secondary">
          <summary className="cursor-pointer">
            {t(I18nKey.ORG_CHART$RECOVERY_SHOW, { count: items.length })}
          </summary>
          {items.length > 0 ? (
            <Items items={items} />
          ) : (
            <p className="mt-1">{t(I18nKey.ORG_CHART$RECOVERY_NOTHING)}</p>
          )}
        </details>
      ) : null}
    </div>
  );
}
