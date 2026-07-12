import { describe, expect, it } from 'vitest';
import { friendlyAuthError } from './errors';

describe('friendlyAuthError', () => {
  it('maps known auth codes to actionable copy', () => {
    expect(friendlyAuthError({ code: 'auth/email-already-in-use' })).toContain('already registered');
    expect(friendlyAuthError({ code: 'auth/invalid-credential' })).toContain('incorrect');
    expect(friendlyAuthError({ code: 'auth/wrong-password' })).toContain('incorrect');
    expect(friendlyAuthError({ code: 'auth/user-not-found' })).toContain('No account');
    expect(friendlyAuthError({ code: 'auth/weak-password' })).toContain('at least 6');
  });

  it('maps connectivity and rules failures', () => {
    expect(friendlyAuthError({ code: 'auth/network-request-failed' })).toContain('internet connection');
    expect(friendlyAuthError({ message: 'Failed to fetch' })).toContain('internet connection');
    expect(friendlyAuthError({ code: 'permission-denied' })).toContain('already have been used');
  });

  it('falls back to a generic message for unknown errors', () => {
    expect(friendlyAuthError(new Error('boom'))).toContain('Something went wrong');
    expect(friendlyAuthError(undefined)).toContain('Something went wrong');
  });
});
