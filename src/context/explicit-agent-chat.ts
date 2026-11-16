import React from "react";

/**
 * True inside a chat that was opened on one agent of an org on purpose (from
 * the org chart). What is written there goes to that agent and is never
 * offered to the org's director to send elsewhere.
 */
export const ExplicitAgentChatContext = React.createContext(false);
