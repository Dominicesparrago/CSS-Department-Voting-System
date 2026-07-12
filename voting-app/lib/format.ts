/** Shared, framework-free display formatting used by student, admin, and public views. */

const MANILA_LOCALE = 'en-PH';
const MANILA_TZ = 'Asia/Manila';

/** Firestore Timestamp | Date | unknown → localized date-time string ('' when absent). */
export function formatTimestamp(value: unknown): string {
  if (!value) return '';
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toLocaleString(MANILA_LOCALE, { timeZone: MANILA_TZ });
  }
  if (value instanceof Date) return value.toLocaleString(MANILA_LOCALE, { timeZone: MANILA_TZ });
  return String(value);
}

/** Firestore Timestamp | Date | unknown → epoch millis (0 when absent/unreadable). */
export function toMillis(value: unknown): number {
  if (!value) return 0;
  const v = value as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

const YEAR_LABELS: Record<number, string> = {
  1: '1st Year',
  2: '2nd Year',
  3: '3rd Year',
  4: '4th Year',
};

/** 1–4 → '1st Year'…'4th Year'; anything else → the given fallback. */
export function yearLabel(yearLevel: number | undefined, fallback = '—'): string {
  return (yearLevel && YEAR_LABELS[yearLevel]) || fallback;
}

export function firstName(fullName: string): string {
  return fullName.split(/\s+/).filter(Boolean)[0] || 'student';
}

export function percent(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}
