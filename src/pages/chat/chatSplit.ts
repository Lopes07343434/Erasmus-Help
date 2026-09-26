import { useOutletContext } from 'react-router'

/** What ChatLayout hands to the open conversation through `<Outlet context>`. */
export interface ChatOutletContext {
  /** Desktop split view: the conversation sits next to the list (no back button, fits the right column). */
  split: boolean
}

export const CHAT_SPLIT_CONTEXT: ChatOutletContext = { split: true }

/** True inside the desktop split view's conversation pane (false on mobile and when rendered on its own). */
export function useChatSplit(): boolean {
  return useOutletContext<ChatOutletContext | null | undefined>()?.split === true
}
