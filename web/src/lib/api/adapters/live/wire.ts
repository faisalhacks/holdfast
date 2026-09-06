/**
 * Transport decoding for the frozen backend.
 *
 * This file is the only place that knows what the wire looks like. It owns three things
 * the rest of the console must never repeat:
 *
 *  1. The response envelope. Every route answers `{ data, meta }` on success and
 *     `{ error: { code, message, details }, meta }` on failure.
 *  2. The money rule. A monetary field arrives as `<name>_paise` when the exact value fits
 *     an IEEE-754 safe integer, and as `<name>_paise_string` when it does not. Both are
 *     read into `Money.digits` so nothing downstream sees a float.
 *  3. The two tolerance spellings. `{ kind: 'absolute_paise' }` carries `value_paise` on
 *     the way out of the backend and `value` on the way back in.
 */

import type { Money, Tolerance, ToleranceScope } from "@/lib/api/types";
import {
  ApiError,
  ApprovalRequiredError,
  ConflictError,
  NotFoundError,
} from "@/lib/api/types";

export const APPROVAL_HEADER = "X-Holdfast-Human-Approval";

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── money ────────────────────────────────────────────────────────────────────

const ZERO: Money = { digits: "0", safe: 0 };

export function money(digits: string, safe: number | null): Money {
  return { digits, safe };
}

/**
 * Reads one monetary field under the contract's two spellings.
 *
 * Returns `null` when the field is present and null, and when it is absent altogether —
 * the backend uses an explicit null for "no monetary value here".
 */
export function readMoney(source: unknown, name: string): Money | null {
  if (!isObject(source)) return null;
  const narrow = source[name];
  if (typeof narrow === "number") return money(BigInt(narrow).toString(), narrow);
  const wide = source[`${name}_string`];
  if (typeof wide === "string" && wide.length > 0) {
    // Outside the safe range by construction: keep the digits, refuse a number form.
    return money(wide, null);
  }
  return null;
}

/** Same as `readMoney`, for a field the contract guarantees is never null. */
export function readMoneyRequired(source: unknown, name: string): Money {
  return readMoney(source, name) ?? ZERO;
}

// ── scalars ──────────────────────────────────────────────────────────────────

export function str(source: unknown, name: string): string {
  if (!isObject(source)) return "";
  const value = source[name];
  return typeof value === "string" ? value : "";
}

export function strOrNull(source: unknown, name: string): string | null {
  if (!isObject(source)) return null;
  const value = source[name];
  return typeof value === "string" ? value : null;
}

export function num(source: unknown, name: string, fallback = 0): number {
  if (!isObject(source)) return fallback;
  const value = source[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function bool(source: unknown, name: string, fallback = false): boolean {
  if (!isObject(source)) return fallback;
  const value = source[name];
  return typeof value === "boolean" ? value : fallback;
}

export function arr(source: unknown, name: string): unknown[] {
  if (!isObject(source)) return [];
  const value = source[name];
  return Array.isArray(value) ? value : [];
}

export function obj(source: unknown, name: string): Json | null {
  if (!isObject(source)) return null;
  const value = source[name];
  return isObject(value) ? value : null;
}

/** Narrows a wire string to a known enum member, or falls back to the given member. */
export function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

// ── tolerance ────────────────────────────────────────────────────────────────

/**
 * Decodes a tolerance. `absolute_paise` is the one member whose value is renamed on the
 * wire so that every monetary field name ends in `_paise`.
 */
export function readTolerance(source: unknown): Tolerance {
  const kind = str(source, "kind");
  switch (kind) {
    case "absolute_paise":
      return { kind: "absolute_paise", value: readMoneyRequired(source, "value_paise") };
    case "percentage":
      return { kind: "percentage", value: num(source, "value") };
    case "days":
      return { kind: "days", value: num(source, "value") };
    case "similarity":
      return { kind: "similarity", value: num(source, "value") };
    default:
      return { kind: "exact" };
  }
}

/**
 * Encodes a tolerance for a request body, undoing the `value_paise` rename.
 *
 * The backend validates `absolute_paise.value` with `z.number().int().safe()`, so a value
 * outside the safe range cannot be submitted. That is the backend's rule, and this throws
 * rather than rounding to satisfy it.
 */
export function writeTolerance(tolerance: Tolerance): Json {
  switch (tolerance.kind) {
    case "absolute_paise": {
      if (tolerance.value.safe === null) {
        throw new ApiError(
          "That tolerance is outside the range the backend accepts for an integer paise value.",
          "unprocessable",
          422,
        );
      }
      return { kind: "absolute_paise", value: tolerance.value.safe };
    }
    case "exact":
      return { kind: "exact" };
    default:
      return { kind: tolerance.kind, value: tolerance.value };
  }
}

export function readToleranceScope(source: unknown): ToleranceScope {
  const kind = str(source, "kind");
  if (kind === "vendor") return { kind: "vendor", vendor_id: str(source, "vendor_id") };
  if (kind === "invoice") return { kind: "invoice", invoice_id: str(source, "invoice_id") };
  if (kind === "hold_type") {
    return {
      kind: "hold_type",
      // The backend only ever emits a member of HOLD_TYPES here.
      hold_type: str(source, "hold_type") as ToleranceScope extends { hold_type: infer H }
        ? H
        : never,
    };
  }
  return { kind: "global" };
}

// ── envelope and errors ──────────────────────────────────────────────────────

export interface BackendError {
  readonly code: string;
  readonly message: string;
  readonly details: unknown;
}

function readError(body: unknown): BackendError {
  const error = obj(body, "error");
  return {
    code: str(error, "code") || "repository_unavailable",
    message: str(error, "message") || "The backend rejected the request.",
    details: error?.["details"] ?? null,
  };
}

/**
 * Turns a non-2xx response into the typed error the UI knows how to render.
 *
 * A 428 becomes an `ApprovalRequiredError` carrying the backend's own preview — never a
 * generic failure. The caller renders that preview and repeats the request with the
 * approval header.
 */
export function toTypedError(
  status: number,
  body: unknown,
  decodePreview: (operation: string, preview: unknown) => unknown,
): Error {
  const error = readError(body);

  if (status === 428) {
    const details = isObject(error.details) ? error.details : {};
    const operation = str(details, "operation");
    return new ApprovalRequiredError(
      error.message,
      decodePreview(operation, details["preview"]) as never,
      str(details, "approval_header") || APPROVAL_HEADER,
      str(details, "approval_value"),
    );
  }
  if (status === 404) return new NotFoundError(error.message);
  if (status === 409) return new ConflictError(error.message);
  return new ApiError(error.message, error.code, status);
}

/** Unwraps `{ data, meta }`. Anything else is a contract break and says so. */
export function unwrap(body: unknown): unknown {
  if (!isObject(body) || !("data" in body)) {
    throw new ApiError(
      "The backend response did not carry the { data, meta } envelope the contract defines.",
      "unprocessable",
      502,
    );
  }
  return body["data"];
}
