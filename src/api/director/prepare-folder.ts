import { BashClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "../agent-server-client-options";

/**
 * What makes a plain folder one an org can start in: a git repository with
 * a first commit of what the folder holds.
 */
export const DEFAULT_PREPARE_COMMAND =
  'git init -b main && git add -A && git commit --allow-empty -m "Initial commit"';

const CHECK_TIMEOUT_SECONDS = 15;
const PREPARE_TIMEOUT_SECONDS = 120;

function run(folder: string, command: string, timeout: number) {
  return new BashClient(getAgentServerClientOptions()).executeCommand({
    command,
    cwd: folder,
    timeout,
  });
}

/** Whether a folder on the server is in a git repository. */
export async function isGitRepository(folder: string): Promise<boolean> {
  const out = await run(
    folder,
    "git rev-parse --is-inside-work-tree",
    CHECK_TIMEOUT_SECONDS,
  );
  return out.exit_code === 0;
}

/** Whether `.git` is in this folder, not in a repository above it. */
export async function isGitRoot(folder: string): Promise<boolean> {
  const out = await run(folder, "test -e .git", CHECK_TIMEOUT_SECONDS);
  return out.exit_code === 0;
}

/**
 * The checkout above this folder, when this folder has no `.git` of its own
 * and one does. Null when this folder is the checkout, or is in none.
 */
export async function gitRootAbove(folder: string): Promise<string | null> {
  const out = await run(
    folder,
    'root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 1; [ "$(realpath "$root")" = "$(realpath .)" ] && exit 2; printf "%s\\n" "$root"',
    CHECK_TIMEOUT_SECONDS,
  );
  if (out.exit_code !== 0) return null;
  const root = (out.stdout ?? "").trim();
  return root || null;
}

/**
 * Run the human's command in a folder on the server before a conversation
 * starts there.
 *
 * @throws With what the command printed, when it fails.
 */
export async function prepareFolder(
  folder: string,
  command: string,
): Promise<void> {
  const out = await run(folder, command, PREPARE_TIMEOUT_SECONDS);
  if (out.exit_code === 0) return;
  const said = (out.stderr || out.stdout || "").trim();
  throw new Error(said || `exit ${out.exit_code}`);
}
