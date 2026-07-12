import { describe, expect, it } from 'vitest';
import { initials } from './initials';

describe('initials', () => {
  it('takes the first letter of the first two words, uppercased', () => {
    expect(initials('Juan Dela Cruz')).toBe('JD');
    expect(initials('maria santos')).toBe('MS');
  });

  it('handles single words and messy whitespace', () => {
    expect(initials('Andrea')).toBe('A');
    expect(initials('  Juan   Cruz  ')).toBe('JC');
  });

  it('falls back to CS (or a custom fallback) when empty', () => {
    expect(initials('')).toBe('CS');
    expect(initials('   ')).toBe('CS');
    expect(initials('', 'AD')).toBe('AD');
  });
});
