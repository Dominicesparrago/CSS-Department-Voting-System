import type { Session, VoterProfile } from '../types';

export function hasAdminClaim(claims: Record<string, unknown> | null): boolean {
  return claims?.admin === true || claims?.superadmin === true || claims?.role === 'admin' || claims?.role === 'superadmin';
}

export function hasSuperAdminClaim(claims: Record<string, unknown> | null): boolean {
  return claims?.superadmin === true || claims?.role === 'superadmin';
}

/** Admin console access: a custom claim OR membership in the admins registry. */
export function hasAdminAccess(session: Session): boolean {
  return hasAdminClaim(session.claims) || session.adminViaRegistry === true;
}

export function hasVotedInElection(voterProfile: VoterProfile | null, electionId: string): boolean {
  return voterProfile?.hasVoted?.[electionId] === true;
}

export function isStudentSession(session: Session): boolean {
  return Boolean(session?.user && session?.voterProfile);
}
