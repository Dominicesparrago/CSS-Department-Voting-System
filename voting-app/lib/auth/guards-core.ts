import type { Session, VoterProfile } from '../types';

export function hasAdminClaim(claims: Record<string, unknown> | null): boolean {
  return claims?.admin === true || claims?.role === 'admin';
}

export function hasVotedInElection(voterProfile: VoterProfile | null, electionId: string): boolean {
  return voterProfile?.hasVoted?.[electionId] === true;
}

export function isStudentSession(session: Session): boolean {
  return Boolean(session?.user && session?.voterProfile);
}
