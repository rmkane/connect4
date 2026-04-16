const TAIL_THRESHOLD_PX = 72

/**
 * Whether the user is following the newest messages (or the log is not in the DOM yet).
 * If `true`, new messages should scroll the log to the bottom.
 */
export function chatLogWasFollowingTail(el: HTMLElement | null): boolean {
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight <= TAIL_THRESHOLD_PX
}

/** Run after DOM updates from a render pass. */
export function scrollChatLogToBottomById(elementId: string): void {
  requestAnimationFrame(() => {
    const el = document.getElementById(elementId)
    if (el) el.scrollTop = el.scrollHeight
  })
}
