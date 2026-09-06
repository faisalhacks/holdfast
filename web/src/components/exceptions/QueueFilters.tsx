"use client";

import type { ChangeEvent } from "react";
import type { ExceptionQuery } from "@/lib/api";
import {
  CATEGORY_OPTIONS,
  SEVERITY_OPTIONS,
  STATUS_OPTIONS,
} from "@/lib/labels";

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
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value as T)
        }
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

export function QueueFilters({
  query,
  onChange,
  resultCount,
  onClear,
}: {
  query: ExceptionQuery;
  onChange: (patch: Partial<ExceptionQuery>) => void;
  resultCount: number | null;
  onClear: () => void;
}) {
  const activeCount = [query.status, query.severity, query.category].filter(
    (value) => value && value !== "all",
  ).length + (query.search?.trim() ? 1 : 0);

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
      <input
        type="search"
        value={query.search ?? ""}
        onChange={(event) => onChange({ search: event.target.value, page: 1 })}
        placeholder="Search reference, entity, agent…"
        aria-label="Search exceptions"
        className="h-9 w-full rounded-md border border-line-strong bg-surface-2 px-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none sm:w-64"
      />

      <Select
        label="Status"
        value={query.status ?? "all"}
        options={STATUS_OPTIONS}
        onChange={(value) => onChange({ status: value, page: 1 })}
      />
      <Select
        label="Severity"
        value={query.severity ?? "all"}
        options={SEVERITY_OPTIONS}
        onChange={(value) => onChange({ severity: value, page: 1 })}
      />
      <Select
        label="Category"
        value={query.category ?? "all"}
        options={CATEGORY_OPTIONS}
        onChange={(value) => onChange({ category: value, page: 1 })}
      />

      <div className="flex items-center justify-between gap-3 sm:ml-auto sm:justify-start">
        {resultCount !== null ? (
          <span className="font-mono text-xs text-ink-faint tabular-nums">
            {resultCount} {resultCount === 1 ? "exception" : "exceptions"}
          </span>
        ) : null}
        <span className="rounded-md border border-line-strong bg-surface-2 px-2 py-1.5 text-xs text-ink-muted" aria-label="Sorted by money at risk descending">
          Money at risk ↓
        </span>
      </div>
      </div>
    </div>
  );
}
