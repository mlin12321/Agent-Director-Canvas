import { DirectorClient } from "./director-client";
import type { RoutedMessage } from "./types";

/**
 * Offer what is written in a conversation to the session it leads.
 *
 * What the human writes to the IC a session was opened with goes on in that
 * session: the director sends it straight to the team of the session it
 * concerns when it is sure which that is, a team the session set up itself
 * included, and to that IC otherwise. Either way the server has delivered
 * it. A request of its own is a new session, which is routed among the
 * org's teams when it is opened.
 *
 * @returns Where the message went, or `null` when it is to be sent the
 * ordinary way: the conversation is not that of a session's first IC, or
 * the director could not be asked.
 */
export async function routeFromChat(
  conversationId: string,
  text: string,
): Promise<RoutedMessage | null> {
  try {
    const org = await DirectorClient.getOrg();
    if (org.fixture) return null;
    const sessions = await DirectorClient.listSessions();
    const session = sessions.find(
      (open) => open.conversation_id === conversationId,
    );
    if (!session) return null;
    return await DirectorClient.routeMessage({ text, session_id: session.id });
  } catch {
    // Sending a message never depends on the director.
    return null;
  }
}
