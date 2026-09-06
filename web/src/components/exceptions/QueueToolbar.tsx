"use client";

import type { HoldType, QueueQuery } from "@/lib/api";
import { ACCOUNTING_OPTIONS, DECIDED_OPTIONS, HOLD_TYPE_OPTIONS } from "@/lib/labels";

const SELECT =
  "h-9 w-full rounded-sm border border-line-strong bg-surface px-2 text-sm text-ink transition-colors focus:border-focus focus:outline-none";

export function QueueToolbar({
  query,
  onChange,
  onClear,
  activeFilterCount,
}: {
  query: QueueQuery;
  onChange: (patch: Partial<QueueQuery> & { page?: number }) => void;
  onClear: () => void;
  activeFilterCount: number;
}) {
  return (
    <div className="border-b border-line px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-3">
        <select
          aria-label="Filter by hold type"
          className={SELECT}
          value={query.hold_type ?? "all"}
          onChange={(event) => onChange({ hold_type: event.target.value as HoldType | "all", page: 1 })}
        >
          {HOLD_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select
          aria-label="Filter by accounting effect"
          className={SELECT}
          value={query.blocks_accounting === null || query.blocks_accounting === undefined ? "all" : String(query.blocks_accounting)}
          onChange={(event) => onChange({ blocks_accounting: event.target.value === "all" ? null : event.target.value === "true", page: 1 })}
        >
          {ACCOUNTING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select
          aria-label="Filter by decision state"
          className={SELECT}
          value={query.undecided_only ? "undecided" : "all"}
          onChange={(event) => onChange({ undecided_only: event.target.value === "undecided", page: 1 })}
        >
          {DECIDED_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className="label-field">Money at risk &darr;</span>
        {activeFilterCount > 0 ? (
          <button type="button" onClick={onClear} className="rounded-xs text-xs text-focus-ink hover:underline">
            Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
