import { useQuery } from "@tanstack/react-query";
import { isGitRepository } from "#/api/director/prepare-folder";
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
