'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { auditToCsv, resultsToCsv, votersToCsv, type ResultsCounts } from '@/lib/admin/adminCore';
import {
  backupsToCsv,
  candidatesToCsv,
  downloadCsv,
  rosterToCsv,
} from '@/lib/admin/exportCenter';
import { watchBackups } from '@/lib/superadmin/database';
import { ELECTION_ID } from '@/lib/constants';
import type { AuditEntry, BackupRecord, Candidate, Position, RosterStudent, Voter } from '@/lib/types';

interface ExportCenterProps {
  candidates: Candidate[];
  positions: Position[];
  voters: Voter[];
  roster: RosterStudent[];
  results: ResultsCounts;
  auditEntries: AuditEntry[];
}

export default function ExportCenter({ candidates, positions, voters, roster, results, auditEntries }: ExportCenterProps) {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const unsubscribe = watchBackups(
      (records) => setBackups(records),
      (error) => setLoadError(error.message),
    );
    return unsubscribe;
  }, []);

  const exportsList: Array<{ label: string; body: string; available: boolean; action: () => void }> = [
    {
      label: 'Candidate roster',
      body: 'Position, name, section, year level, party, platform.',
      available: candidates.length > 0,
      action: () => downloadCsv(`css-candidates-${ELECTION_ID}.csv`, candidatesToCsv(candidates, positions)),
    },
    {
      label: 'Official roster',
      body: 'Student number, name, section, year, eligibility, status.',
      available: roster.length > 0,
      action: () => downloadCsv(`css-roster-${ELECTION_ID}.csv`, rosterToCsv(roster)),
    },
    {
      label: 'Voter registry',
      body: 'Name, student number, email, section, eligibility, voted status.',
      available: voters.length > 0,
      action: () => downloadCsv(`css-voters-${ELECTION_ID}.csv`, votersToCsv(voters, ELECTION_ID)),
    },
    {
      label: 'Tally (anonymized)',
      body: 'Per-candidate and per-position counts. No ballot data.',
      available: Object.keys(results.perCandidate).length > 0,
      action: () => downloadCsv(`css-tally-${ELECTION_ID}.csv`, resultsToCsv({ results, candidates, positions })),
    },
    {
      label: 'Audit log',
      body: 'Every privileged action with actor, target, and details.',
      available: auditEntries.length > 0,
      action: () => downloadCsv(`css-audit-${ELECTION_ID}.csv`, auditToCsv(auditEntries)),
    },
    {
      label: 'Backups index',
      body: 'Backup metadata: id, size, checksum, record counts.',
      available: backups.length > 0,
      action: () => downloadCsv(`css-backups-${ELECTION_ID}.csv`, backupsToCsv(backups)),
    },
  ];

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Export Center</span>
          <h1>Data exports</h1>
          <p>Client-side CSV generation from data this account can already read. Ballots are never exported — tallies are aggregated server-side only.</p>
        </div>
      </header>
      {loadError && <div className="form-message is-error" role="alert">{loadError}</div>}
      <div className="superadmin-list" aria-label="Exports">
        {exportsList.map(({ label, body, available, action }) => (
          <div className="superadmin-row" key={label}>
            <div>
              <strong>{label}</strong>
              <p>{body}</p>
            </div>
            <div className="superadmin-actions">
              <button className="btn btn-ghost btn-sm" type="button" disabled={!available} onClick={action}>
                <Download size={14} style={{ marginRight: 6 }} />
                {available ? 'Download CSV' : 'Nothing to export yet'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}