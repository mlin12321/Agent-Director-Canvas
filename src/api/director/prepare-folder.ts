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
