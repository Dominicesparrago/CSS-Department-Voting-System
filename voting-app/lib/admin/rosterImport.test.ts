import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildRosterTemplateCsv,
  classifyRosterRows,
  identityKey,
  normalizeEligible,
  normalizeEmail,
  normalizeFullName,
  normalizeRosterRow,
  normalizeSection,
  normalizeStatus,
  namesMatch,
  normalizeStudentNo,
  normalizeYearLevel,
  parseRosterFile,
  rosterToCsv,
  splitNameForExport,
  sectionFromSheetName,
  validateRosterRow,
} from './rosterImport';

describe('roster normalization (mirrors server rosterLogic.js)', () => {
  it('normalizes student numbers', () => {
    expect(normalizeStudentNo(' 2026-0001 ')).toBe('20260001');
    expect(normalizeStudentNo(20260002)).toBe('20260002');
    expect(normalizeStudentNo(null)).toBe('');
  });

  it('canonicalizes sections', () => {
    expect(normalizeSection('BSCS 3-A')).toBe('BSCS-3A');
    expect(normalizeSection('bscs3a')).toBe('BSCS-3A');
    expect(normalizeSection('BSCS-3 A')).toBe('BSCS-3A');
    expect(normalizeSection('BSIT-3A')).toBe('');
    expect(normalizeSection('BSCS-5A')).toBe('');
  });

  it('accepts masterlist CS sheet names and derives section + year from them', () => {
    expect(normalizeSection('CS 1A')).toBe('BSCS-1A');
    expect(normalizeSection('CS1A')).toBe('BSCS-1A');
    expect(normalizeSection('CS-2B')).toBe('BSCS-2B');
    expect(normalizeSection('1A')).toBe('BSCS-1A');
    expect(normalizeSection('Sheet1')).toBe('');

    expect(sectionFromSheetName('CS 1A')).toEqual({ section: 'BSCS-1A', yearLevel: 1 });
    expect(sectionFromSheetName('CS 3B')).toEqual({ section: 'BSCS-3B', yearLevel: 3 });
    expect(sectionFromSheetName('BSCS 2-A')).toEqual({ section: 'BSCS-2A', yearLevel: 2 });
    expect(sectionFromSheetName('Summary')).toBeNull();
    expect(sectionFromSheetName('Sheet2')).toBeNull();
  });

  it('swaps Surname, Firstname into display order', () => {
    expect(normalizeFullName('Dela Cruz, Juan')).toBe('Juan Dela Cruz');
    expect(normalizeFullName('DELA CRUZ, JUAN A.')).toBe('JUAN A. DELA CRUZ');
    expect(normalizeFullName('Juan Dela Cruz')).toBe('Juan Dela Cruz');
  });

  it('keys rows by student number or section + normalized name', () => {
    expect(identityKey({ studentNo: '20260001' })).toBe('id:20260001');
    // same person with/without a middle initial resolves to the same key, so
    // re-imports never create a second entry that would make matching ambiguous
    expect(identityKey({ section: 'BSCS-1A', fullName: 'Juan Dela Cruz' })).toBe(
      identityKey({ section: 'BSCS-1A', fullName: 'JUAN A. DELA CRUZ' }),
    );
    expect(identityKey({ section: 'BSCS-1A', fullName: 'Juan Dela Cruz' })).toBe(
      identityKey({ section: 'BSCS-1A', fullName: 'Juan Dela Cruz Jr.' }),
    );
  });

  it('matches compound surname formatting consistently', () => {
    expect(namesMatch('Emerson De Guzman', 'DeGuzman, Emerson')).toBe(true);
    expect(namesMatch('Emerson De La Cruz', 'De La Cruz, Emerson')).toBe(true);
  });

  it('normalizes emails and placeholders', () => {
    expect(normalizeEmail(' JUAN.SCC@GMAIL.COM ')).toBe('juan.scc@gmail.com');
    expect(normalizeEmail('N/A')).toBe('');
    expect(normalizeEmail('not-an-email')).toBe('');
  });

  it('normalizes year levels', () => {
    expect(normalizeYearLevel(3)).toBe(3);
    expect(normalizeYearLevel('3rd Year')).toBe(3);
    expect(normalizeYearLevel('Year 4')).toBe(4);
    expect(normalizeYearLevel('Grade 12')).toBeNull();
    expect(normalizeYearLevel(5)).toBeNull();
  });

  it('maps status and eligibility words', () => {
    expect(normalizeStatus('Enrolled')).toBe('active');
    expect(normalizeStatus('Enlisted')).toBe('active');
    expect(normalizeStatus('Withdrawn')).toBe('inactive');
    expect(normalizeStatus('maybe')).toBeNull();
    expect(normalizeEligible('no')).toBe(false);
    expect(normalizeEligible('yes')).toBe(true);
    expect(normalizeEligible('sometimes')).toBeNull();
  });

  it('accepts a clean row and flags missing fields', () => {
    const row = normalizeRosterRow({
      studentNo: ' 2026-0001 ',
      fullName: '  Juan Dela Cruz ',
      section: 'BSCS 1-A',
      yearLevel: '1st Year',
      email: 'JUAN.DELACRUZ.SCC@GMAIL.COM',
      status: 'enrolled',
      eligible: 'yes',
    });
    expect(row).toEqual({
      studentNo: '20260001',
      fullName: 'Juan Dela Cruz',
      section: 'BSCS-1A',
      yearLevel: 1,
      email: 'juan.delacruz.scc@gmail.com',
      status: 'active',
      eligible: true,
    });
    expect(validateRosterRow(row)).toEqual([]);

    const broken = normalizeRosterRow({});
    // student number is optional for masterlist rows, so an empty row is
    // flagged only for the always-required fields
    expect(validateRosterRow(broken).length).toBeGreaterThanOrEqual(3);
  });
});

describe('namesMatch (mirrors server rosterLogic.js)', () => {
  it('accepts matching names with case, middle-name, and suffix variation', () => {
    expect(namesMatch('Juan Dela Cruz', 'Juan Dela Cruz')).toBe(true);
    expect(namesMatch('JUAN A. DELA CRUZ', 'juan dela cruz')).toBe(true);
    expect(namesMatch('Juan Dela Cruz', 'Juan Dela Cruz Jr.')).toBe(true);
  });

  it('rejects swapped or forged names', () => {
    expect(namesMatch('Maria Santos', 'Juan Dela Cruz')).toBe(false);
    expect(namesMatch('Cruz Juan', 'Juan Dela Cruz')).toBe(false);
    expect(namesMatch('', 'Juan Dela Cruz')).toBe(false);
  });
});

describe('classifyRosterRows', () => {
  it('separates valid, invalid, and duplicate rows', () => {
    const result = classifyRosterRows([
      { studentNo: '20260001', fullName: 'One', section: 'BSCS-1A', yearLevel: 1, status: 'active', eligible: true },
      { studentNo: '20260001', fullName: 'Duplicate', section: 'BSCS-1A', yearLevel: 1, status: 'active', eligible: true },
      { studentNo: '20260002', fullName: 'Two', section: 'BSCS 2-B', yearLevel: 2, status: 'active', eligible: true },
      { studentNo: 'bad', fullName: 'Three', section: 'BSCS-3A', yearLevel: 3, status: 'active', eligible: true },
    ]);
    expect(result.total).toBe(4);
    expect(result.valid).toBe(2);
    expect(result.duplicates).toBe(1);
    expect(result.invalid).toBe(1);
    expect(result.rejected).toBe(2);
    expect(result.rows.map((r) => r.studentNo)).toEqual(['20260001', '20260002']);
    expect(result.rows[1].section).toBe('BSCS-2B');
  });
});

describe('parseRosterFile (real workbook)', () => {
  function workbookFile(rows: unknown[][], type = 'xlsx'): File {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'array', bookType: type as XLSX.BookType });
    return new File([buffer], `roster.${type}`, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  function masterlistFile(sheets: Record<string, unknown[][]>): File {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    }
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new File([buffer], 'masterlist.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  it('parses a masterlist: one sheet per section, Name in Surname, Firstname order, no IDs', async () => {
    const file = masterlistFile({
      'CS 1A': [
        ['Name', 'Status'],
        ['Dela Cruz, Juan', 'Enrolled'],
        ['Santos, Maria', 'Enlisted'],
      ],
      'CS 2B': [
        ['Name', 'Status'],
        ['Reyes, Pedro', 'Enrolled'],
      ],
    });
    const { rows, parsedRows } = await parseRosterFile(file);
    expect(parsedRows).toBe(3);
    expect(rows[0]).toEqual({
      studentNo: '',
      fullName: 'Juan Dela Cruz',
      section: 'BSCS-1A',
      yearLevel: 1,
      email: undefined,
      status: 'active',
      eligible: true,
    });
    expect(rows[1].fullName).toBe('Maria Santos');
    expect(rows[1].section).toBe('BSCS-1A');
    expect(rows[2].section).toBe('BSCS-2B');
    expect(rows[2].yearLevel).toBe(2);
  });

  it('prefers an explicit Section column over the sheet name', async () => {
    const file = masterlistFile({
      'CS 1A': [
        ['Name', 'Section', 'Year Level'],
        ['Dela Cruz, Juan', 'BSCS 4-C', '4'],
      ],
    });
    const { rows } = await parseRosterFile(file);
    expect(rows[0].section).toBe('BSCS-4C');
    expect(rows[0].yearLevel).toBe(4);
  });

  it('skips cover sheets and throws when a roster sheet lacks section + year', async () => {
    const withCover = masterlistFile({
      Summary: [['Total students', '120']],
      'CS 1A': [['Name'], ['Dela Cruz, Juan']],
    });
    const { rows } = await parseRosterFile(withCover);
    expect(rows).toHaveLength(1);
    expect(rows[0].section).toBe('BSCS-1A');

    const bad = masterlistFile({
      'NotASection': [['Name'], ['Dela Cruz, Juan']],
    });
    await expect(parseRosterFile(bad)).rejects.toThrow(/NotASection/);
  });

  it('accepts files without a Student ID column at all', async () => {
    const file = workbookFile([
      ['Name', 'Section', 'Year Level'],
      ['Dela Cruz, Juan', 'CS 1A', '1'],
    ]);
    const { rows } = await parseRosterFile(file);
    expect(rows[0].studentNo).toBe('');
    expect(rows[0].section).toBe('BSCS-1A');
  });

  it('parses rows via flexible header aliases and normalizes values', async () => {
    const file = workbookFile([
      ['Student ID', 'Full Name', 'Section', 'Year Level', 'School Email', 'Status', 'Eligible'],
      ['20260001', 'Juan Dela Cruz', 'BSCS 1-A', '1', 'juan.delacruz.scc@gmail.com', 'active', 'yes'],
      ['20260002', 'Maria Santos', 'BSCS-2B', '2', 'maria.santos.scc@gmail.com', 'enrolled', 'yes'],
    ]);
    const { rows, parsedRows } = await parseRosterFile(file);
    expect(parsedRows).toBe(2);
    expect(rows[0]).toEqual({
      studentNo: '20260001',
      fullName: 'Juan Dela Cruz',
      section: 'BSCS-1A',
      yearLevel: 1,
      email: 'juan.delacruz.scc@gmail.com',
      status: 'active',
      eligible: true,
    });
    expect(rows[1].section).toBe('BSCS-2B');
  });

  it('throws a clear error when required columns are missing', async () => {
    const file = workbookFile([
      ['Name', 'Email'],
      ['Juan', 'juan.delacruz.scc@gmail.com'],
    ]);
    await expect(parseRosterFile(file)).rejects.toThrow(/missing required columns/);
  });

  it('parses CSV exports too', async () => {
    const file = workbookFile([
      ['Student ID', 'Full Name', 'Section', 'Year Level', 'Status', 'Eligible'],
      ['20260003', 'Pedro Reyes', 'BSCS-3A', '3', 'active', 'yes'],
    ], 'csv');
    const { rows } = await parseRosterFile(file);
    expect(rows[0].studentNo).toBe('20260003');
    expect(rows[0].section).toBe('BSCS-3A');
  });

  it('handles the real masterlist layout: title block, No./Name/Status header, footer markers, cover sheets', async () => {
    // Mirrors "BSCS SECTIONING 26-27.xlsx": each section sheet starts with a
    // title block, the real header (No. | Name | Status) sits a few rows down,
    // and the sheet ends with "***nothing follows***" / "As of ..." footers.
    const file = masterlistFile({
      'CS 1A': [
        ['BSCS 1A', '', '', 'FULL SECTION'],
        ['GC LINK:', '', '', ''],
        ['https://tinyurl.com/gcCS1A', '', '', ''],
        ['SCHEDULE: 7:00 AM - 10:00 AM', '', '', ''],
        ['No.', 'Name', 'Status', ''],
        [1, 'Abadilla, John Mark', 'Enrolled', ''],
        [2, 'Acupan, Gian Gahlen', 'Enlisted', ''],
        ['***nothing follows***', '', '', ''],
        ['As of 6:40 PM - Aug. 11, 2026', '', '', ''],
      ],
      'CS 2B': [
        ['BSCS 2B', '', '', 'FULL SECTION'],
        ['GC LINK:', '', '', ''],
        ['SCHEDULE: 10:00 AM - 1:00 PM', '', '', ''],
        ['No.', 'Name', 'Status', ''],
        [1, 'Abdulla, Princess Ryza', 'Enrolled', ''],
        ['***nothing follows***', '', '', ''],
        ['As of 6:40 PM - Aug. 11, 2026', '', '', ''],
      ],
      SUMMARY: [
        ['BSCS ENROLLMENT', '', '', ''],
        ['SECTION', 'TOTAL NO. OF ENROLLED', 'TOTAL NO. OF ENLISTED', 'TOTAL NO. OF STUDENTS'],
        ['BSCS 1A', 49, 1, 50],
      ],
      Sheet8: [
        ['', '', '', ''],
        ['BSCS ENROLLMENT (ALL STUDENTS from Sectioning)', '', '', ''],
        ['SECTION', 'TOTAL NO. OF STUDENTS', 'TOTAL NO. OF ENROLLED', 'TOTAL NO. OF ENLISTED ONLY'],
        ['BSCS 1A', 45, 44, 1],
      ],
    });
    const { rows, parsedRows } = await parseRosterFile(file);
    expect(parsedRows).toBe(3);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      studentNo: '',
      fullName: 'John Mark Abadilla',
      section: 'BSCS-1A',
      yearLevel: 1,
      email: undefined,
      status: 'active',
      eligible: true,
    });
    expect(rows[1].fullName).toBe('Gian Gahlen Acupan');
    expect(rows[1].status).toBe('active'); // Enlisted → active
    expect(rows[2].section).toBe('BSCS-2B');
    expect(rows[2].yearLevel).toBe(2);
    // Cover/aggregate sheets contribute no rows, and the "No." column is not
    // mistaken for a Student ID column.
    expect(rows.every((r) => r.studentNo === '')).toBe(true);
  });

  it('ignores a leading title block and numeric No. column when the header is not at row 0', async () => {
    const file = masterlistFile({
      'CS 1A': [
        ['BSCS 1A', '', '', 'FULL SECTION'],
        ['No.', 'Name', 'Status'],
        [1, 'Dela Cruz, Juan', 'Enrolled'],
        [2, 'Santos, Maria', 'Enlisted'],
        ['***nothing follows***', '', ''],
        ['As of 6:40 PM - Aug. 11, 2026', '', ''],
      ],
    });
    const { rows } = await parseRosterFile(file);
    expect(rows).toHaveLength(2);
    expect(rows[0].fullName).toBe('Juan Dela Cruz');
    expect(rows[0].section).toBe('BSCS-1A');
    expect(rows[0].studentNo).toBe('');
    expect(rows[1].fullName).toBe('Maria Santos');
  });

  it('combines separate Surname and Firstname columns, including compound surnames', async () => {
    const file = workbookFile([
      ['Surname', 'Firstname', 'Section', 'Year'],
      ['Del Rosario', 'John Paul', 'BSCS-1A', '1'],
    ]);
    const { rows } = await parseRosterFile(file);
    expect(rows[0].fullName).toBe('John Paul Del Rosario');
    expect(namesMatch('John Paul Del Rosario', rows[0].fullName)).toBe(true);
  });
});

describe('roster export and template', () => {
  const students = [
    { id: '20260001', studentNo: '20260001', fullName: 'Juan, Dela Cruz', section: 'BSCS-1A', yearLevel: 1, status: 'active', eligible: true },
  ] as const;

  it('builds a header + example template', () => {
    const csv = buildRosterTemplateCsv();
    expect(csv.split('\n')[0]).toContain('Student ID');
    expect(csv.split('\n')[0]).toContain('Section');
    expect(csv.split('\n')[1]).toContain('BSCS-1A');
  });

  it('exports roster rows with participation and escaped cells', () => {
    const csv = rosterToCsv([...students] as never, (student) => student.studentNo === '20260001');
    const lines = csv.split('\n');
    // Project convention: every CSV cell is quoted (same as votersToCsv).
    expect(lines[0]).toBe('"studentNo","surname","firstName","section","yearLevel","email","status","eligible","participated"');
    expect(lines[1]).toContain('"Dela Cruz","Juan"');
    expect(lines[1]).toContain('"voted"');
  });

  it('splits exported names into surname and first name', () => {
    expect(splitNameForExport('Juan Dela Cruz')).toEqual({ surname: 'Dela Cruz', firstName: 'Juan' });
    expect(splitNameForExport('Dela Cruz, Juan')).toEqual({ surname: 'Dela Cruz', firstName: 'Juan' });
  });
});
