'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assertElectionConfigWritable, actorRole } = require('./authGuards');
const { writeAudit } = require('./audit');

const db = getFirestore();

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

/**
 * Create or update a position on the ballot (admin). Candidates reference
 * positions by id, so renaming a position updates the display label only.
 */
exports.savePosition = onCall(async (request) => {
  const data = request.data || {};
  await assertElectionConfigWritable(db, request.auth, data.electionId);

  const name = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2) throw new HttpsError('invalid-argument', 'Position name is required.');
  if (name.length > 64) throw new HttpsError('invalid-argument', 'Position name is too long (max 64 characters).');

  const explicitId = typeof data.id === 'string' ? data.id.trim() : '';
  let id = explicitId && /^[a-z0-9_-]{3,64}$/.test(explicitId) ? explicitId : slugify(name);
  const maxSelections = Number(data.maxSelections);
  if (!Number.isInteger(maxSelections) || maxSelections < 1 || maxSelections > 10) {
    throw new HttpsError('invalid-argument', 'maxSelections must be an integer from 1 to 10.');
  }

  const scope = data.scope === 'year' ? 'year' : 'department';
  const yearLevel = Number(data.yearLevel);
  if (scope === 'year' && (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 4)) {
    throw new HttpsError('invalid-argument', 'Year-scoped positions require a year level from 1 to 4.');
  }

  const ref = db.doc(`positions/${id}`);
  const existing = await ref.get();
  if (!existing.exists && !explicitId && await positionNameTaken(name)) {
    throw new HttpsError('already-exists', 'A position with this name already exists.');
  }

  const order = Number(data.order);
  const patch = {
    name,
    scope,
    ...(scope === 'year' ? { yearLevel } : {}),
    maxSelections,
    active: data.active === undefined ? true : data.active === true,
    order: Number.isInteger(order) && order >= 1 ? order : (existing.exists ? existing.data().order : 999),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (!existing.exists) patch.createdAt = FieldValue.serverTimestamp();

  await ref.set(patch, { merge: true });
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: existing.exists ? 'position.update' : 'position.create',
    target: `positions/${id}`,
    details: { name, scope, maxSelections, order: patch.order, active: patch.active },
  });
  return { ok: true, id };
});

async function positionNameTaken(name) {
  const snap = await db.collection('positions').where('name', '==', name).limit(1).get();
  return snap.size > 0;
}

/**
 * Delete a position (admin). Refuses while any candidate or ballot references
 * it, to protect vote integrity — deactivate positions instead.
 */
exports.deletePosition = onCall(async (request) => {
  const data = request.data || {};
  await assertElectionConfigWritable(db, request.auth, data.electionId);
  const id = typeof data.id === 'string' ? data.id : '';
  if (!id) throw new HttpsError('invalid-argument', 'Position id is required.');

  const ref = db.doc(`positions/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Position was not found.');

  const [candidates, ballots] = await Promise.all([
    db.collection('candidates').where('positionId', '==', id).limit(1).get(),
    db.collection('ballots').where('positionId', '==', id).limit(1).get(),
  ]);
  if (candidates.size > 0) {
    throw new HttpsError('failed-precondition', 'This position still has candidates. Deactivate the position instead of deleting it.');
  }
  if (ballots.size > 0) {
    throw new HttpsError('failed-precondition', 'Ballots reference this position. Delete the position before casting ballots.');
  }

  await ref.delete();
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'position.delete',
    target: `positions/${id}`,
    details: { name: snap.data().name },
  });
  return { ok: true };
});