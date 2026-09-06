"use client";

import type { ChangeEvent } from "react";
import type { QueueQuery } from "@/lib/api";
import { ACCOUNTING_OPTIONS, DECIDED_OPTIONS, HOLD_TYPE_OPTIONS } from "@/lib/labels";

const SELECT_CLASS =
  "h-8 rounded-md border border-line-strong bg-surface-2 px-2 text-xs text-ink " +
  "transition-colors hover:border-brand/50 focus:border-brand focus:outline-none";

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className={SELECT_CLASS}
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Queue filters.
 *
 * Every control here maps to a query parameter `GET /api/runs/{runId}/queue` supports, so
 * the count beside them describes the whole matching set rather than the page in hand.
 * There is no free-text search control, because the route has no search parameter and
 * filtering one page in the browser would silently mislead about what is in the queue.
 */
export function QueueFilters({
  query,
  onChange,
  resultCount,
  onClear,
}: {
  query: QueueQuery;
  onChange: (patch: Partial<QueueQuery>) => void;
  resultCount: number | null;
  onClear: () => void;
}) {
  const accounting: "all" | "true" | "false" =
    query.blocks_accounting === true
      ? "true"
      : query.blocks_accounting === false
        ? "false"
        : "all";

  const activeCount =
    (query.hold_type && query.hold_type !== "all" ? 1 : 0) +
    (accounting !== "all" ? 1 : 0) +
    (query.undecided_only ? 1 : 0);

  return (
    <div className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">
          Refine queue {activeCount > 0 ? `· ${activeCount} active` : ""}
        </p>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded text-xs text-brand-ink hover:text-ink"
          >
            Clear all
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          label="Hold type"
          value={query.hold_type ?? "all"}
          options={HOLD_TYPE_OPTIONS}
          onChange={(value) => onChange({ hold_type: value, offset: 0 })}
        />
        <Select
          label="Accounting"
          value={accounting}
          options={ACCOUNTING_OPTIONS}
          onChange={(value) =>
            onChange({
              blocks_accounting: value === "all" ? null : value === "true",
              offset: 0,
            })
          }
        />
        <Select
          label="Decided"
          value={query.undecided_only ? "undecided" : "all"}
          options={DECIDED_OPTIONS}
          onChange={(value) => onChange({ undecided_only: value === "undecided", offset: 0 })}
        />

        <div className="flex items-center justify-between gap-3 sm:ml-auto sm:justify-start">
          {resultCount !== null ? (
            <span className="font-mono text-xs text-ink-faint tabular-nums">
              {resultCount} {resultCount === 1 ? "case" : "cases"}
            </span>
          ) : null}
          <span
            className="rounded-md border border-line-strong bg-surface-2 px-2 py-1.5 text-xs text-ink-muted"
            aria-label="Ordered by money at risk descending, by the API"
          >
            Money at risk ↓
          </span>
        </div>
      </div>
    </div>
  );
}
