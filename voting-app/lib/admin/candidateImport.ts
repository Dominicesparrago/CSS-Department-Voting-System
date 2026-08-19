import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase/init';
import { ELECTION_ID } from '../constants';

/**
 * Candidate import (admin). The browser parses the CSV/XLSX file into raw rows
 * and sends them to the trusted importCandidates function, which re-validates
 * every row authoritatively before any write. This module only handles parsing
 * and preview; the function's summary is the source of truth.
 */

/** Header aliases accepted in candidate files, mapped to canonical row keys. */
const HEADER_ALIASES: Record<string, string> = {
  position: 'positionId',
  position_id: 'positionId',
  positionid: 'positionId',
  pos: 'positionId',
  name: 'name',
  candidate: 'name',
  candidate_name: 'name',
  section: 'section',
  year: 'yearLevel',
  year_level: 'yearLevel',
  yearlevel: 'yearLevel',
  yr: 'yearLevel',
  platform: 'platform',
  party: 'party',
  order: 'order',
  active: 'active',
};

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === '\t') {
      cells.push(current);
      current = '';
    } else if (ch === '\r') {
      // skip carriage returns inside or outside quotes
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

/**
 * Parse candidate CSV/TSV text into raw rows keyed by canonical field names.
 * Unrecognized headers are ignored; missing required fields are reported by the
 * server during import. Returns { rows, headerErrors }.
 */
export function parseCandidateCsv(text: string): { rows: Record<string, string>[]; headerErrors: string[] } {
  const lines = text.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], headerErrors: ['The file needs a header row followed by at least one data row.'] };
  }

  const headerCells = splitCsvLine(lines[0]);
  const columnKeys: (string | null)[] = headerCells.map((cell) => {
    const key = cell.trim().toLowerCase().replace(/\s+/g, '_');
    return HEADER_ALIASES[key] ?? null;
  });
  const mapped = headerCells.filter((_, i) => columnKeys[i]).length;
  const headerErrors: string[] = [];
  if (mapped === 0) {
    headerErrors.push('No recognized columns found. Expected at least: position, name, section, year level.');
  }
  const requiredPresent = new Set(['positionId', 'name', 'section', 'yearLevel']);
  columnKeys.forEach((key) => {
    if (key) requiredPresent.delete(key);
  });
  if (requiredPresent.size > 0) {
    headerErrors.push(`Missing column(s): ${[...requiredPresent].join(', ')}.`);
  }

  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    columnKeys.forEach((key, i) => {
      if (key && cells[i] !== undefined) row[key] = cells[i].trim();
    });
    return row;
  }).filter((row) => Object.keys(row).length > 0);

  return { rows, headerErrors };
}

export interface CandidateImportOutcome {
  total: number;
  inserted: number;
  updated: number;
  duplicates: number;
  invalid: number;
  rejected: number;
  errors: Array<{ row: number; reason: string }>;
}

/** Send parsed candidate rows to the trusted import function. */
export function importCandidates(params: {
  rows: Record<string, string>[];
  electionId?: string;
}): Promise<{ ok: boolean; summary: CandidateImportOutcome }> {
  const call = httpsCallable<
    { rows: Record<string, string>[]; electionId: string },
    { ok: boolean; summary: CandidateImportOutcome }
  >(getFirebaseFunctions(), 'importCandidates');
  return call({ rows: params.rows, electionId: params.electionId ?? ELECTION_ID }).then(({ data }) => data);
}
