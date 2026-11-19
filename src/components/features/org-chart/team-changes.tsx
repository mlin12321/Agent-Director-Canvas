import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DirectorClient, DirectorError } from "#/api/director/director-client";
import type { ChangedFile, SessionTeam } from "#/api/director/types";
import type { GitChangeStatus } from "#/api/open-hands.types";
import { FileDiffView } from "#/components/features/diff-viewer/file-diff-view";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "#/hooks/query/query-keys";
import { I18nKey } from "#/i18n/declaration";

/** Agents change files without the org tree saying so. */
const REFRESH_MS = 5_000;

const STATUS: Record<ChangedFile["kind"], GitChangeStatus> = {
  added: "A",
  modified: "M",
  deleted: "D",
};

/** The files a team changed since its base commit, asked again as it works. */
function useTeamChanges(node: SessionTeam) {
  const { backend } = useActiveBackend();
  return useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.changes(backend.id, node.id),
    queryFn: () => DirectorClient.getNodeChanges(node.id),
    refetchInterval: REFRESH_MS,
    retry: false,
    meta: { disableToast: true },
  });
}

function ChangedFileRow({
  node,
  file,
  isExpanded,
  onToggle,
}: {
  node: SessionTeam;
  file: ChangedFile;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const queryClient = useQueryClient();
  const sides = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.changedFile(backend.id, node.id, file.path),
    queryFn: () => DirectorClient.getNodeChangedFile(node.id, file.path),
    enabled: isExpanded,
    retry: false,
    meta: { disableToast: true },
  });
  const save = useMutation({
    mutationFn: (content: string) =>
      DirectorClient.editNodeFile(node.id, file.path, content),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: DIRECTOR_QUERY_KEYS.changes(backend.id, node.id),
      }),
    meta: { disableToast: true },
  });

  const unreadable = sides.data?.unreadable ?? false;
  let saveError: string | null = null;
  if (save.isError) {
    saveError =
      save.error instanceof DirectorError && save.error.status !== null
        ? save.error.message
        : t(I18nKey.ORG_CHART$CHANGES_SAVE_ERROR);
  }

  return (
    <div data-testid="team-changed-file" className="flex flex-col">
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
        note={
          file.committed ? undefined : t(I18nKey.ORG_CHART$CHANGES_UNCOMMITTED)
        }
        edit={
          file.kind === "deleted"
            ? undefined
            : {
                save: (content) => save.mutateAsync(content),
                isSaving: save.isPending,
                error: saveError,
                latest: () =>
                  sides.refetch().then((read) => read.data?.after ?? undefined),
              }
        }
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
 * What a team changed in its folder against where its work started, one
 * file open at a time, with the new side editable by hand.
 */
export function TeamChanges({ node }: { node: SessionTeam }) {
  const { t } = useTranslation("openhands");
  const changes = useTeamChanges(node);
  const [expandedPath, setExpandedPath] = React.useState<string | null>(null);
  const files = changes.data?.files ?? [];

  return (
    <div
      data-testid="team-changes"
      className="flex h-full flex-col overflow-y-auto"
    >
      <p className="border-b border-border px-3 py-1.5 text-xs text-muted">
        {t(I18nKey.ORG_CHART$CHANGES_HINT)}
      </p>
      {changes.isError ? (
        <p role="alert" className="p-3 text-sm text-feedback-error">
          {changes.error instanceof DirectorError &&
          changes.error.status === 404
            ? changes.error.message
            : t(I18nKey.ORG_CHART$CHANGES_ERROR)}
        </p>
      ) : null}
      {changes.isSuccess && files.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted">
          {t(I18nKey.ORG_CHART$CHANGES_NONE)}
        </p>
      ) : null}
      {files.map((file) => (
        <ChangedFileRow
          key={file.path}
          node={node}
          file={file}
          isExpanded={expandedPath === file.path}
          onToggle={() =>
            setExpandedPath((open) => (open === file.path ? null : file.path))
          }
        />
      ))}
      {changes.data?.truncated ? (
        <p className="p-3 text-xs text-muted">
          {t(I18nKey.ORG_CHART$CHANGES_TRUNCATED)}
        </p>
      ) : null}
    </div>
  );
}
