/**
 * Dates, times and amounts in the player's language, made here rather than by `Intl` or
 * `toLocale…String`: the apps' engine (Hermes) formats through each phone's own Android or iOS
 * libraries, which differ from the browser's and have crashed the app in some languages. Month
 * names and the order of day, month and year are in the catalogs, like any other text, so every
 * platform shows the same thing. Digits stay Latin in every language, as the app writes them.
 */
import { mark, t } from '.';

const MONTHS = [
  mark('January'),
  mark('February'),
  mark('March'),
  mark('April'),
  mark('May'),
  mark('June'),
  mark('July'),
  mark('August'),
  mark('September'),
  mark('October'),
  mark('November'),
  mark('December'),
];

const SHORT_MONTHS = [
  mark('Jan'),
  mark('Feb'),
  mark('Mar'),
  mark('Apr'),
  mark('May'),
  mark('Jun'),
  mark('Jul'),
  mark('Aug'),
  mark('Sept'),
  mark('Oct'),
  mark('Nov'),
  mark('Dec'),
];

interface DateOptions {
  /** "March" or "Mar". */
  month?: 'long' | 'short';
  /** With the day ("3 Oct 2026"), or only the month and year ("October 2026"). */
  day?: boolean;
  /** On the UTC calendar, rather than the device's own time zone. */
  utc?: boolean;
}

/** "3 Oct 2026", "3 October 2026" or "October 2026", in the current language. */
export function dateText(
  date: Date,
  { month = 'short', day = true, utc = false }: DateOptions = {},
): string {
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  const index = utc ? date.getUTCMonth() : date.getMonth();
  const name = t((month === 'long' ? MONTHS : SHORT_MONTHS)[index] ?? '');
  if (!day) return t('{month} {year}', { month: name, year });
  return t('{day} {month} {year}', {
    day: utc ? date.getUTCDate() : date.getDate(),
    month: name,
    year,
  });
}

/** "09:05", on the 24-hour clock. */
export function timeText(date: Date, { utc = false }: { utc?: boolean } = {}): string {
  const hours = utc ? date.getUTCHours() : date.getHours();
  const minutes = utc ? date.getUTCMinutes() : date.getMinutes();
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * An amount with up to two decimals, grouped the Indian way ("12,34,567.5"), as rupees are
 * written in India in every language the app speaks.
 */
export function amountText(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const [whole = '0', fraction = ''] = (Math.round(Math.abs(amount) * 100) / 100)
    .toString()
    .split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ',');
  return `${sign}${rest === '' ? last3 : `${rest},${last3}`}${fraction === '' ? '' : `.${fraction}`}`;
}
