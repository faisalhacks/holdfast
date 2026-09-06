/**
 * Shortcut guards.
 *
 * Every shortcut in this application moves, opens, or reveals. None of them
 * commits a route, a hold release, or a tolerance change: those are behind an
 * explicit form submit, because a keystroke that releases a hold is exactly the
 * unattributable action this product exists to argue against.
 */

const TYPING_SELECTOR = "input, textarea, select, [contenteditable]";

/** True when the event came from somewhere the user is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(TYPING_SELECTOR));
}

/** True for a bare key press, with no modifier that would mean something else. */
export function isBareKey(event: KeyboardEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey;
}
