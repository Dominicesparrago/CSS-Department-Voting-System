import type { AuditEntry } from '../types';

/** Human-readable labels for audit action codes (admin console + superadmin log). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'candidate.create': 'Added candidate',
  'candidate.update': 'Updated candidate',
  'candidate.delete': 'Removed candidate',
  'candidate.active.set': 'Changed candidate visibility',
  'voter.eligible.set': 'Changed voter eligibility',
  'election.status.set': 'Changed voting status',
  'election.registration.set': 'Toggled registration',
  'election.title.set': 'Renamed election',
  'election.publish': 'Published results',
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
  if (typeof details.eligible === 'boolean') return details.eligible ? '→ eligible' : '→ ineligible';
  if (typeof details.turnout === 'number') return `turnout ${details.turnout}`;
  if (typeof details.email === 'string') return `→ ${details.email}`;
  if (typeof details.title === 'string') return `→ ${details.title}`;
  if (typeof details.maintenanceMode === 'boolean' || typeof details.allowGuestVoters === 'boolean') {
    return [
      typeof details.allowGuestVoters === 'boolean' ? `one-time voters ${details.allowGuestVoters ? 'on' : 'off'}` : '',
      typeof details.maintenanceMode === 'boolean' ? `maintenance ${details.maintenanceMode ? 'on' : 'off'}` : '',
    ].filter(Boolean).join(' · ');
  }
  return '';
}
