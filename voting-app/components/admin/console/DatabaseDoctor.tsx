'use client';

import { getFunctionsErrorMessage } from '@/lib/firebase/functionsError';
import { useState } from 'react';
import { Activity, CheckCircle2, Stethoscope, TriangleAlert, Wrench } from 'lucide-react';
import NoticeLine, { type Notice } from '@/components/admin/console/NoticeLine';
import { applyDatabaseRepair, runDatabaseDoctor, type DoctorReportResult } from '@/lib/superadmin/doctor';
import type { DoctorCheck, RepairAction } from '@/lib/types';

const CHECK_LABELS: Record<string, string> = {
  duplicate_voter_student_no: 'Duplicate voter student numbers',
  duplicate_roster_student_no: 'Duplicate roster student numbers',
  orphan_student_index: 'Orphaned student-number index entries',
  orphan_email_index: 'Orphaned email index entries',
  candidate_missing_election: 'Candidates missing their election link',
  candidate_missing_position: 'Candidates missing their position link',
  candidate_missing_name: 'Candidates missing a valid name',
  ballot_missing_candidate: 'Ballots referencing a deleted candidate',
  ballot_missing_position: 'Ballots referencing a deleted position',
  ballot_missing_election: 'Ballots stored without an election',
  voter_invalid_fields: 'Voters with invalid identity fields',
  student_invalid_fields: 'Roster records with invalid fields',
  tally_inconsistent: 'Tally out of sync with ballots',
  election_invalid_status: 'Elections with an unknown status',
  election_missing_tally: 'Results-bearing elections with no tally',
  election_finalized_without_timestamp: 'Finalized elections missing a timestamp',
};

export default function DatabaseDoctor() {
  const [report, setReport] = useState<DoctorReportResult | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [running, setRunning] = useState(false);

  async function scan() {
    setRunning(true);
    setNotice(null);
    try {
      const result = await runDatabaseDoctor();
      setReport(result);
      if (result.status === 'issues') {
        const errors = result.checks.filter((c) => c.status === 'error').length;
        setNotice({ text: `Scan complete — ${errors} error${errors === 1 ? '' : 's'}, ${result.checks.length - errors} warnings.` });
      } else {
        setNotice({ text: 'Scan complete — the database looks healthy.' });
      }
    } catch (error) {
      setNotice({ text: getFunctionsErrorMessage(error), error: true });
    } finally {
      setRunning(false);
    }
  }

  async function runRepair(action: RepairAction) {
    if (busy) return;
    const ids = action.ids ?? [];
    const confirmed = window.confirm(`${action.label} — ${action.affected} record(s). Continue?`);
    if (!confirmed) return;
    setBusy(action.code);
    setNotice(null);
    try {
      await applyDatabaseRepair({ code: action.code, ids });
      setNotice({ text: `Repair applied — ${action.affected} record(s).` });
    } catch (error) {
      setNotice({ text: getFunctionsErrorMessage(error), error: true });
    } finally {
      setBusy('');
    }
  }

  function statusClass(status: DoctorCheck['status']): string {
    return status === 'error' ? 'err' : status === 'warn' ? 'warn' : 'ok';
  }

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Integrity</span>
          <h1>Database Doctor</h1>
          <p>Read-only scan of index, roster, ballot, and tally consistency. Repairs are applied one at a time, only after confirmation.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary btn-sm" type="button" disabled={running} onClick={() => void scan()}>
            <Stethoscope size={14} style={{ marginRight: 6 }} />
            {running ? 'Scanning…' : 'Run scan'}
          </button>
        </div>
      </header>
      <NoticeLine notice={notice} />

      {!report ? (
        <div className="state-block">
          <strong>No scan run yet</strong>
          <small>Run the scan to check the database for orphaned indexes, missing tallies, and ballot/candidate inconsistencies.</small>
        </div>
      ) : (
        <>
          <div className="student-facts">
            {[
              { icon: Activity, value: String(report.checks.length), label: 'Checks run' },
              { icon: TriangleAlert, value: String(report.checks.filter((c) => c.status === 'error').length), label: 'Errors' },
              { icon: Wrench, value: String(report.checks.filter((c) => c.status === 'warn').length), label: 'Warnings' },
              { icon: CheckCircle2, value: String(report.repairs.length), label: 'Repairs available' },
            ].map(({ icon: Icon, value, label }) => (
              <article className="fact" key={label}>
                <span className="ic"><Icon size={20} /></span>
                <div><div className="num grad">{value}</div><div className="lbl">{label}</div></div>
              </article>
            ))}
          </div>

          {report.status === 'healthy' ? (
            <div className="state-block">
              <strong>Database is healthy</strong>
              <small>All checks passed. No repairs are needed.</small>
            </div>
          ) : (
            <div className="superadmin-list" aria-label="Doctor checks">
              <div className="block-label">
                <h2>Checks</h2>
                <small>scanned {report.scannedAt}</small>
              </div>
              {report.checks.map((check) => (
                <div className="superadmin-row" key={check.code}>
                  <span className={`tag ${statusClass(check.status)}`}>{check.status}</span>
                  <div>
                    <strong>{CHECK_LABELS[check.code] ?? check.code}</strong>
                    <p>{check.message} ({check.count} affected)</p>
                  </div>
                  <div className="superadmin-actions">
                    {check.status === 'error' && report.repairs.find((r) => r.code === check.code) && (
                      <button
                        className="btn btn-amber btn-sm"
                        type="button"
                        disabled={busy === report.repairs.find((r) => r.code === check.code)!.code}
                        onClick={() => void runRepair(report.repairs.find((r) => r.code === check.code)!)}
                      >
                        <Wrench size={14} style={{ marginRight: 6 }} />
                        Repair
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}