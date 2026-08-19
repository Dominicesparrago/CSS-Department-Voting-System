export const ELECTION_ID = 'css_department_election_2026';

/**
 * Section letters available per year level. Canonical section format app-wide
 * is BSCS-<year><letter> (e.g. BSCS-1A); the letters differ per year:
 * 1st yr A–J, 2nd yr A–H, 3rd yr A–F, 4th yr A–C.
 */
export const SECTION_LETTERS_BY_YEAR: Record<number, string[]> = {
  1: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
  2: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  3: ['A', 'B', 'C', 'D', 'E', 'F'],
  4: ['A', 'B', 'C'],
};

/** Section letters for a year level (empty when the year level is unknown). */
export function sectionLettersForYear(yearLevel: number): string[] {
  return SECTION_LETTERS_BY_YEAR[yearLevel] ?? [];
}
