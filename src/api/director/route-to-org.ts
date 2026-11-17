import { DirectorClient } from "./director-client";
import type { RoutedMessage, RouteMessageRequest } from "./types";

/**
 * Offer the first message of a new conversation to the org of its folder.
 *
 * Where the folder's git repository has no org, the message starts one and
 * the conversation becomes the root team's IC. Where it has one, the message
 * goes to the nearest team at or above the folder, or to a team below that
 * one which the director is sure it concerns, and no conversation is
 * started.
 *
 * @returns Where the message went, or `null` when the conversation is to
 * start as an ordinary one: the server has no director, the folder is not in
 * a git repository, or it is outside the repository of the org the server
 * already has.
 */
export async function routeToOrg(
  text: string,
  folder: string,
  conversation: NonNullable<RouteMessageRequest["conversation"]>,
): Promise<RoutedMessage | null> {
  try {
    return await DirectorClient.routeMessage({
      text,
      path: folder,
      auto: true,
      conversation,
    });
  } catch {
    // Starting a conversation never depends on the director.
    return null;
  }
}
