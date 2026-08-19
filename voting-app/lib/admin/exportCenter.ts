import type { BackupRecord, Candidate, Position, RosterStudent } from '../types';
import { byId } from './adminCore';

/**
 * Export Center (admin/superadmin). Reuses the CSV builders in adminCore for
 * results/voters/audit and adds roster/candidates/backups exports. Everything
 * is generated client-side from data the current role can already read.
 */

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

/** Trigger a browser download of `csv` as `filename`. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function rosterToCsv(students: RosterStudent[]): string {
  const header = ['studentNo', 'fullName', 'section', 'yearLevel', 'email', 'eligible', 'status'];
  const rows = students.map((s) => [
    s.studentNo ?? '',
    s.fullName,
    s.section,
    s.yearLevel,
    s.email ?? '',
    s.eligible ? 'yes' : 'no',
    s.status,
  ]);
  return toCsv(header, rows);
}

export function candidatesToCsv(candidates: Candidate[], positions: Position[]): string {
  const positionsById = byId(positions);
  const header = ['positionId', 'position', 'name', 'section', 'yearLevel', 'party', 'platform', 'order', 'active'];
  const rows = candidates.map((c) => [
    c.positionId,
    positionsById[c.positionId]?.name ?? c.positionId,
    c.name,
    c.section,
    c.yearLevel,
    c.party ?? '',
    c.platform,
    c.order,
    c.active ? 'yes' : 'no',
  ]);
  return toCsv(header, rows);
}

export function backupsToCsv(backups: BackupRecord[]): string {
  const header = ['backupId', 'electionId', 'type', 'sizeBytes', 'checksum', 'candidates', 'ballots', 'participation', 'createdAt'];
  const rows = backups.map((b) => [
    b.id,
    b.electionId,
    b.type,
    b.sizeBytes,
    b.checksum,
    b.recordCounts?.candidates ?? 0,
    b.recordCounts?.ballots ?? 0,
    b.recordCounts?.participation ?? 0,
    b.createdAt ? new Date((b.createdAt as unknown as { seconds: number }).seconds * 1000).toISOString() : '',
  ]);
  return toCsv(header, rows);
}
