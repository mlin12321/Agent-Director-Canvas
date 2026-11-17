import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DirectorClient, refusalOf } from "#/api/director/director-client";
import type { OrgConflict, Side } from "#/api/director/types";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";
import { I18nKey } from "#/i18n/declaration";

const BUTTON =
  "flex h-8 items-center rounded-lg border border-border px-2.5 text-xs text-text-secondary hover:bg-surface-raised hover:text-contrast disabled:opacity-40";

const SIDES = [
  ["mine", I18nKey.ORG_CHART$MERGE_MINE],
  ["theirs", I18nKey.ORG_CHART$MERGE_THEIRS],
] as const;

/** What one side of a conflict has, in words where the server sends none. */
function useShown(conflict: OrgConflict) {
  const { t } = useTranslation("openhands");
  return (side: Side) => {
    const value = conflict[side];
    if (value === null) return t(I18nKey.ORG_CHART$MERGE_REMOVED);
    return conflict.kind === "team" ? t(I18nKey.ORG_CHART$MERGE_KEPT) : value;
  };
}

function Conflict({
  conflict,
  choice,
  onChoose,
}: {
  conflict: OrgConflict;
  choice: Side | undefined;
  onChoose: (side: Side) => void;
}) {
  const { t } = useTranslation("openhands");
  const shown = useShown(conflict);
  const name = [conflict.title, conflict.field].filter(Boolean).join(" · ");

  return (
    <fieldset
      data-testid={`org-conflict-${conflict.id}`}
      className="rounded-lg border border-border p-2"
    >
      <legend className="px-1 text-xs text-contrast">{name}</legend>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {SIDES.map(([side, label]) => (
          <label
            key={side}
            className="flex min-w-0 cursor-pointer flex-col gap-1 rounded-md border border-border p-2 has-[:checked]:border-feedback-warning"
          >
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="radio"
                name={conflict.id}
                aria-label={t(label)}
                checked={choice === side}
                onChange={() => onChoose(side)}
              />
              {t(label)}
            </span>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-contrast">
              {shown(side)}
            </pre>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The conflicts of a pull that stopped: what both sides changed, with a
 * choice of side for each. Nothing of the pull is written until every one
 * has a choice and the merge is finished; abandoning it leaves the org as
 * it was.
 */
export function MergeConflicts() {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const queryClient = useQueryClient();
  const merge = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.merge(backend.id),
    queryFn: () => DirectorClient.getMerge(),
    retry: false,
    meta: { disableToast: true },
  }).data;
  const [choices, setChoices] = React.useState<Record<string, Side>>({});
  const settle = useMutation({
    mutationFn: (finish: boolean) =>
      finish
        ? DirectorClient.resolveMerge(choices)
        : DirectorClient.abortMerge(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["director"] }),
    meta: { disableToast: true },
  });

  if (!merge) return null;
  const conflicts = merge.conflicts.filter((each) => each.choice === null);
  const chooseAll = (side: Side) =>
    setChoices(Object.fromEntries(conflicts.map((each) => [each.id, side])));
  const complete = conflicts.every((each) => choices[each.id] !== undefined);

  return (
    <section
      data-testid="org-merge"
      aria-label={t(I18nKey.ORG_CHART$MERGE_TITLE, { remote: merge.remote })}
      className="flex flex-col gap-2 rounded-lg border border-feedback-warning px-3 py-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm text-contrast">
            {t(I18nKey.ORG_CHART$MERGE_TITLE, { remote: merge.remote })}
          </span>
          <span className="text-xs text-text-secondary">
            {t(I18nKey.ORG_CHART$MERGE_BODY)}
          </span>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {settle.isError ? (
            <span role="alert" className="text-xs text-feedback-error">
              {refusalOf(settle.error) ?? t(I18nKey.ORG_CHART$MERGE_ERROR)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => chooseAll("mine")}
            className={BUTTON}
          >
            {t(I18nKey.ORG_CHART$MERGE_ALL_MINE)}
          </button>
          <button
            type="button"
            onClick={() => chooseAll("theirs")}
            className={BUTTON}
          >
            {t(I18nKey.ORG_CHART$MERGE_ALL_THEIRS)}
          </button>
          <button
            type="button"
            disabled={settle.isPending}
            onClick={() => settle.mutate(false)}
            className={BUTTON}
          >
            {t(I18nKey.ORG_CHART$MERGE_ABORT)}
          </button>
          <button
            type="button"
            disabled={!complete || settle.isPending}
            onClick={() => settle.mutate(true)}
            className={BUTTON}
          >
            {t(I18nKey.ORG_CHART$MERGE_FINISH)}
          </button>
        </span>
      </div>
      <div className="flex max-h-80 flex-col gap-2 overflow-auto">
        {conflicts.map((conflict) => (
          <Conflict
            key={conflict.id}
            conflict={conflict}
            choice={choices[conflict.id]}
            onChoose={(side) =>
              setChoices((made) => ({ ...made, [conflict.id]: side }))
            }
          />
        ))}
      </div>
    </section>
  );
}
