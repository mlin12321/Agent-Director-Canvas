import React from "react";
import { ConversationMain } from "#/components/features/conversation/conversation-main/conversation-main";
import { ConversationSurface } from "#/components/features/conversation/conversation-surface";
import {
  NavigationProvider,
  useNavigation,
} from "#/context/navigation-context";

/**
 * One agent's live conversation inside the org chart. The conversation UI
 * reads its id from the navigation context, so that is re-targeted at the
 * agent; the page itself stays where it is.
 */
export function AgentConversation({
  conversationId,
}: {
  conversationId: string;
}) {
  const navigation = useNavigation();
  const value = React.useMemo(
    () => ({ ...navigation, conversationId }),
    [navigation, conversationId],
  );
  return (
    <NavigationProvider value={value}>
      <ConversationSurface conversationId={conversationId}>
        <div className="flex h-full flex-col">
          <ConversationMain />
        </div>
      </ConversationSurface>
    </NavigationProvider>
  );
}
