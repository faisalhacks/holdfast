// W09 — cache by content hash.
//
// The key is a SHA-256 over the model id, the schema version and the exact bytes of both
// prompts. Nothing about the caller, the clock or the run is in it, so the same question
// asked twice is the same key twice — across processes, across runs, across machines.
//
// Two layers, both optional and both explicit:
//   MEMORY  a bounded Map. Two invoices with identical prompts cost one call.
//   DISK    one JSON file per key. What makes a residual pass reproducible after the fact:
//           a reviewer can re-run the pass a week later and get the same nominations
//           without a single live call, which is the only way "we cached it" is auditable
//           rather than an assertion.
//
// The memory layer evicts on insertion order when it is full. `.delete()` on a Map is not
// a data deletion and the forbidden-pattern gate scopes its ORM rule away from llm/** for
// exactly this reason; nothing here can remove a row from anything durable.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_MAX_ENTRIES = 512;

/** Separator between hashed parts. Outside the alphabet of every part, so nothing forges. */
const SEPARATOR = String.fromCharCode(0);

/** SHA-256 over the parts, separated so concatenation cannot forge a collision. */
export function contentHash(parts: readonly string[]): string {
  const digest = createHash('sha256');
  for (const part of parts) {
    digest.update(part, 'utf8');
    digest.update(SEPARATOR, 'utf8');
  }
  return digest.digest('hex');
}

export interface CacheOptions {
  /** Directory for the durable layer. Null or absent keeps the cache in memory only. */
  readonly dir?: string | null;
  readonly maxEntries?: number;
}

export interface ContentCache {
  readonly get: (key: string) => string | null;
  readonly set: (key: string, value: string) => void;
  readonly hits: () => number;
  readonly size: () => number;
}

export function createContentCache(options: CacheOptions = {}): ContentCache {
  const memory = new Map<string, string>();
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const dir = options.dir ?? null;
  let hits = 0;

  const pathFor = (key: string): string | null => (dir === null ? null : join(dir, `${key}.json`));

  return {
    get(key: string): string | null {
      const inMemory = memory.get(key);
      if (inMemory !== undefined) {
        hits += 1;
        return inMemory;
      }
      const path = pathFor(key);
      if (path === null || !existsSync(path)) return null;
      try {
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
        if (typeof parsed !== 'object' || parsed === null) return null;
        const text = (parsed as { text?: unknown }).text;
        if (typeof text !== 'string') return null;
        memory.set(key, text);
        hits += 1;
        return text;
      } catch {
        // An unreadable cache entry is a cache miss, never an error and never a guess.
        return null;
      }
    },

    set(key: string, value: string): void {
      if (memory.size >= maxEntries) {
        const oldest = memory.keys().next();
        if (!oldest.done) memory.delete(oldest.value);
      }
      memory.set(key, value);
      const path = pathFor(key);
      if (path === null || dir === null) return;
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(path, `${JSON.stringify({ key, text: value }, null, 2)}\n`, 'utf8');
      } catch {
        // A cache that cannot write is still a cache. It is never a reason to fail a pass.
      }
    },

    hits: () => hits,
    size: () => memory.size,
  };
}
