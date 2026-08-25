'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assertSuperAdmin, actorRole } = require('./authGuards');
const { writeAudit } = require('./audit');
const { DEFAULT_ELECTION_ID } = require('./constants');
const { verifyResults } = require('./verifyLogic');
const { recomputeElectionTally } = require('./tally');

const db = getFirestore();
function toHttpsError(error, fallbackCode, fallbackMessage) {
  if (error instanceof HttpsError) throw error;
  if (error && error.code && ['unauthenticated','permission-denied','invalid-argument','not-found','failed-precondition','already-exists','data-loss','aborted','out-of-range','unimplemented','internal','unavailable'].includes(error.code)) throw error;
  console.error(`[${fallbackCode}] ${fallbackMessage}:`, error);
  throw new HttpsError(fallbackCode, fallbackMessage);
}


async function loadVerificationData(electionId) {
  const [electionSnap, positionsSnap, candidatesSnap, ballotsSnap, tallySnap] = await Promise.all([
    db.doc(`elections/${electionId}`).get(),
    db.collection('positions').orderBy('order', 'asc').get(),
    db.collection('candidates').where('electionId', '==', electionId).get(),
    db.collection('ballots').where('electionId', '==', electionId).get(),
    db.doc(`tallies/${electionId}`).get(),
  ]);
  return {
    election: electionSnap.exists ? { id: electionSnap.id, ...electionSnap.data() } : null,
    positions: positionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    candidates: candidatesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    ballots: ballotsSnap.docs.map((d) => d.data()),
    tally: tallySnap.exists ? tallySnap.data() : null,
  };
}

/** Run the pre-finalization verification checklist (superadmin). */
exports.verifyResults = onCall({ invoker: 'public' }, async (request) => {
  try {
  assertSuperAdmin(request.auth);
  const electionId = typeof (request.data || {}).electionId === 'string' ? request.data.electionId : DEFAULT_ELECTION_ID;
  const data = await loadVerificationData(electionId);
  if (!data.election) throw new HttpsError('not-found', 'Election was not found.');

  const result = verifyResults(data);
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'election.verify',
    target: `elections/${electionId}`,
    electionId,
    details: { ok: result.ok },
  });
  return { ok: result.ok, checks: result.checks };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('verifyResults unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for verifyResults: ' + msg + '. Run firebase deploy --only firestore.');
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      throw new HttpsError('permission-denied', msg);
    }
    throw new HttpsError('internal', 'verifyResults failed: ' + msg);
  }
});

/**
 * Finalize election results (superadmin). Runs the verification checklist,
 * recomputes the final tally from immutable ballots, locks the results, and
 * flags the election as finalized (still publicly readable like published).
 */
exports.finalizeElection = onCall({ invoker: 'public' }, async (request) => {
  try {
  assertSuperAdmin(request.auth);
  const electionId = typeof (request.data || {}).electionId === 'string' ? request.data.electionId : DEFAULT_ELECTION_ID;
  const electionSnap = await db.doc(`elections/${electionId}`).get();
  if (!electionSnap.exists) throw new HttpsError('not-found', 'Election was not found.');

  const status = electionSnap.data().status;
  if (status === 'finalized') throw new HttpsError('already-exists', 'This election is already finalized.');
  if (!['closed', 'published'].includes(status)) {
    throw new HttpsError('failed-precondition', `Finalization requires a closed or published election (current status: ${status}).`);
  }

  const data = await loadVerificationData(electionId);
  const result = verifyResults(data);
  if (!result.ok) {
    const fails = result.checks.filter((c) => c.status === 'error').map((c) => c.label);
    throw new HttpsError('failed-precondition', `Finalization blocked: ${fails.join(', ')}.`);
  }

  const tally = await recomputeElectionTally(db, electionId);
  await db.doc(`tallies/${electionId}`).set({ ...tally, updatedAt: FieldValue.serverTimestamp() });

  await db.doc(`elections/${electionId}`).update({
    status: 'finalized',
    finalizedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'election.finalize',
    target: `elections/${electionId}`,
    electionId,
    details: { turnout: tally.turnout.total, perPositionCounts: tally.perPosition },
  });

  return { ok: true, turnout: tally.turnout.total };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('finalizeElection unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for finalizeElection: ' + msg + '. Run firebase deploy --only firestore.');
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      throw new HttpsError('permission-denied', msg);
    }
    throw new HttpsError('internal', 'finalizeElection failed: ' + msg);
  }
});
