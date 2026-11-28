import React from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DirectorClient } from "#/api/director/director-client";
import { NavigationLink } from "#/components/shared/navigation-link";
import { useImportAutomation } from "#/hooks/query/use-automations";
import { I18nKey } from "#/i18n/declaration";

const INPUT =
  "rounded-md border border-border bg-transparent px-2 py-1 text-contrast";

/**
 * Adds the director's own script automation to the automation service, for
 * the events of one webhook source: a ticket filed, an alert. Each run sends
 * the event to the org, which opens a session at the team it concerns.
 */
export function EventSessionsAutomation() {
  const { t } = useTranslation("openhands");
  const [source, setSource] = React.useState("");
  const [on, setOn] = React.useState("");
  const { mutateAsync: importAutomation } = useImportAutomation();
  const add = useMutation({
    mutationFn: async () => {
      const script = await DirectorClient.getOpenSessionAutomation();
      return importAutomation({
        name: script.name,
        trigger: { type: "event", source: source.trim(), on: on.trim() },
        enabled: false,
        prompt: null,
        script: {
          entrypoint: script.entrypoint,
          tarball_base64: script.tarball_base64,
        },
      });
    },
    meta: { disableToast: true },
  });

  return (
    <fieldset
      data-testid="event-sessions-automation"
      className="flex flex-col gap-2 text-sm"
    >
      <legend className="mb-2">{t(I18nKey.ORG_CHART$EVENT_AUTOMATION)}</legend>
      <span className="text-xs text-muted">
        {t(I18nKey.ORG_CHART$EVENT_AUTOMATION_HELP)}
      </span>
      <label className="flex flex-col gap-1">
        {t(I18nKey.ORG_CHART$EVENT_AUTOMATION_SOURCE)}
        <input
          value={source}
          disabled={add.isPending}
          onChange={(event) => setSource(event.target.value)}
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-1">
        {t(I18nKey.ORG_CHART$EVENT_AUTOMATION_ON)}
        <input
          value={on}
          disabled={add.isPending}
          onChange={(event) => setOn(event.target.value)}
          className={INPUT}
        />
      </label>
      <button
        type="button"
        onClick={() => add.mutate()}
        disabled={add.isPending || !source.trim() || !on.trim()}
        className="self-start rounded-md border border-border px-2 py-1 text-contrast hover:bg-surface-raised disabled:opacity-40"
      >
        {t(I18nKey.ORG_CHART$EVENT_AUTOMATION_ADD)}
      </button>
      {add.isSuccess ? (
        <p role="status" className="text-xs">
          <NavigationLink
            to={`/automations/${add.data.id}`}
            className="text-contrast hover:text-link hover:underline"
          >
            {t(I18nKey.ORG_CHART$EVENT_AUTOMATION_ADDED)}
          </NavigationLink>
        </p>
      ) : null}
      {add.isError ? (
        <p role="alert" className="text-xs text-feedback-error">
          {t(I18nKey.ORG_CHART$EVENT_AUTOMATION_ERROR)}
        </p>
      ) : null}
    </fieldset>
  );
}
