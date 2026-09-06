"use client";

import { useEffect, useRef, useState } from "react";
import type { ExceptionCategory, ExceptionQuery, Severity } from "@/lib/api";
import { cn } from "@/lib/cn";
import { CATEGORY_OPTIONS, SEVERITY_OPTIONS, STATUS_OPTIONS } from "@/lib/labels";
import { KeyHint } from "@/components/ui/KeyHint";

const SELECT =
  "h-6 w-full rounded-sm border border-line-strong bg-surface-2 px-1.5 text-xs text-ink " +
  "transition-colors hover:border-line-strong focus:border-focus focus:outline-none";

export function QueueToolbar({
  query,
  onChange,
  onClear,
  activeFilterCount,
  searchRef,
}: {
  query: ExceptionQuery;
  onChange: (patch: Partial<ExceptionQuery>) => void;
  onClear: () => void;
  activeFilterCount: number;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  // The URL is the source of truth, but typing into it on every keystroke makes
  // the field feel like it is fighting back. Local state leads; the URL follows.
  const [draft, setDraft] = useState(query.search ?? "");
  const committed = query.search ?? "";

  useEffect(() => setDraft(committed), [committed]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (draft === committed) return;
    timer.current = setTimeout(() => onChange({ search: draft, page: 1 }), 180);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draft, committed, onChange]);

  return (
    <div className="border-b border-line bg-surface px-3 py-2">
      <div className="relative">
        <input
          ref={searchRef}
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft("");
              onChange({ search: "", page: 1 });
              event.currentTarget.blur();
            }
          }}
          placeholder="Reference, subject, agent"
          aria-label="Search exceptions"
          className="h-7 w-full rounded-sm border border-line-strong bg-surface-2 pr-8 pl-2 text-base text-ink placeholder:text-ink-faint focus:border-focus focus:outline-none"
        />
        <span className="pointer-events-none absolute top-1.5 right-2">
          <KeyHint>/</KeyHint>
        </span>
      </div>

      <div
        role="group"
        aria-label="Filter by status"
        className="mt-2 flex rounded-sm border border-line-strong"
      >
        {STATUS_OPTIONS.map((option) => {
          const active = (query.status ?? "all") === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ status: option.value, page: 1 })}
              className={cn(
                "flex-1 border-r border-line-strong py-1 text-xs transition-colors last:border-r-0",
                active ? "bg-surface-3 text-ink" : "text-ink-faint hover:bg-surface-2 hover:text-ink",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <select
          aria-label="Filter by severity"
          className={SELECT}
          value={query.severity ?? "all"}
          onChange={(event) =>
            onChange({ severity: event.target.value as Severity | "all", page: 1 })
          }
        >
          {SEVERITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by category"
          className={SELECT}
          value={query.category ?? "all"}
          onChange={(event) =>
            onChange({ category: event.target.value as ExceptionCategory | "all", page: 1 })
          }
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        {/* The only ordering the API offers. Stating it beats a menu with one item. */}
        <span className="label-section" aria-label="Sorted by money at risk, descending">
          Money at risk ↓
        </span>
        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-xs text-xs text-focus-ink hover:text-ink"
          >
            Clear {activeFilterCount}
          </button>
        ) : null}
      </div>
    </div>
  );
}
