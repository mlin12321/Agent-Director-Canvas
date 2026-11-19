import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DirectorClient, refusalOf } from "#/api/director/director-client";
import type { DirectorSettingsState } from "#/api/director/types";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { Tooltip } from "#/components/shared/tooltip";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  ModalBody,
} from "#/components/shared/modals/modal-body";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";
import { useAgentProfiles } from "#/hooks/query/use-agent-profiles";
import { I18nKey } from "#/i18n/declaration";

const DEFAULTS = {
  max_teams: 32,
  max_depth: 8,
  allowed_profiles: [],
  stall_check_minutes: 120,
  manager_check_accepted_reviews: 5,
  manager_check_ic_setbacks: 3,
  route_requests: true,
  report_compaction_chars: 24_000,
  session_cost_limit: 0,
  max_open_sessions: 0,
};
// The least the director takes for the length reports are kept at.
const LEAST_COMPACTION = 1000;
const INPUT = "rounded-md border border-border bg-canvas-base px-3 py-2";

function whole(text: string, least: number) {
  const value = Number(text);
  return text.trim() !== "" && Number.isInteger(value) && value >= least;
}

/** An amount of money: any number from 0. */
function amount(text: string) {
  const value = Number(text);
  return text.trim() !== "" && Number.isFinite(value) && value >= 0;
}

function CountField({
  label,
  help,
  value,
  disabled,
  onChange,
  least = 0,
  step = 1,
}: {
  label: string;
  help: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  least?: number;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      {label}
      <input
        type="number"
        min={least}
        step={step}
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
  const sizeId = React.useId();
  const infoId = React.useId();
  const [size, setSize] = React.useState(String(state.max_teams));
  const [depth, setDepth] = React.useState(String(state.max_depth));
  const [allowed, setAllowed] = React.useState(state.allowed_profiles);
  const [resumes, setResumes] = React.useState(state.resume_on_start);
  const [routes, setRoutes] = React.useState(state.route_requests);
  // 0 turns a check off.
  const [stall, setStall] = React.useState(String(state.stall_check_minutes));
  const [reviews, setReviews] = React.useState(
    String(state.manager_check_accepted_reviews),
  );
  const [setbacks, setSetbacks] = React.useState(
    String(state.manager_check_ic_setbacks),
  );
  // 0: no limit.
  const [cost, setCost] = React.useState(String(state.session_cost_limit));
  const [most, setMost] = React.useState(String(state.max_open_sessions));
  const [compaction, setCompaction] = React.useState(
    String(state.report_compaction_chars),
  );
  const profiles = useAgentProfiles().data;
  // A profile that was allowed and has since been deleted can still be
  // unticked.
  const names = [
    ...new Set([
      ...(profiles?.profiles.map((profile) => profile.name) ?? []),
      ...allowed,
    ]),
  ];
  const save = useMutation({
    mutationFn: () =>
      DirectorClient.updateSettings({
        max_teams: Number(size),
        max_depth: Number(depth),
        allowed_profiles: allowed,
        resume_on_start: resumes,
        stall_check_minutes: Number(stall),
        manager_check_accepted_reviews: Number(reviews),
        manager_check_ic_setbacks: Number(setbacks),
        route_requests: routes,
        session_cost_limit: Number(cost),
        max_open_sessions: Number(most),
        report_compaction_chars: Number(compaction),
      }),
    // The backend asked, which may no longer be the active one.
    onMutate: () => ({ asked: backend.id }),
    onSuccess: (saved, _, { asked }) => {
      queryClient.setQueryData(DIRECTOR_QUERY_KEYS.settings(asked), saved);
      onClose();
    },
    meta: { disableToast: true },
  });
  const valid =
    whole(size, 1) &&
    whole(depth, 1) &&
    whole(compaction, LEAST_COMPACTION) &&
    amount(cost) &&
    [stall, reviews, setbacks, most].every((count) => whole(count, 0));

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
          <div className="flex flex-col gap-2 text-sm">
            {/* The mark sits beside the label, not in it, so that the
                label names the field alone. */}
            <span className="flex items-center gap-1.5">
              <label htmlFor={sizeId}>
                {t(I18nKey.ORG_CHART$SETTINGS_MAX_TEAMS)}
              </label>
              <Tooltip
                content={t(I18nKey.ORG_CHART$SETTINGS_TEAMS_INFO)}
                placement="top"
                classNames={{ content: "max-w-xs break-normal" }}
              >
                <button
                  type="button"
                  data-testid="org-settings-teams-info"
                  aria-label={t(I18nKey.ORG_CHART$SETTINGS_TEAMS_INFO_LABEL)}
                  aria-describedby={infoId}
                  className="flex text-muted hover:text-contrast"
                >
                  <Info width={14} height={14} aria-hidden="true" />
                  <span id={infoId} className="sr-only">
                    {t(I18nKey.ORG_CHART$SETTINGS_TEAMS_INFO)}
                  </span>
                </button>
              </Tooltip>
            </span>
            <input
              id={sizeId}
              type="number"
              min={1}
              step={1}
              required
              value={size}
              disabled={save.isPending}
              onChange={(event) => setSize(event.target.value)}
              className={INPUT}
            />
            <span className="text-xs text-muted">
              {t(I18nKey.ORG_CHART$SETTINGS_TEAMS_NOW, { count: state.teams })}
            </span>
          </div>
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
          {names.length > 0 ? (
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
          <label className="flex flex-col gap-2 text-sm">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={routes}
                disabled={save.isPending}
                onChange={(event) => setRoutes(event.target.checked)}
              />
              {t(I18nKey.ORG_CHART$SETTINGS_ROUTE_REQUESTS)}
            </span>
            <span className="text-xs text-muted">
              {t(I18nKey.ORG_CHART$SETTINGS_ROUTE_REQUESTS_HELP)}
            </span>
          </label>
          <CountField
            label={t(I18nKey.ORG_CHART$SETTINGS_STALL_MINUTES)}
            help={t(I18nKey.ORG_CHART$SETTINGS_STALL_MINUTES_HELP)}
            value={stall}
            disabled={save.isPending}
            onChange={setStall}
          />
          <CountField
            label={t(I18nKey.ORG_CHART$SETTINGS_MANAGER_REVIEWS)}
            help={t(I18nKey.ORG_CHART$SETTINGS_MANAGER_CHECK_HELP)}
            value={reviews}
            disabled={save.isPending}
            onChange={setReviews}
          />
          <CountField
            label={t(I18nKey.ORG_CHART$SETTINGS_MANAGER_ESCALATIONS)}
            help={t(I18nKey.ORG_CHART$SETTINGS_MANAGER_CHECK_HELP)}
            value={setbacks}
            disabled={save.isPending}
            onChange={setSetbacks}
          />
          <CountField
            label={t(I18nKey.ORG_CHART$SETTINGS_SESSION_COST)}
            help={t(I18nKey.ORG_CHART$SETTINGS_SESSION_COST_HELP)}
            value={cost}
            disabled={save.isPending}
            onChange={setCost}
            step={0.01}
          />
          <CountField
            label={t(I18nKey.ORG_CHART$SETTINGS_MAX_SESSIONS)}
            help={t(I18nKey.ORG_CHART$SETTINGS_MAX_SESSIONS_HELP)}
            value={most}
            disabled={save.isPending}
            onChange={setMost}
          />
          <CountField
            label={t(I18nKey.ORG_CHART$SETTINGS_COMPACTION)}
            help={t(I18nKey.ORG_CHART$SETTINGS_COMPACTION_HELP)}
            value={compaction}
            disabled={save.isPending}
            onChange={setCompaction}
            least={LEAST_COMPACTION}
          />
          {state.max_concurrent_runs !== null ? (
            <p className="text-xs text-muted">
              {t(I18nKey.ORG_CHART$SETTINGS_RUNS, {
                count: state.max_concurrent_runs,
              })}
            </p>
          ) : null}
          {save.isError ? (
            <p role="alert" className="text-sm text-danger">
              {refusalOf(save.error) ??
                t(I18nKey.ORG_CHART$SETTINGS_SAVE_ERROR)}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <BrandButton
              type="button"
              variant="secondary"
              isDisabled={save.isPending}
              onClick={() => {
                setSize(String(DEFAULTS.max_teams));
                setDepth(String(DEFAULTS.max_depth));
                setAllowed(DEFAULTS.allowed_profiles);
                setResumes(false);
                setRoutes(DEFAULTS.route_requests);
                setStall(String(DEFAULTS.stall_check_minutes));
                setReviews(String(DEFAULTS.manager_check_accepted_reviews));
                setSetbacks(String(DEFAULTS.manager_check_ic_setbacks));
                setCost(String(DEFAULTS.session_cost_limit));
                setMost(String(DEFAULTS.max_open_sessions));
                setCompaction(String(DEFAULTS.report_compaction_chars));
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

/** The limits on the teams the org may still add. */
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
  if (settings.isError && !settings.data) {
    // Without them there is no form to open: say so, and ask again.
    return (
      <button
        type="button"
        data-testid="org-settings-retry"
        aria-label={t(I18nKey.ORG_CHART$SETTINGS_LOAD_FAILED)}
        title={t(I18nKey.ORG_CHART$SETTINGS_LOAD_FAILED)}
        onClick={() => settings.refetch()}
        className="flex size-8 items-center justify-center rounded-lg border border-feedback-error text-feedback-error hover:bg-surface-raised"
      >
        <Settings width={14} height={14} aria-hidden="true" />
      </button>
    );
  }
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
          // Anew when what it edits was changed elsewhere, not with every
          // team the org gains: that would throw away what is being typed.
          key={JSON.stringify({
            ...settings.data,
            teams: 0,
            depth: 0,
            max_concurrent_runs: 0,
          })}
          state={settings.data}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  );
}
