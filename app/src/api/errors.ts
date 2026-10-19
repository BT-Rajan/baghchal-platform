export interface FieldProblem {
  field: string;
  problem: string;
}

/** An error from the API, or from failing to reach it. Branch on `code`, never on `message`. */
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

  /** The problem with one field of the request, if the server named one. */
  fieldProblem(field: string): string | undefined {
    return this.fields.find((f) => f.field === field)?.problem;
  }
}

/** Status 0: the request never got an answer from the server. */
export const NETWORK_ERROR = 'network_error';
export const TIMEOUT = 'timeout';
export const NOT_AUTHENTICATED = 'not_authenticated';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFields(value: unknown): FieldProblem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((f) =>
    isRecord(f) && typeof f.field === 'string' && typeof f.problem === 'string'
      ? [{ field: f.field, problem: f.problem }]
      : [],
  );
}

/** Builds an ApiError from a response body shaped `{"error": {"code", "message", ...}}`. */
export function errorFromBody(status: number, body: unknown): ApiError {
  const error = isRecord(body) ? body.error : undefined;
  if (isRecord(error) && typeof error.code === 'string' && typeof error.message === 'string') {
    return new ApiError(status, error.code, error.message, parseFields(error.fields));
  }
  return new ApiError(status, 'http_error', `The server answered ${status}.`);
}

/** A message fit to show the player. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === NETWORK_ERROR) return 'Cannot reach the server. Check your connection.';
    if (error.code === TIMEOUT) return 'The server took too long to answer. Try again.';
    return error.message;
  }
  return 'Something went wrong.';
}
