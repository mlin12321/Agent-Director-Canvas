import {
  HUMAN_JOINED_TAG_KEY,
  hasConversationTagFlag,
  isAgentStartedConversation,
} from "#/utils/conversation-tag-flags";
import { DirectorClient } from "./director-client";

/**
 * Tell the director that the human wrote in a conversation it started for
 * an agent, so that the conversation is listed with the human's own.
 *
 * @returns Whether the director was told. Nothing is asked for a
 * conversation the human started or one that is already marked, and a
 * director that cannot be asked never holds a message back.
 */
export async function joinFromChat(
  conversationId: string,
  tags: Record<string, string> | null | undefined,
): Promise<boolean> {
  if (!isAgentStartedConversation(tags)) return false;
  if (hasConversationTagFlag(tags, HUMAN_JOINED_TAG_KEY)) return false;
  try {
    await DirectorClient.joinConversation(conversationId);
    return true;
  } catch {
    return false;
  }
}
