"use client";

import { useEffect, useRef, useState } from "react";
import type { ExceptionCategory, ExceptionQuery, Severity } from "@/lib/api";
import { cn } from "@/lib/cn";
import { CATEGORY_OPTIONS, SEVERITY_OPTIONS, STATUS_OPTIONS } from "@/lib/labels";
import { KeyHint } from "@/components/ui/KeyHint";

const SELECT =
  "h-9 w-full rounded-sm border border-line-strong bg-surface px-2 text-sm text-ink " +
  "transition-colors focus:border-focus focus:outline-none";

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

  /*
   * Severity and category live behind a disclosure. Status is the filter a
   * reviewer reaches for nine times in ten, and the other two were spending
   * more vertical space above the backlog than three rows of the backlog.
   *
   * It opens by itself when a hidden filter is already applied, so a narrowed
   * queue never looks like an empty one.
   */
  const narrowed =
    (query.severity ?? "all") !== "all" || (query.category ?? "all") !== "all";
  const [showMore, setShowMore] = useState(narrowed);
  useEffect(() => {
    if (narrowed) setShowMore(true);
  }, [narrowed]);

  return (
    <div className="border-b border-line px-4 py-3">
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
          className="h-9 w-full rounded-sm border border-line-strong bg-surface pr-10 pl-3 text-base text-ink placeholder:text-ink-faint focus:border-focus focus:outline-none"
        />
        <span className="pointer-events-none absolute top-2 right-2.5">
          <KeyHint>/</KeyHint>
        </span>
      </div>

      <div
        role="group"
        aria-label="Filter by status"
        className="mt-2.5 flex overflow-hidden rounded-sm border border-line-strong"
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
                "flex-1 border-r border-line-strong py-1.5 text-xs transition-colors last:border-r-0",
                active
                  ? "bg-focus-wash font-medium text-focus-ink"
                  : "bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3">
        {/* The only ordering the API offers. Stating it beats a menu with one item. */}
        <span className="label-field" aria-label="Sorted by money at risk, descending">
          Money at risk &darr;
        </span>
        <button
          type="button"
          onClick={() => setShowMore((open) => !open)}
          aria-expanded={showMore}
          aria-controls="queue-more-filters"
          className="flex items-center gap-1.5 rounded-xs text-xs text-focus-ink hover:underline"
        >
          <span aria-hidden className="text-ink-faint">{showMore ? "▾" : "▸"}</span>
          More filters
          {activeFilterCount > 0 ? (
            <span className="num rounded-xs bg-focus-wash px-1.5 py-px text-2xs text-focus-ink">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      </div>

      <div id="queue-more-filters" hidden={!showMore} className="mt-2.5 space-y-2">
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
        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-xs text-xs text-focus-ink hover:underline"
          >
            Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
