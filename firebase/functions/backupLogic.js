'use strict';

const crypto = require('crypto');
const { Timestamp } = require('firebase-admin/firestore');
const { BACKUP_SCHEMA_VERSION } = require('./constants');

/**
 * Pure backup serialization/validation helpers. A backup is a single JSON blob:
 * election-scoped candidates + ballots + the tally doc + participation locks.
 * Ballots are anonymous (no uid, no timestamp), so a backup never links a voter
 * to a choice. Timestamps are encoded as {_seconds,_nanoseconds} so the JSON is
 * portable and can be validated/checksummed exactly.
 */

function isTimestamp(value) {
  return value instanceof Timestamp || (value && typeof value === 'object' && typeof value.toMillis === 'function');
}

function toSerializable(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Timestamp) return { _seconds: value.seconds, _nanoseconds: value.nanoseconds };
  if (Array.isArray(value)) return value.map(toSerializable);
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const t = new Timestamp(value.seconds, value.nanoseconds);
      return { _seconds: t.seconds, _nanoseconds: t.nanoseconds };
    }
    const out = {};
    for (const key of Object.keys(value)) out[key] = toSerializable(value[key]);
    return out;
  }
  return value;
}

function fromSerializable(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(fromSerializable);
  if (typeof value === 'object') {
    if (typeof value._seconds === 'number' && typeof value._nanoseconds === 'number') {
      return new Timestamp(value._seconds, value._nanoseconds);
    }
    const out = {};
    for (const key of Object.keys(value)) out[key] = fromSerializable(value[key]);
    return out;
  }
  return value;
}

function buildBackupPayload({ electionId, type, candidates, ballots, tally, participation, createdAt }) {
  return toSerializable({
    schemaVersion: BACKUP_SCHEMA_VERSION,
    type: type || 'manual',
    electionId,
    createdAt: createdAt || null,
    candidates: candidates || [],
    ballots: ballots || [],
    tally: tally || null,
    participation: participation || [],
  });
}

function serializeBackup(payload) {
  return JSON.stringify(payload);
}

function checksumOf(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function deserializeBackup(text) {
  const obj = JSON.parse(text);
  return fromSerializable(obj);
}

function validateBackupPayload(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, reason: 'Backup payload is not an object.' };
  if (obj.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    return { ok: false, reason: `Unsupported backup schema version (${obj.schemaVersion}).` };
  }
  if (typeof obj.electionId !== 'string' || !obj.electionId) {
    return { ok: false, reason: 'Backup is missing its election id.' };
  }
  if (!Array.isArray(obj.candidates)) return { ok: false, reason: 'Backup is missing its candidate records.' };
  if (!Array.isArray(obj.ballots)) return { ok: false, reason: 'Backup is missing its ballot records.' };
  if (!Array.isArray(obj.participation)) return { ok: false, reason: 'Backup is missing its participation records.' };
  return { ok: true };
}

module.exports = {
  toSerializable,
  fromSerializable,
  buildBackupPayload,
  serializeBackup,
  checksumOf,
  deserializeBackup,
  validateBackupPayload,
};
