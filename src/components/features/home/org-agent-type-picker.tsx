import React from "react";
import { Network } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ContextMenuListItem } from "#/components/features/context-menu/context-menu-list-item";
import type { OrgStartChoices } from "#/hooks/query/use-org-start-choices";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import CheckIcon from "#/icons/checkmark.svg?react";
import { I18nKey } from "#/i18n/declaration";
import { ComboboxCaretInline } from "#/ui/combobox-caret";
import { ContextMenu } from "#/ui/context-menu";
import { Divider } from "#/ui/divider";
import { Typography } from "#/ui/typography";
import { chatInputPillButtonClassName } from "#/utils/form-control-classes";
import { cn } from "#/utils/utils";

/**
 * What a first message is offered to: nothing (an ordinary conversation, as
 * on a server without a director), or the org, with the agent type of the
 * top team of the org it starts (`null`: the server's default type).
 */
export type OrgChoice =
  { org: false } | { org: true; agentType: string | null };

interface OrgAgentTypePickerProps {
  choices: OrgStartChoices;
  value: OrgChoice;
  onChange: (value: OrgChoice) => void;
  disabled?: boolean;
}

interface Row {
  id: string;
  label: string;
  detail: string;
  choice: OrgChoice;
}

/**
 * Whether a first message goes to the org and, where it starts one, the
 * agent type of its top team. A pill beside the agent profile's, and made
 * like it.
 */
export function OrgAgentTypePicker({
  choices,
  value,
  onChange,
  disabled = false,
}: OrgAgentTypePickerProps) {
  const { t } = useTranslation("openhands");
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = useClickOutsideElement<HTMLUListElement>(
    () => setIsOpen(false),
    triggerRef,
  );

  const none: Row = {
    id: "none",
    label: t(I18nKey.HOME$ORG_CHOICE_NONE),
    detail: t(I18nKey.HOME$ORG_CHOICE_NONE_HELP),
    choice: { org: false },
  };
  const rows: Row[] = choices.hasOrg
    ? [
        {
          id: "org",
          label: t(I18nKey.HOME$ORG_CHOICE_ORG),
          detail: t(I18nKey.HOME$ORG_CHOICE_ORG_HELP),
          choice: { org: true, agentType: null },
        },
      ]
    : [
        {
          id: "default",
          label: t(I18nKey.HOME$ORG_AGENT_TYPE_DEFAULT, {
            name: choices.defaultType.name,
          }),
          detail: choices.defaultType.description,
          choice: { org: true, agentType: null },
        },
        ...choices.others.map((type) => ({
          id: `type-${type.name}`,
          label: type.name,
          detail: type.description,
          choice: { org: true, agentType: type.name } as const,
        })),
      ];
  const isCurrent = (row: Row) =>
    row.choice.org === value.org &&
    (!row.choice.org || !value.org || row.choice.agentType === value.agentType);
  let label = none.label;
  if (value.org) {
    label = choices.hasOrg
      ? t(I18nKey.HOME$ORG_CHOICE_ORG)
      : (value.agentType ?? choices.defaultType.name);
  }
  const title = t(I18nKey.HOME$ORG_CHOICE_TITLE);

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        className={cn(chatInputPillButtonClassName, "max-w-40")}
        title={title}
        aria-label={`${title}: ${label}`}
        data-testid="org-agent-type-picker"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen((open) => !open);
        }}
      >
        <Network width={14} height={14} className="shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        <ComboboxCaretInline isOpen={isOpen} />
      </button>
      {isOpen && (
        <ContextMenu
          ref={popoverRef}
          testId="org-agent-type-popover"
          position="top"
          alignment="left"
          spacing="none"
          className="z-60 mb-2 min-w-50 max-w-80 profile-menu-height overflow-y-auto"
        >
          <li role="presentation" className="px-2 pt-1 pb-0.5">
            <Typography.Text className="menu-caption-text font-medium text-text-dim uppercase tracking-wide leading-4">
              {choices.hasOrg ? title : t(I18nKey.HOME$ORG_AGENT_TYPE)}
            </Typography.Text>
          </li>
          {[...rows, none].map((row) => (
            <React.Fragment key={row.id}>
              {row === none && <Divider />}
              <ContextMenuListItem
                testId={`org-agent-type-option-${row.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange(row.choice);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 text-wrap",
                  isCurrent(row) && "bg-interactive-hover",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm leading-5">
                    {row.label}
                  </span>
                  {row.detail && (
                    <Typography.Text className="menu-caption-text text-text-dim leading-4">
                      {row.detail}
                    </Typography.Text>
                  )}
                </span>
                {isCurrent(row) && (
                  <CheckIcon
                    width={14}
                    height={14}
                    className="shrink-0"
                    aria-hidden
                  />
                )}
              </ContextMenuListItem>
            </React.Fragment>
          ))}
          {!choices.hasOrg && (
            <li role="presentation" className="px-2 pt-0.5 pb-1">
              <Typography.Text className="menu-caption-text text-text-dim leading-4">
                {t(I18nKey.HOME$ORG_AGENT_TYPE_HELP)}
              </Typography.Text>
            </li>
          )}
        </ContextMenu>
      )}
    </div>
  );
}
