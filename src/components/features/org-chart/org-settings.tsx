import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DirectorClient } from "#/api/director/director-client";
import type { DirectorSettingsState } from "#/api/director/types";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  ModalBody,
} from "#/components/shared/modals/modal-body";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";
import { useAgentProfiles } from "#/hooks/query/use-agent-profiles";
import { I18nKey } from "#/i18n/declaration";

const DEFAULTS = {
  max_agents: 64,
  max_depth: 8,
  allowed_profiles: [],
  stall_check_minutes: 120,
  manager_check_accepted_reviews: 5,
  manager_check_ic_escalations: 3,
};
const INPUT = "rounded-md border border-border bg-canvas-base px-3 py-2";

function whole(text: string, least: number) {
  const value = Number(text);
  return text.trim() !== "" && Number.isInteger(value) && value >= least;
}

/** The text of a setting; undefined on a server that has no such setting. */
function shown(value: number | undefined) {
  return value === undefined ? undefined : String(value);
}

function CountField({
  label,
  help,
  value,
  disabled,
  onChange,
}: {
  label: string;
  help: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      {label}
      <input
        type="number"
        min={0}
        step={1}
        required
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT}
      />
      <span className="text-xs text-muted">{help}</span>
    </label>
  );
}

function SettingsForm({
  state,
  onClose,
}: {
  state: DirectorSettingsState;
  onClose: () => void;
}) {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const queryClient = useQueryClient();
  const [agents, setAgents] = React.useState(String(state.max_agents));
  const [depth, setDepth] = React.useState(String(state.max_depth));
  // Absent on a server that cannot give a sub-team another agent.
  const [allowed, setAllowed] = React.useState(state.allowed_profiles);
  // Absent on a server that cannot pause an org.
  const [resumes, setResumes] = React.useState(state.resume_on_start);
  // Each absent on a server without that check; 0 turns a check off.
  const [stall, setStall] = React.useState(shown(state.stall_check_minutes));
  const [reviews, setReviews] = React.useState(
    shown(state.manager_check_accepted_reviews),
  );
  const [escalations, setEscalations] = React.useState(
    shown(state.manager_check_ic_escalations),
  );
  const profiles = useAgentProfiles({ enabled: allowed !== undefined }).data;
  // A profile that was allowed and has since been deleted can still be
  // unticked.
  const names = [
    ...new Set([
      ...(profiles?.profiles.map((profile) => profile.name) ?? []),
      ...(allowed ?? []),
    ]),
  ];
  const save = useMutation({
    mutationFn: () =>
      DirectorClient.updateSettings({
        max_agents: Number(agents),
        max_depth: Number(depth),
        ...(allowed ? { allowed_profiles: allowed } : {}),
        ...(resumes === undefined ? {} : { resume_on_start: resumes }),
        ...(stall === undefined ? {} : { stall_check_minutes: Number(stall) }),
        ...(reviews === undefined
          ? {}
          : { manager_check_accepted_reviews: Number(reviews) }),
        ...(escalations === undefined
          ? {}
          : { manager_check_ic_escalations: Number(escalations) }),
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(DIRECTOR_QUERY_KEYS.settings(backend.id), saved);
      onClose();
    },
    meta: { disableToast: true },
  });
  const valid =
    whole(agents, 2) &&
    whole(depth, 1) &&
    [stall, reviews, escalations].every(
      (count) => count === undefined || whole(count, 0),
    );

  return (
    <ModalBackdrop
      onClose={onClose}
      aria-label={t(I18nKey.ORG_CHART$SETTINGS)}
      closeOnEscape={!save.isPending}
      closeOnBackdropClick={!save.isPending}
    >
      <ModalBody
        testID="org-settings-modal"
        width="md"
        className={`items-stretch ${MODAL_MAX_WIDTH_VIEWPORT}`}
      >
        <h2 className="text-lg font-semibold">
          {t(I18nKey.ORG_CHART$SETTINGS)}
        </h2>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !save.isPending) save.mutate();
          }}
        >
          <label className="flex flex-col gap-2 text-sm">
            {t(I18nKey.ORG_CHART$SETTINGS_MAX_AGENTS)}
            <input
              type="number"
              min={2}
              step={1}
              required
              value={agents}
              disabled={save.isPending}
              onChange={(event) => setAgents(event.target.value)}
              className={INPUT}
            />
            <span className="text-xs text-muted">
              {t(I18nKey.ORG_CHART$SETTINGS_AGENTS_NOW, {
                count: state.agents,
              })}
            </span>
          </label>
          <label className="flex flex-col gap-2 text-sm">
            {t(I18nKey.ORG_CHART$SETTINGS_MAX_DEPTH)}
            <input
              type="number"
              min={1}
              step={1}
              required
              value={depth}
              disabled={save.isPending}
              onChange={(event) => setDepth(event.target.value)}
              className={INPUT}
            />
            <span className="text-xs text-muted">
              {t(I18nKey.ORG_CHART$SETTINGS_DEPTH_NOW, { count: state.depth })}
            </span>
          </label>
          <p className="text-xs text-muted">
            {t(I18nKey.ORG_CHART$SETTINGS_SCOPE)}
          </p>
          {allowed && names.length > 0 ? (
            <fieldset className="flex flex-col gap-2 text-sm">
              <legend className="mb-2">
                {t(I18nKey.ORG_CHART$SETTINGS_PROFILES)}
              </legend>
              {names.map((name) => (
                <label key={name} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allowed.includes(name)}
                    disabled={save.isPending}
                    onChange={(event) =>
                      setAllowed(
                        event.target.checked
                          ? [...allowed, name]
                          : allowed.filter((other) => other !== name),
                      )
                    }
                  />
                  {name}
                </label>
              ))}
              <span className="text-xs text-muted">
                {t(I18nKey.ORG_CHART$SETTINGS_PROFILES_HELP)}
              </span>
            </fieldset>
          ) : null}
          {resumes === undefined ? null : (
            <label className="flex flex-col gap-2 text-sm">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={resumes}
                  disabled={save.isPending}
                  onChange={(event) => setResumes(event.target.checked)}
                />
                {t(I18nKey.ORG_CHART$SETTINGS_RESUME_ON_START)}
              </span>
              <span className="text-xs text-muted">
                {t(I18nKey.ORG_CHART$SETTINGS_RESUME_ON_START_HELP)}
              </span>
            </label>
          )}
          {stall === undefined ? null : (
            <CountField
              label={t(I18nKey.ORG_CHART$SETTINGS_STALL_MINUTES)}
              help={t(I18nKey.ORG_CHART$SETTINGS_STALL_MINUTES_HELP)}
              value={stall}
              disabled={save.isPending}
              onChange={setStall}
            />
          )}
          {reviews === undefined ? null : (
            <CountField
              label={t(I18nKey.ORG_CHART$SETTINGS_MANAGER_REVIEWS)}
              help={t(I18nKey.ORG_CHART$SETTINGS_MANAGER_CHECK_HELP)}
              value={reviews}
              disabled={save.isPending}
              onChange={setReviews}
            />
          )}
          {escalations === undefined ? null : (
            <CountField
              label={t(I18nKey.ORG_CHART$SETTINGS_MANAGER_ESCALATIONS)}
              help={t(I18nKey.ORG_CHART$SETTINGS_MANAGER_CHECK_HELP)}
              value={escalations}
              disabled={save.isPending}
              onChange={setEscalations}
            />
          )}
          {state.max_concurrent_runs !== null ? (
            <p className="text-xs text-muted">
              {t(I18nKey.ORG_CHART$SETTINGS_RUNS, {
                count: state.max_concurrent_runs,
              })}
            </p>
          ) : null}
          {save.isError ? (
            <p role="alert" className="text-sm text-danger">
              {t(I18nKey.ORG_CHART$SETTINGS_SAVE_ERROR)}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <BrandButton
              type="button"
              variant="secondary"
              isDisabled={save.isPending}
              onClick={() => {
                setAgents(String(DEFAULTS.max_agents));
                setDepth(String(DEFAULTS.max_depth));
                if (allowed) setAllowed(DEFAULTS.allowed_profiles);
                if (resumes !== undefined) setResumes(false);
                if (stall !== undefined)
                  setStall(String(DEFAULTS.stall_check_minutes));
                if (reviews !== undefined)
                  setReviews(String(DEFAULTS.manager_check_accepted_reviews));
                if (escalations !== undefined)
                  setEscalations(String(DEFAULTS.manager_check_ic_escalations));
              }}
            >
              {t(I18nKey.ORG_CHART$SETTINGS_RESET)}
            </BrandButton>
            <BrandButton
              type="button"
              variant="secondary"
              isDisabled={save.isPending}
              onClick={onClose}
            >
              {t(I18nKey.BUTTON$CANCEL)}
            </BrandButton>
            <BrandButton
              type="submit"
              variant="primary"
              isDisabled={!valid || save.isPending}
            >
              {t(
                save.isPending ? I18nKey.SETTINGS$SAVING : I18nKey.BUTTON$SAVE,
              )}
            </BrandButton>
          </div>
        </form>
      </ModalBody>
    </ModalBackdrop>
  );
}

/**
 * The limits on the teams the org may still add. Nothing is shown for a
 * server that has no such settings.
 */
export function OrgSettings() {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const [isOpen, setIsOpen] = React.useState(false);
  const settings = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.settings(backend.id),
    queryFn: () => DirectorClient.getSettings(),
    retry: false,
    meta: { disableToast: true },
  });
  if (!settings.data) return null;

  return (
    <>
      <button
        type="button"
        aria-label={t(I18nKey.ORG_CHART$SETTINGS)}
        title={t(I18nKey.ORG_CHART$SETTINGS)}
        onClick={() => {
          // The counts in the form are of now.
          settings.refetch();
          setIsOpen(true);
        }}
        className="flex size-8 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-surface-raised hover:text-contrast"
      >
        <Settings width={14} height={14} aria-hidden="true" />
      </button>
      {isOpen ? (
        <SettingsForm
          key={[
            settings.data.max_agents,
            settings.data.max_depth,
            ...(settings.data.allowed_profiles ?? []),
            settings.data.resume_on_start,
            settings.data.stall_check_minutes,
            settings.data.manager_check_accepted_reviews,
            settings.data.manager_check_ic_escalations,
          ].join(":")}
          state={settings.data}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  );
}
