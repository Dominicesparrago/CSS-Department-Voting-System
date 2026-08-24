'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveElectionTransition } = require('./electionStateMachine');

function attempt(overrides = {}) {
  return resolveElectionTransition({
    currentStatus: 'draft',
    nextStatus: 'open',
    locked: false,
    isSuperadmin: false,
    force: false,
    ...overrides,
  });
}

test('draft -> open allowed for admin', () => {
  assert.equal(attempt().ok, true);
});

test('open -> closed allowed for admin', () => {
  const r = attempt({ currentStatus: 'open', nextStatus: 'closed' });
  assert.equal(r.ok, true);
});

test('published/finalized/archived elections are immutable here', () => {
  for (const status of ['published', 'finalized', 'archived']) {
    for (const next of ['open', 'closed']) {
      const r = attempt({ currentStatus: status, nextStatus: next });
      assert.equal(r.ok, false, `${status} -> ${next} must be refused`);
      assert.equal(r.code, 'failed-precondition');
    }
  }
});

test('only open/closed are settable targets', () => {
  for (const next of ['draft', 'published', 'finalized', 'archived', 'weird', '']) {
    const r = attempt({ currentStatus: 'open', nextStatus: next });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid-argument');
  }
});

test('same-state change refused', () => {
  assert.equal(attempt({ currentStatus: 'open', nextStatus: 'open' }).code, 'already-exists');
  assert.equal(attempt({ currentStatus: 'closed', nextStatus: 'closed' }).code, 'already-exists');
});

test('draft can only be opened', () => {
  const r = attempt({ currentStatus: 'draft', nextStatus: 'closed' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'failed-precondition');
});

test('closed -> open requires superadmin force (audited reopen)', () => {
  assert.equal(attempt({ currentStatus: 'closed', nextStatus: 'open' }).ok, false);
  assert.equal(attempt({ currentStatus: 'closed', nextStatus: 'open', force: true }).ok, false);
  assert.equal(attempt({ currentStatus: 'closed', nextStatus: 'open', isSuperadmin: true }).ok, false);
  const r = attempt({ currentStatus: 'closed', nextStatus: 'open', isSuperadmin: true, force: true });
  assert.equal(r.ok, true);
});

test('locked election blocks non-forced changes', () => {
  assert.equal(attempt({ locked: true }).ok, false);
  assert.equal(attempt({ currentStatus: 'open', nextStatus: 'closed', locked: true }).ok, false);
  const superForced = attempt({
    currentStatus: 'open',
    nextStatus: 'closed',
    locked: true,
    isSuperadmin: true,
    force: true,
  });
  assert.equal(superForced.ok, true);
});
