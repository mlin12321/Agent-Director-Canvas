import { DirectorClient } from "./director-client";
import type { RoutedMessage } from "./types";

/**
 * Offer what is written in a conversation to the org it leads.
 *
 * What the human writes to the top team's IC is for the org as a whole: the
 * director sends it straight to the team it concerns when it is sure which
 * that is, and to the top team's IC otherwise. Either way the server has
 * delivered it.
 *
 * @returns Where the message went, or `null` when it is to be sent the
 * ordinary way: the conversation is not the top IC's of an org, or the
 * director could not be asked.
 */
export async function routeFromChat(
  conversationId: string,
  text: string,
): Promise<RoutedMessage | null> {
  try {
    const org = await DirectorClient.getOrg();
    if (org.fixture || org.top_conversation_id !== conversationId) return null;
    // From the root, so that nothing is added to the text for where it
    // was said.
    return await DirectorClient.routeMessage({ text, path: "", auto: true });
  } catch {
    // Sending a message never depends on the director.
    return null;
  }
}
