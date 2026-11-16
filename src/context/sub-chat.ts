import React from "react";
import type { ConversationLink } from "#/api/director/types";

/**
 * Opens another agent's conversation inside the chat window, on top of the
 * one being read. `null` where there is no chat window to open it in.
 */
export const SubChatContext = React.createContext<
  ((link: ConversationLink) => void) | null
>(null);
