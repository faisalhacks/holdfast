// Response envelope, error shape, and the human-approval gate.
//
// Every response is `{ data, meta }` on success and `{ error, meta }` on failure, so a
// client writes one fetch wrapper and never has to special-case a route.

import { NextResponse } from 'next/server';
import type { ReviewerId } from '@/lib/types';
import { WideMoneyError } from './money';
import { encode, MONEY_CONTRACT } from './wire';

export const ERROR_CODES = [
  'bad_request',
  'not_found',
  'conflict',
  'unprocessable',
  'human_approval_required',
  'idempotency_key_required',
  'idempotency_key_conflict',
  'repository_unavailable',
  'money_out_of_range',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Header a client must send to confirm a destructive operation. Its value is the
 * ReviewerId of the human taking responsibility, and it must equal the `reviewer` in the
 * request body — a machine cannot approve on a person's behalf by omission.
 */
export const APPROVAL_HEADER = 'X-Holdfast-Human-Approval';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

export const REPLAY_HEADER = 'X-Idempotent-Replay';

export interface Envelope {
  readonly repository: string;
  readonly generated_at: string;
  readonly money: typeof MONEY_CONTRACT;
}

function envelope(repositoryKind: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    repository: repositoryKind,
    generated_at: new Date().toISOString(),
    money: MONEY_CONTRACT,
    ...(extra ?? {}),
  };
}

export interface RespondOptions {
  readonly status?: number;
  readonly headers?: Record<string, string>;
  readonly meta?: Record<string, unknown>;
}

export function ok(
  repositoryKind: string,
  data: unknown,
  options: RespondOptions = {},
): NextResponse {
  return NextResponse.json(
    { data: encode(data), meta: envelope(repositoryKind, options.meta) },
    { status: options.status ?? 200, headers: options.headers },
  );
}

export interface ApiErrorBody {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: unknown;
}

export function fail(
  repositoryKind: string,
  status: number,
  body: ApiErrorBody,
  options: RespondOptions = {},
): NextResponse {
  return NextResponse.json(
    { error: encode(body), meta: envelope(repositoryKind, options.meta) },
    { status, headers: options.headers },
  );
}

/** Thrown by handlers; converted to a response by `guard`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown): ApiError =>
  new ApiError(400, 'bad_request', message, details);
export const notFound = (message: string, details?: unknown): ApiError =>
  new ApiError(404, 'not_found', message, details);
export const conflict = (message: string, details?: unknown): ApiError =>
  new ApiError(409, 'conflict', message, details);
export const unprocessable = (message: string, details?: unknown): ApiError =>
  new ApiError(422, 'unprocessable', message, details);

/**
 * 428 Precondition Required. The body carries a PREVIEW of what the operation would do,
 * so a UI can render an accurate confirmation dialogue rather than a generic one, then
 * repeat the request with the approval header.
 */
export function approvalRequired(operation: string, preview: unknown): ApiError {
  return new ApiError(428, 'human_approval_required', `"${operation}" is destructive and requires a named human to approve it`, {
    operation,
    destructive: true,
    approval_header: APPROVAL_HEADER,
    approval_value: 'the ReviewerId in the request body, repeated in the header',
    preview,
  });
}

/**
 * Reads the approval header and checks it names the same human as the request body.
 * Returns false when the header is absent or does not match — the caller then answers 428
 * with a preview rather than performing the operation.
 */
export function approvedBy(request: Request, reviewer: ReviewerId): boolean {
  const header = request.headers.get(APPROVAL_HEADER);
  if (!header) return false;
  return header.trim() === String(reviewer);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest('request body is not valid JSON');
  }
}

/** Wraps a handler so thrown ApiErrors and money-range failures become clean responses. */
export async function guard(
  repositoryKind: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(repositoryKind, err.status, {
        code: err.code,
        message: err.message,
        details: err.details,
      });
    }
    if (err instanceof WideMoneyError) {
      return fail(repositoryKind, 502, {
        code: 'money_out_of_range',
        message: err.message,
        details: { field: err.field, digits: err.digits },
      });
    }
    const message = err instanceof Error ? err.message : 'unexpected failure';
    return fail(repositoryKind, 500, { code: 'repository_unavailable', message });
  }
}

// ── query helpers ───────────────────────────────────────────────────────────────

export function intParam(url: URL, key: string, fallback: number, max: number): number {
  const raw = url.searchParams.get(key);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) throw badRequest(`"${key}" must be a non-negative integer`);
  return Math.min(parsed, max);
}

export function boolParam(url: URL, key: string): boolean | null {
  const raw = url.searchParams.get(key);
  if (raw === null) return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw badRequest(`"${key}" must be "true" or "false"`);
}

export function enumParam<T extends string>(
  url: URL,
  key: string,
  allowed: readonly T[],
): T | null {
  const raw = url.searchParams.get(key);
  if (raw === null) return null;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw badRequest(`"${key}" must be one of: ${allowed.join(', ')}`);
  }
  return raw as T;
}
