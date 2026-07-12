import { describe, expect, it } from 'vitest';
import type { Session, VoterProfile } from '../types';
import {
  hasAdminAccess,
  hasAdminClaim,
  hasSuperAdminClaim,
  hasVotedInElection,
  isStudentSession,
} from './guards-core';

const E = 'css_department_election_2026';

function session(overrides: Partial<Session>): Session {
  return { user: null, voterProfile: null, claims: null, ...overrides };
}

const fakeUser = { uid: 'u1' } as unknown as Session['user'];

function profile(overrides: Partial<VoterProfile> = {}): VoterProfile {
  return {
    uid: 'u1',
    fullName: 'Voter',
    email: 'v.scc@gmail.com',
    yearLevel: 3,
    section: 'BSCS-3A',
    eligible: true,
    ...overrides,
  };
}

describe('hasAdminClaim', () => {
  it('accepts every historical claim shape', () => {
    expect(hasAdminClaim({ admin: true })).toBe(true);
    expect(hasAdminClaim({ superadmin: true })).toBe(true);
    expect(hasAdminClaim({ role: 'admin' })).toBe(true);
    expect(hasAdminClaim({ role: 'superadmin' })).toBe(true);
  });

  it('rejects falsy, wrong, or missing claims', () => {
    expect(hasAdminClaim(null)).toBe(false);
    expect(hasAdminClaim({})).toBe(false);
    expect(hasAdminClaim({ admin: 'true' })).toBe(false); // string, not boolean
    expect(hasAdminClaim({ role: 'student' })).toBe(false);
  });
});

describe('hasSuperAdminClaim', () => {
  it('is stricter than hasAdminClaim', () => {
    expect(hasSuperAdminClaim({ superadmin: true })).toBe(true);
    expect(hasSuperAdminClaim({ role: 'superadmin' })).toBe(true);
    expect(hasSuperAdminClaim({ admin: true })).toBe(false);
    expect(hasSuperAdminClaim(null)).toBe(false);
  });
});

describe('hasAdminAccess', () => {
  it('grants via claim or registry membership', () => {
    expect(hasAdminAccess(session({ claims: { admin: true } }))).toBe(true);
    expect(hasAdminAccess(session({ adminViaRegistry: true }))).toBe(true);
  });

  it('denies with neither', () => {
    expect(hasAdminAccess(session({}))).toBe(false);
    expect(hasAdminAccess(session({ adminViaRegistry: false, claims: {} }))).toBe(false);
  });
});

describe('hasVotedInElection', () => {
  it('checks the per-election flag exactly', () => {
    expect(hasVotedInElection(profile({ hasVoted: { [E]: true } }), E)).toBe(true);
    expect(hasVotedInElection(profile({ hasVoted: { other: true } }), E)).toBe(false);
    expect(hasVotedInElection(profile(), E)).toBe(false);
    expect(hasVotedInElection(null, E)).toBe(false);
  });
});

describe('isStudentSession', () => {
  it('requires both a user and a voter profile', () => {
    expect(isStudentSession(session({ user: fakeUser, voterProfile: profile() }))).toBe(true);
    expect(isStudentSession(session({ user: fakeUser }))).toBe(false);
    expect(isStudentSession(session({ voterProfile: profile() }))).toBe(false);
  });
});
