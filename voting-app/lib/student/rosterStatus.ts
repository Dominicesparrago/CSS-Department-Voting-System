import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase/init';
import { ELECTION_ID } from '../constants';
import type { VoterProfile } from '../types';

/**
 * Early, read-only roster check for the ballot page. Asks the
 * checkMyRosterStatus Cloud Function, which mirrors the authoritative checks in
 * submitBallot (profile, participation lock, roster eligibility — both the
 * student-number-keyed path and the masterlist name + section + year path), so
 * a student sees a clear denial before the ballot opens instead of only at
 * submit time.
 *
 * IMPORTANT: this is UX only. It fails open (returns ok) on any call error so
 * a transient failure can never let the client decide — the server always
 * re-verifies every condition inside its write transaction.
 */

export type RosterDenialReason =
  | 'not-on-roster'
  | 'inactive'
  | 'not-eligible'
  | 'mismatch'
  | 'email-mismatch'
  | 'section-not-eligible'
  | 'already-voted'
  | 'no-profile';

export interface RosterCheckResult {
  ok: boolean;
  reason?: RosterDenialReason;
}

export async function checkRosterEligibility(
  voterProfile: VoterProfile | null,
  electionId = ELECTION_ID,
): Promise<RosterCheckResult> {
  if (!voterProfile) return { ok: true };

  try {
    const call = httpsCallable<{ electionId: string }, { ok: boolean; reason?: RosterDenialReason }>(
      getFirebaseFunctions(),
      'checkMyRosterStatus',
    );
    const { data } = await call({ electionId });
    return { ok: data.ok, reason: data.reason };
  } catch {
    // Fail open: the server remains the authority.
    return { ok: true };
  }
}

export const ROSTER_DENIAL_COPY: Record<RosterDenialReason, { title: string; body: string }> = {
  'not-on-roster': {
    title: "You're not on the official roster.",
    body: "Your details aren't on the official roster for this election. If you're a current CSS student, contact the election committee to have your record added.",
  },
  inactive: {
    title: 'Your roster record is inactive.',
    body: 'The official roster lists you as inactive for this election. Contact the election committee if you believe this is a mistake.',
  },
  'not-eligible': {
    title: 'Your record is not marked eligible.',
    body: 'The official roster does not mark you as eligible for this election. Contact the election committee for details.',
  },
  mismatch: {
    title: 'Your registration does not match the roster.',
    body: 'The details on your account don\u2019t match the official roster. Contact the election committee so your registration can be corrected.',
  },
  'email-mismatch': {
    title: 'Your account email does not match the roster.',
    body: 'The email on your account doesn\u2019t match the official roster. Contact the election committee for help.',
  },
  'section-not-eligible': {
    title: 'Your section is not eligible.',
    body: 'This election is limited to specific sections, and yours is not included. Contact the election committee if you believe this is a mistake.',
  },
  'already-voted': {
    title: 'You have already voted.',
    body: 'Your participation in this election has already been recorded. Each student may vote only once.',
  },
  'no-profile': {
    title: 'No voter profile found.',
    body: 'No voter profile was found for this account. Contact the election committee for help.',
  },
};
