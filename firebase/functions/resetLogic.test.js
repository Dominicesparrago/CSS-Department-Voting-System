'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SCOPE_DEFINITIONS, isResetScope, scopeDefinition, preservedDataList } = require('./resetLogic');

test('isResetScope accepts the five reset scopes', () => {
  assert.equal(isResetScope('candidates'), true);
  assert.equal(isResetScope('voters'), true);
  assert.equal(isResetScope('ballots'), true);
  assert.equal(isResetScope('assignments'), true);
  assert.equal(isResetScope('full'), true);
  assert.equal(isResetScope('tables'), false);
  assert.equal(isResetScope(''), false);
});

test('every scope has a label and description', () => {
  for (const key of Object.keys(SCOPE_DEFINITIONS)) {
    const def = scopeDefinition(key);
    assert.ok(def.label, `${key} has a label`);
    assert.ok(def.description, `${key} has a description`);
  }
  assert.equal(scopeDefinition('nope'), null);
});

test('preservedDataList always includes Year, Section, and Election', () => {
  const list = preservedDataList();
  assert.ok(list.includes('Year'));
  assert.ok(list.includes('Section'));
  assert.ok(list.includes('Election'));
});
