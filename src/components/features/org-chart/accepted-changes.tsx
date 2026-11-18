import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DirectorClient } from "#/api/director/director-client";
import type { ChangedFile } from "#/api/director/types";
import type { GitChangeStatus } from "#/api/open-hands.types";
import { FileDiffView } from "#/components/features/diff-viewer/file-diff-view";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";
import { I18nKey } from "#/i18n/declaration";

const STATUS: Record<ChangedFile["kind"], GitChangeStatus> = {
  added: "A",
  modified: "M",
  deleted: "D",
};

/** The two commits an accept took a team's work between, and its folder. */
export interface Accepted {
  base: string;
  head: string;
  path: string;
}

function AcceptedFileRow({
  accepted,
  file,
  isExpanded,
  onToggle,
}: {
  accepted: Accepted;
  file: ChangedFile;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const sides = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.acceptedFile(
      backend.id,
      accepted.base,
      accepted.head,
      file.path,
    ),
    queryFn: () =>
      DirectorClient.getAcceptedFile(accepted.base, accepted.head, file.path),
    enabled: isExpanded,
    // Two commits never differ in another way later.
    staleTime: Infinity,
    retry: false,
    meta: { disableToast: true },
  });
  const unreadable = sides.data?.unreadable ?? false;

  return (
    <div data-testid="accepted-file" className="flex flex-col">
      <FileDiffView
        filePath={file.path}
        type={STATUS[file.kind]}
        diff={
          sides.data && !unreadable
            ? {
                original: sides.data.before ?? "",
                modified: sides.data.after ?? "",
              }
            : undefined
        }
        isFetching={sides.isFetching}
        isReady={sides.isSuccess && !unreadable}
        isExpanded={isExpanded}
        onToggle={onToggle}
        showDeletedMessage={file.kind === "deleted"}
      />
      {isExpanded && unreadable ? (
        <p className="border-b border-border p-3 text-xs text-muted">
          {t(I18nKey.ORG_CHART$CHANGES_UNREADABLE)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * What an accept in the history took: the files that differ in the team's
 * folder between its two commits, one open at a time. It is read from the
 * repository, so it is there after the session is closed.
 */
export function AcceptedChanges({ accepted }: { accepted: Accepted }) {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const changes = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.accepted(
      backend.id,
      accepted.base,
      accepted.head,
      accepted.path,
    ),
    queryFn: () =>
      DirectorClient.getAcceptedChanges(
        accepted.base,
        accepted.head,
        accepted.path,
      ),
    staleTime: Infinity,
    retry: false,
    meta: { disableToast: true },
  });
  const [expandedPath, setExpandedPath] = React.useState<string | null>(null);
  const files = changes.data?.files ?? [];

  return (
    <div
      data-testid="accepted-changes"
      className="flex w-full flex-col rounded-md border border-border"
    >
      {changes.isError ? (
        <p role="alert" className="p-2 text-xs text-feedback-error">
          {t(I18nKey.ORG_CHART$ACCEPTED_ERROR)}
        </p>
      ) : null}
      {changes.isSuccess && files.length === 0 ? (
        <p className="p-2 text-xs text-muted">
          {t(I18nKey.ORG_CHART$ACCEPTED_NONE)}
        </p>
      ) : null}
      {files.map((file) => (
        <AcceptedFileRow
          key={file.path}
          accepted={accepted}
          file={file}
          isExpanded={expandedPath === file.path}
          onToggle={() =>
            setExpandedPath((open) => (open === file.path ? null : file.path))
          }
        />
      ))}
      {changes.data?.truncated ? (
        <p className="p-2 text-xs text-muted">
          {t(I18nKey.ORG_CHART$CHANGES_TRUNCATED)}
        </p>
      ) : null}
    </div>
  );
}
