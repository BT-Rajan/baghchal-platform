/**
 * Errors from the server, which always answer `{"error": {"code", "message", "fields"?}}`.
 * Screens branch on `code` (`player_busy`, `stale_position`, …), never on the message text.
 */
import { t } from '@/i18n';

export interface FieldProblem {
  field: string;
  problem: string;
}

/** Codes the client produces itself, when there is no answer from the server to report. */
export const NETWORK_ERROR = 'network_error';
export const TIMEOUT = 'timeout';
export const BAD_RESPONSE = 'bad_response';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: readonly FieldProblem[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFields(value: unknown): FieldProblem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    isRecord(item) && typeof item.field === 'string' && typeof item.problem === 'string'
      ? [{ field: item.field, problem: item.problem }]
      : [],
  );
}

/** Turns an error response body (already parsed, or undefined if it was not JSON) into an error. */
export function errorFromBody(status: number, body: unknown): ApiError {
  const error = isRecord(body) ? body.error : undefined;
  if (isRecord(error) && typeof error.code === 'string' && typeof error.message === 'string') {
    return new ApiError(status, error.code, error.message, parseFields(error.fields));
  }
  return new ApiError(
    status,
    'http_error',
    t('The server answered with an error ({status}).', { status }),
  );
}

/** A message for people, for any error a request can throw. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return t('Something went wrong. Please try again.');
  switch (error.code) {
    case NETWORK_ERROR:
      return t('Cannot reach the server. Check your connection and try again.');
    case TIMEOUT:
      return t('The server took too long to answer. Please try again.');
    case BAD_RESPONSE:
      return t('The server sent an answer we did not understand. Please try again.');
    case 'invalid_request':
      return t('Please check the highlighted fields.');
    default:
      return error.message;
  }
}

export interface FormErrors<F extends string> {
  fields: Partial<Record<F, string>>;
  /** For the whole form, when the error does not belong to one field. */
  message: string | null;
}

/**
 * Splits an error between a form's fields and the form as a whole.
 * `codeFields` names the field that an error code is about (e.g. `username_taken` → `username`).
 */
export function formErrors<F extends string>(
  error: unknown,
  formFields: readonly F[],
  codeFields: Partial<Record<string, F>> = {},
): FormErrors<F> {
  const fields: Partial<Record<F, string>> = {};
  if (!(error instanceof ApiError)) return { fields, message: describeError(error) };
  const own = codeFields[error.code];
  if (own !== undefined) {
    fields[own] = error.message;
    return { fields, message: null };
  }
  const known = new Set<string>(formFields);
  let unplaced = error.fields.length === 0;
  for (const { field, problem } of error.fields) {
    if (known.has(field)) fields[field as F] ??= problem;
    else unplaced = true;
  }
  return { fields, message: unplaced ? describeError(error) : null };
}
