'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assertElectionConfigWritable, actorRole } = require('./authGuards');
const { writeAudit } = require('./audit');
const { DEFAULT_ELECTION_ID } = require('./constants');
const { processCandidateImport } = require('./candidateImportLogic');

const db = getFirestore();
function toHttpsError(error, fallbackCode, fallbackMessage) {
  if (error instanceof HttpsError) throw error;
  if (error && error.code && ['unauthenticated','permission-denied','invalid-argument','not-found','failed-precondition','already-exists','data-loss','aborted','out-of-range','unimplemented','internal','unavailable'].includes(error.code)) throw error;
  console.error(`[${fallbackCode}] ${fallbackMessage}:`, error);
  throw new HttpsError(fallbackCode, fallbackMessage);
}


async function ballotsExist(electionId) {
  const snap = await db.collection('ballots').where('electionId', '==', electionId).limit(1).get();
  return !snap.empty;
}

function normalizeCandidateInput(data, existingId) {
  const electionId = typeof data.electionId === 'string' && data.electionId ? data.electionId : DEFAULT_ELECTION_ID;
  const positionId = typeof data.positionId === 'string' ? data.positionId.trim() : '';
  if (!positionId) throw new HttpsError('invalid-argument', 'positionId is required.');
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (name.length < 2) throw new HttpsError('invalid-argument', 'Candidate name is required (at least 2 characters).');
  if (name.length > 80) throw new HttpsError('invalid-argument', 'Candidate name is too long (max 80).');
  const section = typeof data.section === 'string' ? data.section.trim() : '';
  if (!section) throw new HttpsError('invalid-argument', 'section is required.');
  const yearLevel = Number(data.yearLevel);
  if (![1, 2, 3, 4].includes(yearLevel)) throw new HttpsError('invalid-argument', 'yearLevel must be 1-4.');
  const platform = typeof data.platform === 'string' ? data.platform.trim() : '';
  if (platform.length < 10) throw new HttpsError('invalid-argument', 'Platform is required (at least 10 characters).');
  if (platform.length > 2000) throw new HttpsError('invalid-argument', 'Platform is too long (max 2000).');
  const order = Number(data.order);
  if (!Number.isInteger(order) || order < 0 || order > 9999) throw new HttpsError('invalid-argument', 'order must be an integer 0-9999.');
  const active = data.active === true;
  const id = typeof data.id === 'string' && data.id ? data.id : existingId || '';
  if (id && !/^[a-zA-Z0-9_-]{3,64}$/.test(id) && !/^[a-z0-9]{20}$/.test(id)) {
    throw new HttpsError('invalid-argument', 'Invalid candidate id format.');
  }
  const goals = data.goals != null ? String(data.goals).trim().slice(0, 2000) || null : null;
  const bio = data.bio != null ? String(data.bio).trim().slice(0, 2000) || null : null;
  const party = data.party != null ? String(data.party).trim().slice(0, 80) || null : null;
  const photoURL = typeof data.photoURL === 'string' ? data.photoURL.slice(0, 2048) : '';
  const photoPath = typeof data.photoPath === 'string' ? data.photoPath.slice(0, 512) : '';
  return { id, electionId, positionId, name, section, yearLevel, platform, goals, bio, party, order, active, photoURL, photoPath };
}

async function assertCandidatesMutable(electionId) {
  if (await ballotsExist(electionId)) {
    throw new HttpsError('failed-precondition', 'Candidates are frozen once voting has begun. This protects already-cast ballots from being silently invalidated.');
  }
}

/**
 * Batch upsert candidates for an election (admin). The client sends normalized
 * rows (already parsed from CSV/XLSX); this function re-validates every row
 * authoritatively, rejects duplicates/invalid rows, and merges the rest into
 * candidates/{id} — the only path that creates candidate documents.
 * Refused once any ballot exists for the election (V-04).
 */
exports.importCandidates = onCall({ invoker: 'public' }, async (request) => {
  try {
  const data = request.data || {};
  const electionId = typeof data.electionId === 'string' ? data.electionId : DEFAULT_ELECTION_ID;
  await assertElectionConfigWritable(db, request.auth, electionId);
  await assertCandidatesMutable(electionId);

  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length === 0) throw new HttpsError('invalid-argument', 'The file contains no candidate rows.');
  if (rows.length > 10000) throw new HttpsError('invalid-argument', 'Candidate imports are limited to 10,000 rows.');

  const [positionsSnap, candidatesSnap] = await Promise.all([
    db.collection('positions').orderBy('order', 'asc').get(),
    db.collection('candidates').where('electionId', '==', electionId).get(),
  ]);
  const positions = positionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const existingCandidates = candidatesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const { summary, records } = processCandidateImport({ rows, positions, existingCandidates });
  if (records.length === 0) {
    throw new HttpsError('invalid-argument', 'No valid candidate rows were found. Nothing was imported.');
  }

  const now = FieldValue.serverTimestamp();
  for (let i = 0; i < records.length; i += 400) {
    const batch = db.batch();
    for (const record of records.slice(i, i + 400)) {
      const ref = record.id ? db.doc(`candidates/${record.id}`) : db.collection('candidates').doc();
      batch.set(ref, { ...record, id: undefined, electionId, updatedAt: now });
    }
    await batch.commit();
  }

  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'candidate.import',
    target: `elections/${electionId}`,
    electionId,
    details: {
      total: summary.total,
      inserted: summary.inserted,
      updated: summary.updated,
      duplicates: summary.duplicates,
      invalid: summary.invalid,
      rejected: summary.rejected,
      errors: summary.errors.slice(0, 50),
    },
  });

  return { ok: true, summary };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('importCandidates unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for importCandidates: ' + msg + '. Run firebase deploy --only firestore.');
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      throw new HttpsError('permission-denied', msg);
    }
    throw new HttpsError('internal', 'importCandidates failed: ' + msg);
  }
});

/**
 * Create or update a single candidate (admin). All direct client writes to
 * candidates/{id} are denied by the security rules; this callable is the
 * only sanctioned path. Frozen once any ballot exists for the election.
 */
exports.upsertCandidate = onCall({ invoker: 'public' }, async (request) => {
  try {
  const data = request.data || {};
  const normalized = normalizeCandidateInput(data, data.id);
  const electionId = normalized.electionId;
  await assertElectionConfigWritable(db, request.auth, electionId);
  await assertCandidatesMutable(electionId);

  const positionSnap = await db.doc(`positions/${normalized.positionId}`).get();
  if (!positionSnap.exists) throw new HttpsError('invalid-argument', `Unknown position: ${normalized.positionId}.`);

  const isUpdate = !!normalized.id;
  let ref;
  if (isUpdate) {
    const existing = await db.doc(`candidates/${normalized.id}`).get();
    if (!existing.exists) throw new HttpsError('not-found', 'Candidate was not found.');
    if (existing.data().electionId !== electionId) {
      throw new HttpsError('invalid-argument', 'Candidate electionId mismatch.');
    }
    ref = db.doc(`candidates/${normalized.id}`);
  } else {
    ref = db.collection('candidates').doc();
  }

  const payload = {
    electionId,
    positionId: normalized.positionId,
    name: normalized.name,
    section: normalized.section,
    yearLevel: normalized.yearLevel,
    platform: normalized.platform,
    goals: normalized.goals,
    bio: normalized.bio,
    party: normalized.party,
    order: normalized.order,
    active: normalized.active,
    photoURL: normalized.photoURL,
    photoPath: normalized.photoPath,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (!isUpdate) payload.createdAt = FieldValue.serverTimestamp();

  await ref.set(payload, { merge: true });
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: isUpdate ? 'candidate.update' : 'candidate.create',
    target: `candidates/${ref.id}`,
    electionId,
    details: { positionId: normalized.positionId, active: normalized.active },
  });
  return { ok: true, id: ref.id };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('upsertCandidate unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for upsertCandidate: ' + msg + '. Run firebase deploy --only firestore.');
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      throw new HttpsError('permission-denied', msg);
    }
    throw new HttpsError('internal', 'upsertCandidate failed: ' + msg);
  }
});

exports.setCandidateActive = onCall({ invoker: 'public' }, async (request) => {
  try {
  const data = request.data || {};
  const candidateId = typeof data.candidateId === 'string' ? data.candidateId : '';
  const active = data.active === true;
  if (!candidateId) throw new HttpsError('invalid-argument', 'candidateId is required.');
  const snap = await db.doc(`candidates/${candidateId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Candidate was not found.');
  const electionId = snap.data().electionId || DEFAULT_ELECTION_ID;
  await assertElectionConfigWritable(db, request.auth, electionId);
  await assertCandidatesMutable(electionId);
  await db.doc(`candidates/${candidateId}`).update({ active, updatedAt: FieldValue.serverTimestamp() });
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'candidate.active.set',
    target: `candidates/${candidateId}`,
    electionId,
    details: { active },
  });
  return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('setCandidateActive unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for setCandidateActive: ' + msg + '. Run firebase deploy --only firestore.');
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      throw new HttpsError('permission-denied', msg);
    }
    throw new HttpsError('internal', 'setCandidateActive failed: ' + msg);
  }
});

exports.setCandidateArchived = onCall({ invoker: 'public' }, async (request) => {
  try {
  const data = request.data || {};
  const candidateId = typeof data.candidateId === 'string' ? data.candidateId : '';
  const archived = data.archived === true;
  if (!candidateId) throw new HttpsError('invalid-argument', 'candidateId is required.');
  const snap = await db.doc(`candidates/${candidateId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Candidate was not found.');
  const electionId = snap.data().electionId || DEFAULT_ELECTION_ID;
  await assertElectionConfigWritable(db, request.auth, electionId);
  await assertCandidatesMutable(electionId);
  await db.doc(`candidates/${candidateId}`).update({ archived, updatedAt: FieldValue.serverTimestamp() });
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'candidate.archived.set',
    target: `candidates/${candidateId}`,
    electionId,
    details: { archived },
  });
  return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('setCandidateArchived unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for setCandidateArchived: ' + msg + '. Run firebase deploy --only firestore.');
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      throw new HttpsError('permission-denied', msg);
    }
    throw new HttpsError('internal', 'setCandidateArchived failed: ' + msg);
  }
});

exports.deleteCandidate = onCall({ invoker: 'public' }, async (request) => {
  try {
  const data = request.data || {};
  const candidateId = typeof data.candidateId === 'string' ? data.candidateId : '';
  if (!candidateId) throw new HttpsError('invalid-argument', 'candidateId is required.');
  const snap = await db.doc(`candidates/${candidateId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Candidate was not found.');
  const electionId = snap.data().electionId || DEFAULT_ELECTION_ID;
  await assertElectionConfigWritable(db, request.auth, electionId);
  await assertCandidatesMutable(electionId);
  await db.doc(`candidates/${candidateId}`).delete();
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'candidate.delete',
    target: `candidates/${candidateId}`,
    electionId,
    details: {},
  });
  return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('deleteCandidate unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for deleteCandidate: ' + msg + '. Run firebase deploy --only firestore.');
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      throw new HttpsError('permission-denied', msg);
    }
    throw new HttpsError('internal', 'deleteCandidate failed: ' + msg);
  }
});