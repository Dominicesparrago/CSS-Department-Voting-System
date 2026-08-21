import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase/init';
import { ELECTION_ID } from '../constants';
import type { VoterProfile } from '../types';

export type RosterVerificationState =
  | 'verified'
  | 'not-on-roster'
  | 'ineligible'
  | 'email-mismatch'
  | 'mismatch'
  | 'verification_unavailable';

export interface VerificationResult {
  state: RosterVerificationState;
  ok: boolean;
  message: string;
  details?: {
    studentId?: string;
    rosterRecord?: {
      fullName: string;
      email: string;
      section: string;
      yearLevel: number;
      eligible: boolean;
    };
  };
}

export async function verifyStudentRegistration(
  studentId: string,
  fullName: string,
  email: string,
  yearLevel: number,
  section: string,
  electionId = ELECTION_ID
): Promise<VerificationResult> {
  if (!studentId) {
    return {
      state: 'not-on-roster',
      ok: false,
      message: 'Student ID is required for verification.',
    };
  }

  try {
    const call = httpsCallable<{
      studentId: string;
      fullName: string;
      email: string;
      yearLevel: number;
      section: string;
      electionId?: string;
    }, { ok: boolean; state: RosterVerificationState; message: string }>(
      getFirebaseFunctions(),
      'verifyStudentAgainstRoster'
    );

    const { data } = await call({
      studentId,
      fullName,
      email,
      yearLevel,
      section,
      electionId,
    });

    if (data.ok) {
      return {
        state: data.state,
        ok: true,
        message: data.message,
      };
    }

    return {
      state: data.state,
      ok: false,
      message: data.message,
    };
  } catch (error) {
    console.error('Registration verification error:', error);
    return {
      state: 'verification_unavailable',
      ok: false,
      message:
        (error as Error).message || 'Verification failed due to a technical error.',
    };
  }
}

/**
 * Normalize section from various formats (mirrors rosterLogic.js).
 */
export function normalizeSection(value: unknown): string {
  if (value == null) return '';
  const pattern = /^(?:(?:BSCS|CS)[\s-]*)?([1-4])[\s-]*([A-Za-z])$/i;
  const match = pattern.exec(String(value).trim());
  if (!match) return '';
  return `BSCS-${match[1]}${match[2].toUpperCase()}`;
}

/**
 * Name matching (mirrors rosterLogic.js namesMatch).
 */
export function namesMatch(registered: string, roster: string): boolean {
  const significantTokens = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter((token) => token.length > 1);

  const a = significantTokens(registered);
  const b = significantTokens(roster);
  if (a.length === 0 || b.length === 0) return false;
  if (a[0] !== b[0]) return false;

  const surnameKey = (tokens: string[]) => {
    let start = tokens.length - 1;
    while (start > 0 && ['de', 'del', 'dela', 'la', 'van', 'von', 'bin', 'ibn'].includes(tokens[start - 1])) {
      start -= 1;
    }
    return tokens.slice(start).join('');
  };

  return surnameKey(a) === surnameKey(b);
}