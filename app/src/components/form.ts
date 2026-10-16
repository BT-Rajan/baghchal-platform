import { useState } from 'react';

import { formErrors } from '@/api/errors';
import type { Problems } from '@/auth/validation';

/**
 * Error display for a form: the client's own checks first, then what the server said about the
 * last submission (`serverError`), split between fields and the form as a whole.
 */
export function useFormErrors<F extends string>(
  fields: readonly F[],
  serverError: unknown,
  codeFields: Partial<Record<string, F>> = {},
) {
  const [problems, setProblems] = useState<Problems<F>>({});
  const server = serverError ? formErrors(serverError, fields, codeFields) : null;
  const fieldError = (field: F): string | undefined => problems[field] ?? server?.fields[field];
  /** Records the client's checks; true when the form may be sent. */
  const accept = (found: Problems<F>): boolean => {
    setProblems(found);
    return Object.keys(found).length === 0;
  };
  return { fieldError, formMessage: server?.message ?? null, accept };
}
