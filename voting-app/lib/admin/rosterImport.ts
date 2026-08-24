import * as XLSX from '@/vendor/xlsx-0.20.3/xlsx.mjs';
import type { RosterImportRow, RosterStudent } from '../types';

/**
 * Browser-side official-roster import. The admin picks an Excel/CSV file; this
 * module parses it, normalizes each row, and pre-validates for fast feedback.
 * The normalized rows are then sent to the trusted importRoster Cloud Function,
 * which re-validates everything authoritatively and writes `students/{studentNo}`.
 *
 * Normalization rules mirror firebase/functions/rosterLogic.js so client
 * pre-validation and server enforcement agree.
 */

const STUDENT_NO_PATTERN = /^[0-9]{7,9}$/;
// Canonical section format app-wide: BSCS-<year><letter>. Accepts spreadsheet
// variants including the short masterlist form "CS 1A" / "CS1A".
const SECTION_PATTERN = /^(?:(?:BSCS|CS)[\s-]*)?([1-4])[\s-]*([A-Za-z])$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ACTIVE_STATUS_WORDS = new Set(['active', 'enrolled', 'enlisted', 'current', 'yes', 'y', '1', 'true']);
const INACTIVE_STATUS_WORDS = new Set(['inactive', 'not enrolled', 'withdrawn', 'no', 'n', '0', 'false']);
const ELIGIBLE_WORDS = new Set(['eligible', 'yes', 'y', '1', 'true']);
const INELIGIBLE_WORDS = new Set(['ineligible', 'no', 'n', '0', 'false']);

/** Common name suffixes tolerated when comparing a registered name against the roster. */
const NAME_SUFFIXES = new Set(['jr', 'sr', 'jnr', 'snr', 'ii', 'iii', 'iv', 'v']);
const SURNAME_PARTICLES = new Set(['de', 'del', 'dela', 'la', 'van', 'von', 'bin', 'ibn']);

/** Flexible header aliases (normalized to lowercase alphanumerics). */
const HEADER_ALIASES: Record<keyof Pick<RosterImportRow, 'studentNo' | 'fullName' | 'section' | 'yearLevel' | 'email' | 'status' | 'eligible'>, string[]> = {
  studentNo: ['studentno', 'studentid', 'studentnumber', 'idnumber', 'idno', 'studentno', 'id', 'lrn'],
  fullName: ['fullname', 'fullnameofstudent', 'studentfullname', 'completename', 'studentname', 'name'],
  section: ['section', 'sectionclass', 'classsection', 'class', 'classroom'],
  yearLevel: ['yearlevel', 'year', 'gradelevel', 'grade', 'level', 'yeargrade'],
  email: ['email', 'emailaddress', 'schoolemail', 'studentemail', 'accountemail', 'emailaddressofstudent'],
  status: ['status', 'activestatus', 'currentstatus', 'enrollmentstatus', 'recordstatus', 'studentstatus'],
  eligible: ['eligible', 'eligibility', 'eligibilitystatus', 'votereligible', 'electioneligible'],
};

// A Student ID column is optional: masterlist workbooks without one produce
// name-matched roster entries. The rest are required (section/year may come
// from the sheet name instead of a column — enforced per sheet in parseRosterFile).
const REQUIRED_FIELDS: Array<keyof typeof HEADER_ALIASES> = ['fullName'];

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  const text = String(value).trim().toLowerCase();
  return text === '' || text === '-' || text === 'n/a' || text === 'none';
}

/** Student IDs are 7-9 digits; strip punctuation/spacing but keep digits. */
export function normalizeStudentNo(value: unknown): string {
  if (value == null) return '';
  return String(value).trim().replace(/\D/g, '');
}

/** Canonical section, or '' when the value is not a recognizable BSCS section. */
export function normalizeSection(value: unknown): string {
  if (value == null) return '';
  const match = SECTION_PATTERN.exec(String(value).trim());
  if (!match) return '';
  return `BSCS-${match[1]}${match[2].toUpperCase()}`;
}

/**
 * Masterlist workbooks use one sheet per section, named e.g. "CS 1A", "CS 2B"
 * (BSCS-<year><letter> with the BSCS prefix shortened to CS). Returns the
 * canonical section + year level, or null when the sheet name is not one.
 */
export function sectionFromSheetName(sheetName: string): { section: string; yearLevel: number } | null {
  const match = /^(?:(?:BSCS|CS)[\s-]*)?([1-4])[\s-]*([A-Za-z])$/i.exec(String(sheetName).trim());
  if (!match) return null;
  return { section: `BSCS-${match[1]}${match[2].toUpperCase()}`, yearLevel: Number(match[1]) };
}

/**
 * Full name in canonical display order. Masterlists often write names as
 * "Surname, Firstname" — swapped to "Firstname Surname" so namesMatch's
 * first/last token comparison stays order-consistent with voter registrations.
 */
export function normalizeFullName(value: unknown): string {
  if (value == null) return '';
  const text = String(value).trim().replace(/\s+/g, ' ');
  if (!text) return '';
  const comma = text.indexOf(',');
  if (comma > 0) {
    const surname = text.slice(0, comma).trim();
    const given = text.slice(comma + 1).trim();
    if (surname && given) return `${given} ${surname}`;
  }
  return text;
}

/**
 * Stable identity key for deduplication: student-number rows key by ID;
 * masterlist rows (no student number) key by section + significant name tokens
 * (mirrors firebase/functions/rosterLogic.js).
 */
export function identityKey(record: { studentNo?: string; section?: string; fullName?: string }): string {
  if (record.studentNo) return `id:${record.studentNo}`;
  const name = significantNameTokens(record.fullName).join(' ');
  return `name:${record.section ?? ''}|${name}`;
}

/** School email, lowercased; '' when absent/unrecognizable. */
export function normalizeEmail(value: unknown): string {
  if (isEmptyValue(value)) return '';
  const email = String(value).trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : '';
}

/** Year level 1-4 as a number, or null when unrecognizable. */
export function normalizeYearLevel(value: unknown): number | null {
  if (isEmptyValue(value)) return null;
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= 4 ? value : null;
  }
  const digits = String(value).replace(/\D/g, '');
  if (!digits || digits.length !== 1) return null;
  const year = Number(digits);
  return year >= 1 && year <= 4 ? year : null;
}

/** 'active' | 'inactive', or null when the status column holds an unknown value. */
export function normalizeStatus(value: unknown): 'active' | 'inactive' | null {
  if (isEmptyValue(value)) return 'active';
  const text = String(value).trim().toLowerCase();
  if (ACTIVE_STATUS_WORDS.has(text)) return 'active';
  if (INACTIVE_STATUS_WORDS.has(text)) return 'inactive';
  return null;
}

/** boolean, or null when the eligibility column holds an unknown value. */
export function normalizeEligible(value: unknown): boolean | null {
  if (isEmptyValue(value)) return true;
  const text = String(value).trim().toLowerCase();
  if (ELIGIBLE_WORDS.has(text)) return true;
  if (INELIGIBLE_WORDS.has(text)) return false;
  return null;
}

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeName(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Name tokens that carry identity (single-letter initials and suffixes dropped). */
function significantNameTokens(value: unknown): string[] {
  return normalizeName(value)
    .split(' ')
    .filter((token) => token.length > 1 && !NAME_SUFFIXES.has(token));
}

/**
 * First + last significant name tokens must agree (case/punctuation/middle-name
 * and suffix tolerant). Mirrors firebase/functions/rosterLogic.js — the server
 * is authoritative; this only drives the early denial UX.
 */
export function namesMatch(registered: string, roster: string): boolean {
  const a = significantNameTokens(normalizeFullName(registered));
  const b = significantNameTokens(normalizeFullName(roster));
  if (a.length === 0 || b.length === 0) return false;
  if (a[0] !== b[0]) return false;
  const surnameKey = (tokens: string[]) => {
    let start = tokens.length - 1;
    while (start > 0 && SURNAME_PARTICLES.has(tokens[start - 1])) start -= 1;
    return tokens.slice(start).join('');
  };
  return surnameKey(a) === surnameKey(b);
}

/** Normalize one raw roster row into its canonical shape. */
export function normalizeRosterRow(raw: Record<string, unknown>): {
  studentNo: string;
  fullName: string;
  section: string;
  yearLevel: number | null;
  email: string;
  status: 'active' | 'inactive' | null;
  eligible: boolean | null;
} {
  const source = raw && typeof raw === 'object' ? raw : {};
  const rawId = source.studentNo == null ? '' : String(source.studentNo).trim();
  const studentNo = normalizeStudentNo(rawId);
  return {
    // A non-blank student number that does not normalize to a valid ID is kept
    // raw so validateRosterRow can reject it — an invalid record must not be
    // silently demoted into an eligible name-matched row.
    studentNo: rawId && !STUDENT_NO_PATTERN.test(studentNo) ? rawId : studentNo,
    fullName: normalizeFullName(source.fullName),
    section: normalizeSection(source.section),
    yearLevel: normalizeYearLevel(source.yearLevel),
    email: normalizeEmail(source.email),
    status: normalizeStatus(source.status),
    eligible: normalizeEligible(source.eligible),
  };
}

/** Human-readable problems with a normalized row; empty means the row is valid. */
export function validateRosterRow(row: ReturnType<typeof normalizeRosterRow>): string[] {
  const errors: string[] = [];
  // Student number is optional (masterlists often have no ID column); when one
  // IS present it must be a valid 7-9 digit number.
  if (row.studentNo && !STUDENT_NO_PATTERN.test(row.studentNo)) errors.push('Invalid student ID (7-9 digits).');
  if (!row.fullName || row.fullName.length < 2) errors.push('Full name is required.');
  if (!row.section) errors.push('Invalid section (expected BSCS-<year><letter>, e.g. BSCS-3A).');
  if (row.yearLevel === null) errors.push('Invalid year level (expected 1-4).');
  if (row.status === null) errors.push('Unrecognized status value.');
  if (row.eligible === null) errors.push('Unrecognized eligibility value.');
  return errors;
}

export interface RosterPreflight {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  rejected: number;
  rows: RosterImportRow[];
  errors: Array<{ row: number; studentNo?: string; reason: string }>;
}

/** Pre-validate parsed rows client-side (the server re-validates authoritatively). */
export function classifyRosterRows(rows: RosterImportRow[]): RosterPreflight {
  const result: RosterPreflight = {
    total: rows.length,
    valid: 0,
    invalid: 0,
    duplicates: 0,
    rejected: 0,
    rows: [],
    errors: [],
  };
  const seen = new Set<string>();

  rows.forEach((raw, index) => {
    const rowNumber = index + 2; // spreadsheet row number (1 is the header)
    const normalized = normalizeRosterRow(raw as unknown as Record<string, unknown>);
    const problems = validateRosterRow(normalized);
    if (problems.length > 0) {
      result.invalid += 1;
      result.rejected += 1;
      result.errors.push({ row: rowNumber, studentNo: normalized.studentNo || undefined, reason: problems.join(' ') });
      return;
    }
    const key = identityKey(normalized);
    if (seen.has(key)) {
      result.duplicates += 1;
      result.rejected += 1;
      result.errors.push({ row: rowNumber, studentNo: normalized.studentNo || undefined, reason: 'Duplicate student record in this file.' });
      return;
    }
    seen.add(key);
    result.valid += 1;
    result.rows.push({
      studentNo: normalized.studentNo,
      fullName: normalized.fullName,
      section: normalized.section,
      yearLevel: normalized.yearLevel as number,
      email: normalized.email || undefined,
      status: normalized.status as 'active' | 'inactive',
      eligible: normalized.eligible as boolean,
    });
  });

  return result;
}

function normalizeHeader(header: unknown): string {
  return String(header ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Parse an Excel/CSV roster file into normalized rows. Throws a clear,
 * admin-friendly Error for unreadable files or missing required columns.
 *
 * Supports two layouts:
 * - Flat file with a Student ID column (rows keyed by student number).
 * - Masterlist workbooks: one sheet per section (e.g. "CS 1A", "CS 2B"), where
 *   the sheet name supplies section + year level and the Name column is in
 *   "Surname, Firstname" order. Sheets without a Student ID column become
 *   name-matched roster entries.
 */
export async function parseRosterFile(file: File): Promise<{ rows: RosterImportRow[]; parsedRows: number }> {
  let workbook: any;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch {
    throw new Error('Unable to read this file. Save it as an Excel (.xlsx/.xls) or CSV file and try again.');
  }

  if (!workbook.SheetNames.length) throw new Error('The file has no worksheet to import.');

  const rows: RosterImportRow[] = [];
  let parsedRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // Raw grid (no header assumption): masterlist sheets start with a title
    // block (section name, GC link, schedule) before the real header row, so
    // the header must be located by scanning, not assumed at row 0.
    const grid = (XLSX.utils.sheet_to_json as unknown as (s: unknown, o: unknown) => unknown[][])(sheet, { header: 1, defval: '' });
    if (grid.length === 0) continue;
    const derived = sectionFromSheetName(sheetName);

    // Find the first row that carries a recognizable Name or Student ID header.
    let headerIndex = -1;
    for (let i = 0; i < grid.length; i++) {
      const row = grid[i];
      const normalized = row.map((cell) => normalizeHeader(cell));
      const hasName = normalized.some((h) => HEADER_ALIASES.fullName.includes(h));
      const hasStudentNo = normalized.some((h) => HEADER_ALIASES.studentNo.includes(h));
      if (hasName || hasStudentNo) {
        headerIndex = i;
        break;
      }
    }

    // Cover / instructions / aggregate sheets (no Name or Student ID header)
    // are skipped — e.g. the "SUMMARY" and "Sheet8" pages of the masterlist.
    if (headerIndex === -1) continue;

    // Map headers by normalized alias; the first matching alias wins per field.
    const headerRow = grid[headerIndex] as unknown[];
    const headerToIndex = new Map<string, number>();
    headerRow.forEach((header, index) => {
      const normalized = normalizeHeader(header);
      if (normalized && !headerToIndex.has(normalized)) headerToIndex.set(normalized, index);
    });

    const columnMap: Record<string, string> = {};
    (Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>).forEach((field) => {
      for (const alias of HEADER_ALIASES[field]) {
        if (headerToIndex.has(alias)) {
          columnMap[field] = alias;
          break;
        }
      }
    });

    if (!columnMap.fullName && !columnMap.studentNo) continue;

    const missing: string[] = [];
    if (!columnMap.fullName) missing.push('Full Name');
    // Section + year level come from a column OR the sheet name ("CS 1A").
    if (!columnMap.section && !derived) missing.push('Section');
    if (!columnMap.yearLevel && !derived) missing.push('Year Level');
    if (missing.length > 0) {
      throw new Error(
        `Sheet "${sheetName}" is missing required columns (${missing.join(', ')}). ` +
        (derived ? '' : 'Name its sheet like CS 1A to supply section and year, or add the columns. '),
      );
    }

    const columnCount = headerRow.length;
    // Skip junk rows: the title block (already passed), empty rows, and footer
    // markers like "***nothing follows***" / "As of ..." at the end of each
    // masterlist sheet.
    const isFooterMarker = (cell: unknown): boolean => {
      const text = String(cell ?? '').trim().toLowerCase();
      return text.startsWith('***') || text.startsWith('as of ');
    };
    for (let r = headerIndex + 1; r < grid.length; r++) {
      const record = grid[r];
      if (!Array.isArray(record)) continue;
      if (record.every((cell) => String(cell ?? '').trim() === '')) continue;
      const read = (field: keyof typeof HEADER_ALIASES): unknown => {
        const alias = columnMap[field];
        const index = alias ? headerToIndex.get(alias) ?? -1 : -1;
        return index >= 0 && index < columnCount ? record[index] : undefined;
      };
      const rawName = read('fullName');
      if (rawName == null || String(rawName).trim() === '' || isFooterMarker(rawName)) continue;
      const rawSection = read('section');
      const rawYear = read('yearLevel');
      // Explicit column wins; blank cells fall back to the sheet-derived value.
      const sectionValue = rawSection != null && String(rawSection).trim() !== '' ? rawSection : (derived?.section ?? '');
      const yearValue = normalizeYearLevel(rawYear) ?? derived?.yearLevel ?? null;
      const normalized = normalizeRosterRow({
        studentNo: read('studentNo'),
        fullName: rawName,
        section: sectionValue,
        yearLevel: yearValue,
        email: read('email'),
        status: read('status'),
        eligible: read('eligible'),
      });
      rows.push({
        studentNo: normalized.studentNo,
        fullName: normalized.fullName,
        section: normalized.section,
        yearLevel: normalized.yearLevel ?? 0,
        email: normalized.email || undefined,
        status: normalized.status === 'inactive' ? 'inactive' : 'active',
        eligible: normalized.eligible === false ? false : true,
      });
      parsedRows += 1;
    }
  }

  if (rows.length === 0) throw new Error('The file has no data rows to import.');
  return { rows, parsedRows };
}

/** CSV template with headers + one example row for admins preparing roster files. */
export function buildRosterTemplateCsv(): string {
  const header = ['Student ID', 'Full Name', 'Section', 'Year Level', 'School Email', 'Status', 'Eligible'];
  const example = ['20260001', 'Juan Dela Cruz', 'BSCS-1A', '1', 'juan.delacruz.scc@gmail.com', 'active', 'yes'];
  return [header.join(','), example.join(',')].join('\n');
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/** Roster export for admins: identity + eligibility + participation columns. */
export function rosterToCsv(students: RosterStudent[], participated: (student: RosterStudent) => boolean): string {
  const header = ['studentNo', 'fullName', 'section', 'yearLevel', 'email', 'status', 'eligible', 'participated'];
  const rows = students.map((student) => [
    student.studentNo ?? '',
    student.fullName,
    student.section,
    student.yearLevel,
    student.email ?? '',
    student.status,
    student.eligible ? 'yes' : 'no',
    participated(student) ? 'voted' : 'not yet',
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}
