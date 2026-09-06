// Orchestrator-owned. Guarantees `tsc --noEmit` always has at least one input,
// so the typecheck gate is green on an empty repo and cannot be trivially
// satisfied by a worker deleting the last .ts file. Do not delete.
export const CLEARLINE = 'clearline' as const;
