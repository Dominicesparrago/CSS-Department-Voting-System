import { describe, expect, it } from 'vitest';
import { voteDocId } from './voteSubmit';

describe('voteDocId', () => {
  it('builds the deterministic id the security rules verify against', () => {
    expect(voteDocId('css_department_election_2026', 'uid123', 'president'))
      .toBe('css_department_election_2026__uid123__president');
  });

  it('one voter, one position, one election → one id (idempotent ballots)', () => {
    const a = voteDocId('e', 'u', 'p');
    const b = voteDocId('e', 'u', 'p');
    expect(a).toBe(b);
  });
});
