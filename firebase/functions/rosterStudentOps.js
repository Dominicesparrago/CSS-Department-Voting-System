'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assertElectionConfigWritable, actorRole } = require('./authGuards');
const { writeAudit } = require('./audit');
const { normalizeSection } = require('./rosterLogic');

const db = getFirestore();
function toHttpsError(error, fallbackCode, fallbackMessage) {
  if (error instanceof HttpsError) throw error;
  if (error && error.code && ['unauthenticated','permission-denied','invalid-argument','not-found','failed-precondition','already-exists','data-loss','aborted','out-of-range','unimplemented','internal','unavailable'].includes(error.code)) throw error;
  console.error(`[${fallbackCode}] ${fallbackMessage}:`, error);
  throw new HttpsError(fallbackCode, fallbackMessage);
}


/**
 * Edit a single roster student's profile data (admin). Voting participation
 * locks are never modified here — only identity fields shown on the ballot.
 */
exports.updateRosterStudent = onCall({ invoker: 'public' }, async (request) => {
  try {
  const data = request.data || {};
  await assertElectionConfigWritable(db, request.auth, data.electionId);

  const id = typeof data.id === 'string' ? data.id : '';
  if (!id) throw new HttpsError('invalid-argument', 'Student roster id is required.');

  const ref = db.doc(`students/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Student was not found.');

  const patch = { updatedAt: FieldValue.serverTimestamp() };
  const changed = [];
  if (data.fullName !== undefined) {
    const name = typeof data.fullName === 'string' ? data.fullName.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 2) throw new HttpsError('invalid-argument', 'Student name must be at least 2 characters.');
    patch.fullName = name;
    changed.push('fullName');
  }
  if (data.section !== undefined) {
    const section = normalizeSection(data.section);
    if (!section) throw new HttpsError('invalid-argument', 'Section is required.');
    patch.section = section;
    changed.push('section');
  }
  if (data.yearLevel !== undefined) {
    const yearLevel = Number(data.yearLevel);
    if (![1, 2, 3, 4].includes(yearLevel)) throw new HttpsError('invalid-argument', 'Year level must be 1-4.');
    patch.yearLevel = yearLevel;
    changed.push('yearLevel');
  }
  if (data.eligible !== undefined) {
    if (typeof data.eligible !== 'boolean') throw new HttpsError('invalid-argument', 'eligible must be a boolean.');
    patch.eligible = data.eligible;
    changed.push('eligible');
  }
  if (data.status !== undefined) {
    if (data.status !== 'active' && data.status !== 'inactive') {
      throw new HttpsError('invalid-argument', 'status must be "active" or "inactive".');
    }
    patch.status = data.status;
    changed.push('status');
  }
  if (changed.length === 0) throw new HttpsError('invalid-argument', 'Nothing to update.');

  await ref.update(patch);
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'roster.student.update',
    target: `students/${id}`,
    details: { fields: changed },
  });
  return { ok: true, fields: changed };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('updateRosterStudent unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for updateRosterStudent: ' + msg + '. Run firebase deploy --only firestore.');
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      throw new HttpsError('permission-denied', msg);
    }
    throw new HttpsError('internal', 'updateRosterStudent failed: ' + msg);
  }
});