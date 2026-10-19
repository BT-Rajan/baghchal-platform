/**
 * The age and agreement every new account (and guest) gives: checked here as the server checks
 * it (server legal/age.py), so the form can say what is wrong before it is sent.
 */
import type { Problems } from '@/auth/validation';
import { emailProblem } from '@/auth/validation';

import { birthMonth, classify, MIN_AGE, type AgeAnswer } from './age';

export interface AgreementInput {
  month: string;
  year: string;
  parentEmail: string;
}

export const EMPTY_AGREEMENT: AgreementInput = { month: '', year: '', parentEmail: '' };

/** The fields as the server names them, so its errors land by the right one. */
export const AGREEMENT_FIELDS = ['birth_month', 'parent_email'] as const;
export type AgreementField = (typeof AGREEMENT_FIELDS)[number];

export const AGREEMENT_CODE_FIELDS = {
  invalid_birth_month: 'birth_month',
  too_young: 'birth_month',
  parent_email_required: 'parent_email',
  parent_email_is_yours: 'parent_email',
} as const;

/** What is sent: the month of birth, and a parent's address for a minor's account. */
export interface AgeDetails {
  /** Left out when the server already knows the age (a guest making their account). */
  birth_month?: string;
  parent_email?: string;
}

/** An age the server already has: a guest's, given when they started playing. */
export type KnownAge = 'adult' | 'minor';

/** Whether a parent's address is asked for: minors making an account, not guests. */
export function asksParent(answer: AgeAnswer, guest: boolean): boolean {
  return answer.kind === 'minor' && !guest;
}

export function checkAgreement(
  input: AgreementInput,
  now: Date,
  { guest, ownEmail, known }: { guest: boolean; ownEmail: string; known?: KnownAge },
): { problems: Problems<AgreementField>; details: AgeDetails | null } {
  const answer: AgeAnswer = known ? { kind: known } : classify(input.month, input.year, now);
  const problems: Problems<AgreementField> = {};
  if (answer.kind === 'incomplete')
    problems.birth_month = 'Enter the month and year you were born.';
  if (answer.kind === 'invalid')
    problems.birth_month = 'Please check your month and year of birth.';
  if (answer.kind === 'tooYoung') {
    problems.birth_month = `You must be at least ${MIN_AGE} to play on ClawPlay.`;
  }
  const parent = input.parentEmail.trim();
  if (asksParent(answer, guest)) {
    const problem =
      parent === '' ? "Enter your parent's or guardian's email address." : emailProblem(parent);
    if (problem !== undefined) problems.parent_email = problem;
    else if (parent.toLowerCase() === ownEmail.trim().toLowerCase()) {
      problems.parent_email = "Enter your parent's or guardian's address, not your own.";
    }
  }
  if (Object.keys(problems).length > 0) return { problems, details: null };
  const birth = known ? {} : { birth_month: birthMonth(input.month, input.year) };
  return {
    problems,
    details: asksParent(answer, guest) ? { ...birth, parent_email: parent } : birth,
  };
}

/** For a form that asked the age (sign-up, a guest's first game): the details, with it. */
export function withAge<T extends AgeDetails>(details: T): T & { birth_month: string } {
  const { birth_month } = details;
  if (birth_month === undefined) throw new Error('This form asks for the month of birth.');
  return { ...details, birth_month };
}
