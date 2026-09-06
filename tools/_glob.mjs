// Orchestrator-owned. Minimal, dependency-free glob matcher.
// Supports: `**` (any number of segments, including zero), `*` (within a segment),
// `?` (one char within a segment). Every other character is literal — which matters,
// because our ownership globs contain Next.js route groups like `app/(ui)/queue/**`.

const REGEX_SPECIAL = new Set(['.', '+', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\', '/']);
const BACKSLASH = String.fromCharCode(92);

export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` collapses to "zero or more whole segments" so `a/**` matches `a/b.ts`
        // and `a/b/c.ts` alike; a trailing `**` matches the rest of the path.
        if (glob[i + 2] === '/') { re += '(?:[^/]+/)*'; i += 2; continue; }
        re += '.*'; i += 1; continue;
      }
      re += '[^/]*';
      continue;
    }
    if (c === '?') { re += '[^/]'; continue; }
    re += REGEX_SPECIAL.has(c) ? BACKSLASH + c : c;
  }
  return new RegExp('^' + re + '$');
}

export function matches(path, glob) {
  return globToRegex(glob).test(path);
}

export function matchesAny(path, globs) {
  return globs.some((g) => matches(path, g));
}
