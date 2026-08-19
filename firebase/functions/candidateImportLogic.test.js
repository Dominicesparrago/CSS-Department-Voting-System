'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCandidateRow, processCandidateImport, candidateIdentityKey } = require('./candidateImportLogic');

const positions = ['president', 'secretary'];

test('a valid row normalizes', () => {
  const res = normalizeCandidateRow({ positionId: 'president', name: '  Juan   Dela Cruz ', section: 'BSCS-3A', yearLevel: 3, platform: 'Go' });
  assert.equal(res.ok, true);
  assert.equal(res.value.name, 'Juan Dela Cruz');
  assert.equal(res.value.yearLevel, 3);
  assert.equal(res.value.active, true);
  assert.equal(res.value.order, 1);
});

test('missing required fields are rejected', () => {
  assert.equal(normalizeCandidateRow({ positionId: '', name: 'Juan', section: 'BSCS-3A', yearLevel: 3 }).ok, false);
  assert.equal(normalizeCandidateRow({ positionId: 'president', name: 'J', section: 'BSCS-3A', yearLevel: 3 }).ok, false);
  assert.equal(normalizeCandidateRow({ positionId: 'president', name: 'Juan', section: '', yearLevel: 3 }).ok, false);
  assert.equal(normalizeCandidateRow({ positionId: 'president', name: 'Juan', section: 'BSCS-3A', yearLevel: 9 }).ok, false);
});

test('import reports inserts, updates, duplicates, and invalid rows', () => {
  const rows = [
    { positionId: 'president', name: 'A B', section: 'BSCS-3A', yearLevel: 3 }, // insert
    { positionId: 'president', name: 'A B', section: 'BSCS-3A', yearLevel: 3 }, // dup in file
    { positionId: 'ghost', name: 'C D', section: 'BSCS-3A', yearLevel: 3 }, // unknown position -> invalid
    { positionId: 'secretary', name: 'E F', section: 'BSCS-2B', yearLevel: 2 }, // matches existing -> update
  ];
  const result = processCandidateImport({ rows, positions, existingCandidates: [{ id: 'existing-sec', positionId: 'secretary', name: 'E F', section: 'BSCS-2B', yearLevel: 2 }] });
  assert.equal(result.summary.total, 4);
  assert.equal(result.summary.inserted, 1);
  assert.equal(result.summary.updated, 1);
  assert.equal(result.summary.duplicates, 1);
  assert.equal(result.summary.invalid, 1);
  assert.equal(result.summary.rejected, 2);
  assert.equal(result.records.length, 2);
});

test('existing candidates update by identity key', () => {
  const rows = [{ positionId: 'president', name: 'A B', section: 'BSCS-3A', yearLevel: 3 }];
  const existing = [{ id: 'old-id', positionId: 'president', name: 'a b', section: 'bscs-3a', yearLevel: 3 }];
  const result = processCandidateImport({ rows, positions, existingCandidates: existing });
  assert.equal(result.summary.updated, 1);
  assert.equal(result.summary.inserted, 0);
  assert.equal(result.records[0].id, 'old-id');
  assert.equal(candidateIdentityKey({ positionId: 'president', name: 'a b', section: 'bscs-3a' }), 'president|a b|bscs-3a');
});
