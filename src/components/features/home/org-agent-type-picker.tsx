import { useTranslation } from "react-i18next";
import type { OrgStartingAgentTypes } from "#/hooks/query/use-org-starting-agent-types";
import { I18nKey } from "#/i18n/declaration";

interface OrgAgentTypePickerProps {
  types: OrgStartingAgentTypes;
  /** The type picked; `null` for the server's default. */
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

/**
 * The agent type of the top team of the org a first message starts. Left
 * alone, the org starts with the server's default type.
 */
export function OrgAgentTypePicker({
  types,
  value,
  onChange,
  disabled = false,
}: OrgAgentTypePickerProps) {
  const { t } = useTranslation("openhands");
  const label = t(I18nKey.HOME$ORG_AGENT_TYPE);
  const picked = types.others.find((type) => type.name === value);

  return (
    <select
      data-testid="org-agent-type-picker"
      aria-label={label}
      title={[label, picked?.description, t(I18nKey.HOME$ORG_AGENT_TYPE_HELP)]
        .filter(Boolean)
        .join("\n")}
      value={picked?.name ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
      className="max-w-48 truncate rounded-lg border border-border bg-surface px-2 py-1 text-sm text-contrast disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="">
        {t(I18nKey.HOME$ORG_AGENT_TYPE_DEFAULT, { name: types.defaultType })}
      </option>
      {types.others.map((type) => (
        <option key={type.name} value={type.name} title={type.description}>
          {type.name}
        </option>
      ))}
    </select>
  );
}
