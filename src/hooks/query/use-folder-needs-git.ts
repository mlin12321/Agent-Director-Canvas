import { useQuery } from "@tanstack/react-query";
import {
  gitRootAbove,
  isGitRepository,
  isGitRoot,
} from "#/api/director/prepare-folder";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { DIRECTOR_QUERY_KEYS } from "./query-keys";

/**
 * Whether a folder on the server still has to become a git repository before
 * an org can start in it. False until the server has answered, and when it
 * cannot be asked.
 */
export function useFolderNeedsGit(folder: string | null): boolean {
  const { backend } = useActiveBackend();
  const { data } = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.folderIsGit(backend.id, folder ?? ""),
    queryFn: () => isGitRepository(folder ?? ""),
    enabled: folder !== null,
    retry: false,
    staleTime: 0,
  });
  return data === false;
}

/**
 * Whether a folder on the server has its own `.git`. Null until the server
 * has answered, and when it cannot be asked.
 */
export function useFolderGitRoot(folder: string | null): boolean | null {
  const { backend } = useActiveBackend();
  const { data, isSuccess } = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.folderGitRoot(backend.id, folder ?? ""),
    queryFn: () => isGitRoot(folder ?? ""),
    enabled: folder !== null,
    retry: false,
    staleTime: 0,
  });
  return isSuccess ? data : null;
}

/**
 * The checkout above a folder that has no `.git` of its own. Undefined until
 * the server has answered, null when there is none, and undefined when it
 * cannot be asked.
 */
export function useGitRootAbove(
  folder: string | null,
): string | null | undefined {
  const { backend } = useActiveBackend();
  const { data, isSuccess, isError } = useQuery({
    queryKey: DIRECTOR_QUERY_KEYS.folderGitAbove(backend.id, folder ?? ""),
    queryFn: () => gitRootAbove(folder ?? ""),
    enabled: folder !== null,
    retry: false,
    staleTime: 0,
  });
  if (folder === null) return undefined;
  if (isSuccess) return data ?? null;
  if (isError) return null;
  return undefined;
}
