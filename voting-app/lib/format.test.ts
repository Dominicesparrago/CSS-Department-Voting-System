import { describe, expect, it } from 'vitest';
import { firstName, formatTimestamp, percent, toMillis, yearLabel } from './format';

const MS = Date.UTC(2026, 8, 22, 4, 30); // 2026-09-22 12:30 in Manila (UTC+8)
const fakeTimestamp = { toDate: () => new Date(MS), toMillis: () => MS };

describe('formatTimestamp', () => {
  it('formats Firestore Timestamp-likes via toDate in Manila time', () => {
    const text = formatTimestamp(fakeTimestamp);
    expect(text).toContain('2026');
    expect(text).toContain('12:30');
  });

  it('formats plain Dates', () => {
    expect(formatTimestamp(new Date(MS))).toContain('2026');
  });

  it('returns empty string for null/undefined', () => {
    expect(formatTimestamp(null)).toBe('');
    expect(formatTimestamp(undefined)).toBe('');
  });

  it('stringifies unknown truthy values instead of throwing', () => {
    expect(formatTimestamp('pending')).toBe('pending');
  });
});

describe('toMillis', () => {
  it('prefers toMillis()', () => {
    expect(toMillis(fakeTimestamp)).toBe(MS);
  });

  it('falls back to toDate()', () => {
    expect(toMillis({ toDate: () => new Date(MS) })).toBe(MS);
  });

  it('handles Date instances and {seconds} shapes', () => {
    expect(toMillis(new Date(MS))).toBe(MS);
    expect(toMillis({ seconds: 12 })).toBe(12000);
  });

  it('returns 0 for absent or unreadable values', () => {
    expect(toMillis(null)).toBe(0);
    expect(toMillis(undefined)).toBe(0);
    expect(toMillis({})).toBe(0);
  });
});

describe('yearLabel', () => {
  it('maps 1–4 to ordinal labels', () => {
    expect(yearLabel(1)).toBe('1st Year');
    expect(yearLabel(2)).toBe('2nd Year');
    expect(yearLabel(3)).toBe('3rd Year');
    expect(yearLabel(4)).toBe('4th Year');
  });

  it('falls back to em dash by default and honors custom fallbacks', () => {
    expect(yearLabel(undefined)).toBe('—');
    expect(yearLabel(0)).toBe('—');
    expect(yearLabel(5, 'Year pending')).toBe('Year pending');
  });
});

describe('firstName', () => {
  it('takes the first whitespace-separated word', () => {
    expect(firstName('Juan Dela Cruz')).toBe('Juan');
    expect(firstName('  Maria   Santos ')).toBe('Maria');
  });

  it('falls back to "student" for empty names', () => {
    expect(firstName('')).toBe('student');
    expect(firstName('   ')).toBe('student');
  });
});

describe('percent', () => {
  it('rounds to the nearest integer', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(5, 5)).toBe(100);
  });

  it('returns 0 when the total is zero or negative', () => {
    expect(percent(3, 0)).toBe(0);
    expect(percent(3, -1)).toBe(0);
  });
});
