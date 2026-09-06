#!/usr/bin/env node
/**
 * Architectural boundary check.
 *
 * Two rules keep the adapter layer swappable and the fixtures disposable:
 *
 *   1. UI code (app / components / hooks) imports the API only through
 *      `@/lib/api` — never a concrete adapter, never fixtures.
 *   2. Fixtures know nothing about the UI.
 *
 * Cheap to run, and it fails the build before a shortcut becomes a habit.
 */

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");

const RULES = [
  {
    scope: ["app", "components", "hooks"],
    forbidden: /from\s+["']@\/mocks(\/|["'])/,
    message: "UI code must not import demo fixtures. Go through `@/lib/api`.",
  },
  {
    scope: ["app", "components", "hooks"],
    forbidden: /from\s+["']@\/lib\/api\/adapters/,
    message:
      "UI code must not import an adapter directly. Import `api` from `@/lib/api`.",
  },
  {
    scope: ["mocks"],
    forbidden: /from\s+["']@\/(components|app|hooks)(\/|["'])/,
    message: "Fixtures must not depend on UI code.",
  },
];

async function collect(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collect(full)));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];

for (const rule of RULES) {
  for (const scope of rule.scope) {
    for (const file of await collect(path.join(src, scope))) {
      const contents = readFileSync(file, "utf8");
      for (const [index, line] of contents.split(/\r?\n/).entries()) {
        if (rule.forbidden.test(line)) {
          violations.push({
            file: path.relative(root, file).replace(/\\/g, "/"),
            line: index + 1,
            code: line.trim(),
            message: rule.message,
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`\nBoundary check failed (${violations.length} violation(s)):\n`);
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}`);
    console.error(`    ${violation.code}`);
    console.error(`    → ${violation.message}\n`);
  }
  process.exit(1);
}

console.log("Boundary check passed: UI imports only through the API adapter layer.");
