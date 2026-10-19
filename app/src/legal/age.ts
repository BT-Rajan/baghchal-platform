/**
 * The age rules, as the server applies them (server legal/age.py): at least 13 to play, and
 * under 18 a parent or guardian must agree. We ask only the month and year of birth and count
 * the youngest age they could mean, so the form can say what happens before it is sent.
 */

export const MIN_AGE = 13;
export const ADULT_AGE = 18;
const OLDEST = 120;

export type AgeAnswer =
  | { kind: 'incomplete' }
  | { kind: 'invalid' }
  | { kind: 'tooYoung' }
  | { kind: 'minor' }
  | { kind: 'adult' };

/** The first instant someone born in that month is surely `age`. */
export function surely(year: number, month: number, age: number): Date {
  return new Date(Date.UTC(year + age + (month === 12 ? 1 : 0), month === 12 ? 0 : month, 1));
}

/** What the month and year typed so far mean (`month` 1–12). */
export function classify(monthText: string, yearText: string, now: Date): AgeAnswer {
  if (monthText.trim() === '' || yearText.trim().length < 4) return { kind: 'incomplete' };
  const month = Number(monthText);
  const year = Number(yearText);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    return { kind: 'invalid' };
  }
  if (surely(year, month, 0) > now || surely(year, month, OLDEST) < now) {
    return { kind: 'invalid' };
  }
  if (surely(year, month, MIN_AGE) > now) return { kind: 'tooYoung' };
  return surely(year, month, ADULT_AGE) > now ? { kind: 'minor' } : { kind: 'adult' };
}

/** `YYYY-MM`, as the server takes it. */
export function birthMonth(monthText: string, yearText: string): string {
  return `${yearText.trim()}-${monthText.trim().padStart(2, '0')}`;
}
