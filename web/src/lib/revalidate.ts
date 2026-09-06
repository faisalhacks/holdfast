/**
 * A one-line publish/subscribe channel for "something was written".
 *
 * The queue and the open case are two independent reads of the same run, and
 * they are now on screen at the same time. Without this, routing a case leaves
 * the row beside it still reading "open" — a reviewer working a backlog would
 * see the queue disagree with the decision they just made.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onWrite(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function announceWrite(): void {
  for (const listener of listeners) listener();
}
