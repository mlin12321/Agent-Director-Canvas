import i18n from "#/i18n";
import { I18nKey } from "#/i18n/declaration";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { DirectorClient, DirectorError } from "./director-client";
import type { RoutedMessage, RouteMessageRequest } from "./types";

// What an org answers when it has the message's folder and still does not
// take the message: no team can, or the server runs all it can.
const REFUSALS = [409, 429];

/** Say that the org did not take a message, in the director's words. */
export function tellOfRefusal(error: unknown) {
  if (error instanceof DirectorError) {
    displayErrorToast(
      i18n.t(I18nKey.ORG_CHART$ROUTE_REFUSED, { reason: error.message }),
    );
  }
}

/**
 * Offer the first message of a new conversation to the org of its folder.
 *
 * Where the folder's git repository has no org, the message starts one and
 * the conversation becomes the root team's IC. Where it has one, the message
 * goes to the nearest team at or above the folder, or to a team below that
 * one which the director is sure it concerns, and no conversation is
 * started.
 *
 * @param agentType The type of the top team of the org the message starts;
 * the server's own when left out. An org that exists takes no notice of it.
 *
 * @returns Where the message went, or `null` when the conversation is to
 * start as an ordinary one: the server has no director, the folder is not in
 * a git repository, or it is outside the repository of the org the server
 * already has. An org that has the folder and does not take the message
 * says why, and the conversation still starts as an ordinary one.
 */
export async function routeToOrg(
  text: string,
  folder: string,
  conversation: NonNullable<RouteMessageRequest["conversation"]>,
  agentType?: string,
): Promise<RoutedMessage | null> {
  try {
    return await DirectorClient.routeMessage({
      text,
      path: folder,
      auto: true,
      conversation,
      ...(agentType ? { agent_type: agentType } : {}),
    });
  } catch (error) {
    // Starting a conversation never depends on the director.
    if (
      error instanceof DirectorError &&
      REFUSALS.includes(error.status ?? 0)
    ) {
      tellOfRefusal(error);
    }
    return null;
  }
}
