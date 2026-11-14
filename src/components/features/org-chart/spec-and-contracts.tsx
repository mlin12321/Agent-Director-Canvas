import { useTranslation } from "react-i18next";
import type { OrgNode } from "#/api/director/types";
import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";
import { useNodeMemory } from "#/hooks/query/use-node-memory";
import { I18nKey } from "#/i18n/declaration";

function Document({ title, text }: { title: string; text: string }) {
  return (
    <details className="rounded-md border border-border">
      <summary className="cursor-pointer px-2 py-1 text-xs text-contrast">
        {title}
      </summary>
      <div className="max-h-64 overflow-auto border-t border-border px-2 py-1 text-xs text-text-secondary">
        <MarkdownRenderer includeStandard>{text}</MarkdownRenderer>
      </div>
    </details>
  );
}

interface SpecAndContractsProps {
  node: OrgNode;
}

/**
 * What a team works to, for reading: the spec its IC wrote and the
 * contracts it keeps. Each opens on demand.
 */
export function SpecAndContracts({ node }: SpecAndContractsProps) {
  const { t } = useTranslation("openhands");
  const memory = useNodeMemory(node.id);
  if (!memory.data) return null;
  const { specs, contracts = [] } = memory.data;

  return (
    <section
      aria-label={t(I18nKey.ORG_CHART$SPEC_TITLE)}
      className="flex flex-col gap-1.5"
    >
      <h3 className="text-sm font-medium text-contrast">
        {t(I18nKey.ORG_CHART$SPEC_TITLE)}
      </h3>
      {specs.length === 0 ? (
        <p className="text-xs text-muted">{t(I18nKey.ORG_CHART$SPEC_EMPTY)}</p>
      ) : (
        specs.map((spec) => (
          <Document
            key={spec.path}
            title={t(I18nKey.ORG_CHART$SPEC_OPEN)}
            text={spec.spec}
          />
        ))
      )}
      {contracts.map((agreed) => (
        <Document
          key={`${agreed.path}:${agreed.own}`}
          title={t(
            agreed.own
              ? I18nKey.ORG_CHART$CONTRACTS_OWN
              : I18nKey.ORG_CHART$CONTRACTS_ABOVE,
          )}
          text={agreed.contracts}
        />
      ))}
    </section>
  );
}
