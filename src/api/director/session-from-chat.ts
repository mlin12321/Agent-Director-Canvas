import { SESSION_COMMAND } from "#/utils/constants";

/**
 * What a chat message asks a new session to do.
 *
 * `/session <request>` has the request worked on in a session of its own:
 * the director chooses the team, which gets one more IC for it in a git
 * worktree of its own, beside what the team is doing.
 *
 * @returns The request, `""` when the command names none, and `null` when
 * the message is not the command.
 */
export function sessionRequestOf(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed !== SESSION_COMMAND && !trimmed.startsWith(`${SESSION_COMMAND} `))
    return null;
  return trimmed.slice(SESSION_COMMAND.length).trim();
}
