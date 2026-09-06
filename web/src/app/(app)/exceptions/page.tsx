import { KeyHint } from "@/components/ui/KeyHint";

/**
 * The centre pane with nothing selected. It states how to work the queue rather
 * than filling the space with a summary the left pane already carries.
 */
export default function ExceptionQueueRestState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="label-section">No exception selected</p>
      <p className="max-w-sm text-base text-ink-muted">
        The queue is ordered by money at risk, descending. Open the top item, or search for a
        reference.
      </p>
      <p className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-ink-faint">
        <KeyHint>j</KeyHint>
        <KeyHint>k</KeyHint>
        <span>move</span>
        <span aria-hidden className="opacity-40">·</span>
        <KeyHint>↵</KeyHint>
        <span>open</span>
        <span aria-hidden className="opacity-40">·</span>
        <KeyHint>/</KeyHint>
        <span>search</span>
      </p>
    </div>
  );
}
