import type { AuditEntry } from '../types';

/** Human-readable labels for audit action codes (admin console + superadmin log). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'candidate.create': 'Added candidate',
  'candidate.update': 'Updated candidate',
  'candidate.delete': 'Removed candidate',
  'candidate.active.set': 'Changed candidate visibility',
  'candidate.archived.set': 'Changed candidate archive status',
  'candidate.import': 'Imported candidates',
  'voter.eligible.set': 'Changed voter eligibility',
  'voter.reset': 'Reset voter registration',
  'election.status.set': 'Changed voting status',
  'election.registration.set': 'Toggled registration',
  'election.title.set': 'Renamed election',
  'election.publish': 'Published results',
  'election.create': 'Created election',
  'election.update': 'Updated election',
  'election.archive': 'Archived election',
  'election.restore': 'Restored election',
  'election.lock': 'Locked election',
  'election.unlock': 'Unlocked election',
  'election.verify': 'Verified election results',
  'election.finalize': 'Finalized election results',
  'position.create': 'Created position',
  'position.update': 'Updated position',
  'position.delete': 'Deleted position',
  'roster.import': 'Imported roster',
  'roster.remove': 'Removed roster entries',
  'roster.student.update': 'Edited roster student',
  'reset.candidates': 'Reset candidates',
  'reset.assignments': 'Reset assignments',
  'reset.voters': 'Reset voter status',
  'reset.ballots': 'Reset ballots & results',
  'reset.full': 'Full election data reset',
  'backup.created': 'Created backup',
  'backup.restored': 'Restored backup',
  'backup.deleted': 'Deleted backup',
  'doctor.scan': 'Ran database scan',
  'repair.delete_orphan_student_index': 'Repaired student index',
  'repair.delete_orphan_email_index': 'Repaired email index',
  'repair.recompute_tally': 'Recomputed tally',
  'repair.set_candidate_election': 'Assigned candidates to election',
  'admin.account.create': 'Created admin account',
  'admin.grant': 'Granted admin access',
  'admin.revoke': 'Revoked admin access',
  'config.set': 'Updated system settings',
};

/** Short "→ value" suffix summarizing what an audit entry changed. */
export function auditDetail(entry: AuditEntry): string {
  const details = entry.details ?? {};
  if (typeof details.status === 'string') return `→ ${details.status}`;
  if (typeof details.registrationOpen === 'boolean') return details.registrationOpen ? '→ open' : '→ closed';
  if (typeof details.active === 'boolean') return details.active ? '→ shown' : '→ hidden';
  if (typeof details.archived === 'boolean') return details.archived ? '→ archived' : '→ restored';
  if (typeof details.eligible === 'boolean') return details.eligible ? '→ eligible' : '→ ineligible';
  if (typeof details.turnout === 'number') return `turnout ${details.turnout}`;
  if (typeof details.studentNo === 'string' && details.studentNo) return `→ student ${details.studentNo}`;
  if (typeof details.email === 'string') return `→ ${details.email}`;
  if (typeof details.title === 'string') return `→ ${details.title}`;
  if (typeof details.scope === 'string') return `→ ${details.scope} (${details.label ?? ''})`.trim();
  if (typeof details.deleted === 'object' && details.deleted !== null) {
    const deleted = details.deleted as Record<string, number>;
    return `→ ${Object.entries(deleted).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${k}: ${n}`).join(', ') || 'nothing'}`;
  }
  if (typeof details.affected === 'number') return `→ ${details.affected} affected`;
  if (typeof details.maintenanceMode === 'boolean' || typeof details.allowGuestVoters === 'boolean') {
    return [
      typeof details.allowGuestVoters === 'boolean' ? `one-time voters ${details.allowGuestVoters ? 'on' : 'off'}` : '',
      typeof details.maintenanceMode === 'boolean' ? `maintenance ${details.maintenanceMode ? 'on' : 'off'}` : '',
    ].filter(Boolean).join(' · ');
  }
  return '';
}
