import { X } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

interface PrepareFolderCommandProps {
  command: string;
  onChange: (command: string) => void;
  onRemove: () => void;
}

/**
 * The command that is run in the chosen folder before the first message
 * starts an org there. It can be changed, and removed to start an ordinary
 * conversation instead.
 */
export function PrepareFolderCommand({
  command,
  onChange,
  onRemove,
}: PrepareFolderCommandProps) {
  const { t } = useTranslation("openhands");
  const inputId = useId();
  const helpId = useId();

  return (
    <div data-testid="prepare-folder-command" className="flex flex-col gap-1">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5">
        <label
          htmlFor={inputId}
          className="shrink-0 text-xs text-text-secondary"
        >
          {t(I18nKey.HOME$PREPARE_FOLDER_LABEL)}
        </label>
        <input
          id={inputId}
          type="text"
          value={command}
          spellCheck={false}
          aria-describedby={helpId}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-contrast outline-none"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={t(I18nKey.HOME$PREPARE_FOLDER_REMOVE)}
          title={t(I18nKey.HOME$PREPARE_FOLDER_REMOVE)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-raised hover:text-contrast"
        >
          <X width={14} height={14} aria-hidden="true" />
        </button>
      </div>
      <p id={helpId} className="text-xs text-text-secondary">
        {t(I18nKey.HOME$PREPARE_FOLDER_HELP)}
      </p>
    </div>
  );
}
