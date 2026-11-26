import { useTranslation } from "react-i18next";
import type { OrgNode, TeamDocument } from "#/api/director/types";
import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";
import { useTeamMemory } from "#/hooks/query/use-team-memory";
import { I18nKey } from "#/i18n/declaration";

function Document({
  title,
  text,
  note,
}: {
  title: string;
  text: string;
  note?: string;
}) {
  return (
    <details className="rounded-md border border-border">
      <summary className="cursor-pointer px-2 py-1 text-xs text-contrast">
        {title}
      </summary>
      {note ? (
        <p className="border-t border-border px-2 py-1 text-xs text-muted">
          {note}
        </p>
      ) : null}
      <div className="max-h-64 overflow-auto border-t border-border px-2 py-1 text-xs text-text-secondary">
        <MarkdownRenderer includeStandard>{text}</MarkdownRenderer>
      </div>
    </details>
  );
}

/** A document's name as a heading: "design-notes" reads "Design notes". */
function named(name: string) {
  const words = name.replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface TeamDocumentsProps {
  node: OrgNode;
}

/**
 * What a team works to, for reading: every document it reads, whatever
 * the org calls them. Each opens on demand.
 */
export function TeamDocuments({ node }: TeamDocumentsProps) {
  const { t } = useTranslation("openhands");
  const memory = useTeamMemory(node.id);
  if (!memory.data) return null;
  const { documents = [] } = memory.data;

  const titleOf = (document: TeamDocument) => {
    const name = named(document.name);
    if (document.left) {
      // One a team before left says how that team worked.
      return document.left_by
        ? t(I18nKey.ORG_CHART$DOCUMENT_LEFT, { name, team: document.left_by })
        : t(I18nKey.ORG_CHART$DOCUMENT_LEFT_UNKNOWN, { name });
    }
    return document.own ? name : t(I18nKey.ORG_CHART$DOCUMENT_ABOVE, { name });
  };

  return (
    <section
      aria-label={t(I18nKey.ORG_CHART$DOCUMENTS_TITLE)}
      className="flex flex-col gap-1.5"
    >
      <h3 className="text-sm font-medium text-contrast">
        {t(I18nKey.ORG_CHART$DOCUMENTS_TITLE)}
      </h3>
      {documents.length === 0 ? (
        <p className="text-xs text-muted">
          {t(I18nKey.ORG_CHART$DOCUMENTS_EMPTY)}
        </p>
      ) : (
        documents.map((document) => (
          <Document
            key={`${document.name}:${document.path}:${document.left === true}`}
            title={titleOf(document)}
            text={document.text}
            note={
              document.left
                ? t(I18nKey.ORG_CHART$DOCUMENT_LEFT_HELP)
                : document.description || undefined
            }
          />
        ))
      )}
    </section>
  );
}
