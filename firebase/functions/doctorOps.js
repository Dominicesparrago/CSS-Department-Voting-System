'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assertSuperAdmin, actorRole } = require('./authGuards');
const { writeAudit } = require('./audit');
const { DEFAULT_ELECTION_ID } = require('./constants');
const { readAllDocs, readDocsWhere, batchDeleteByIds } = require('./dbHelpers');
const { runIntegrityChecks, buildReport, repairsFromChecks } = require('./doctorLogic');
const { recomputeElectionTally } = require('./tally');

const db = getFirestore();
function toHttpsError(error, fallbackCode, fallbackMessage) {
  if (error instanceof HttpsError) throw error;
  if (error && error.code && ['unauthenticated','permission-denied','invalid-argument','not-found','failed-precondition','already-exists','data-loss','aborted','out-of-range','unimplemented','internal','unavailable'].includes(error.code)) throw error;
  console.error(`[${fallbackCode}] ${fallbackMessage}:`, error);
  throw new HttpsError(fallbackCode, fallbackMessage);
}


const MAX_IDS_RETURNED = 1000;

/** Run the read-only integrity scan. */
exports.databaseDoctor = onCall({ invoker: 'public' }, async (request) => {
  try {
  assertSuperAdmin(request.auth);
  const [voters, students, studentIndex, emailIndex, candidates, ballots, positions, elections, tallies] = await Promise.all([
    readAllDocs(db, 'voters'),
    readAllDocs(db, 'students'),
    readAllDocs(db, 'studentIndex'),
    readAllDocs(db, 'emailIndex'),
    readAllDocs(db, 'candidates'),
    readAllDocs(db, 'ballots'),
    readAllDocs(db, 'positions'),
    readAllDocs(db, 'elections'),
    readAllDocs(db, 'tallies'),
  ]);

  const checks = runIntegrityChecks({ voters, students, studentIndex, emailIndex, candidates, ballots, positions, elections, tallies });
  const report = buildReport(checks);
  const repairs = repairsFromChecks(checks, DEFAULT_ELECTION_ID);

  const cappedChecks = checks.map((c) => ({ ...c, ids: c.ids.slice(0, MAX_IDS_RETURNED) }));

  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'doctor.scan',
    target: 'database',
    details: {
      status: report.status,
      errorChecks: checks.filter((c) => c.status === 'error').length,
      warnChecks: checks.filter((c) => c.status === 'warn').length,
    },
  });

  return { ...report, checks: cappedChecks, repairs, scannedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('databaseDoctor unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for databaseDoctor: ' + msg + '. Run firebase deploy --only firestore.');
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      throw new HttpsError('permission-denied', msg);
    }
    throw new HttpsError('internal', 'databaseDoctor failed: ' + msg);
  }
});

/**
 * Apply a single, explicitly confirmed safe repair. The client only ever sends
 * back the ids the scan surfaced; each repair is audited.
 */
exports.databaseRepair = onCall({ invoker: 'public' }, async (request) => {
  try {
  assertSuperAdmin(request.auth);
  const data = request.data || {};
  const code = typeof data.code === 'string' ? data.code : '';
  const ids = Array.isArray(data.ids) ? data.ids.map(String).filter(Boolean) : [];
  const electionId = typeof data.electionId === 'string' ? data.electionId : DEFAULT_ELECTION_ID;
  let affected = 0;

  switch (code) {
    case 'delete_orphan_student_index':
      if (!ids.length) throw new HttpsError('invalid-argument', 'No student index records selected.');
      affected = await batchDeleteByIds(db, 'studentIndex', ids);
      break;
    case 'delete_orphan_email_index':
      if (!ids.length) throw new HttpsError('invalid-argument', 'No email index records selected.');
      affected = await batchDeleteByIds(db, 'emailIndex', ids);
      break;
    case 'recompute_tally':
      if (!ids.length) throw new HttpsError('invalid-argument', 'No tallies selected.');
      for (const eid of ids) {
        const tally = await recomputeElectionTally(db, eid);
        await db.doc(`tallies/${eid}`).set({ ...tally, updatedAt: FieldValue.serverTimestamp() });
        affected += 1;
      }
      break;
    case 'set_candidate_election':
      if (!ids.length) throw new HttpsError('invalid-argument', 'No candidates selected.');
      for (const cid of ids) {
        await db.doc(`candidates/${cid}`).update({ electionId, updatedAt: FieldValue.serverTimestamp() });
        affected += 1;
      }
      break;
    default:
      throw new HttpsError('invalid-argument', `Unknown repair action "${code}".`);
  }

  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: `repair.${code}`,
    target: 'database',
    electionId: code === 'recompute_tally' ? undefined : electionId,
    details: { affected, ids: ids.slice(0, 100) },
  });

  return { ok: true, code, affected };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('databaseRepair unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for databaseRepair: ' + msg + '. Run firebase deploy --only firestore.');
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      throw new HttpsError('permission-denied', msg);
    }
    throw new HttpsError('internal', 'databaseRepair failed: ' + msg);
  }
});
