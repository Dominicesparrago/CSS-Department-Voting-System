'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { assertSuperAdmin, actorRole } = require('./authGuards');
const { writeAudit } = require('./audit');
const { DEFAULT_ELECTION_ID } = require('./constants');
const { readAllDocs, readDocsWhere } = require('./dbHelpers');
const {
  buildBackupPayload,
  serializeBackup,
  checksumOf,
  deserializeBackup,
  validateBackupPayload,
} = require('./backupLogic');

const db = getFirestore();

function requireBackupId(data) {
  const backupId = typeof (data || {}).backupId === 'string' ? data.backupId : '';
  if (!backupId) throw new HttpsError('invalid-argument', 'Backup id is required.');
  return backupId;
}

/**
 * Create an election-scoped backup (superadmin). Snapshots the election's
 * candidates, anonymous ballots, tally, and participation locks into a single
 * JSON blob in Storage, with a checksum and metadata record. Ballots contain no
 * uid/timestamp, so a backup never links a vote to a person.
 */
exports.createBackup = onCall(async (request) => {
  assertSuperAdmin(request.auth);
  const data = request.data || {};
  const electionId = typeof data.electionId === 'string' ? data.electionId : DEFAULT_ELECTION_ID;
  const type = data.type === 'pre-reset' ? 'pre-reset' : 'manual';

  const electionSnap = await db.doc(`elections/${electionId}`).get();
  if (!electionSnap.exists) throw new HttpsError('not-found', 'Election was not found.');

  const [candidates, ballots, voters, tallySnap] = await Promise.all([
    readDocsWhere(db, 'candidates', 'electionId', electionId),
    readDocsWhere(db, 'ballots', 'electionId', electionId),
    readAllDocs(db, 'voters'),
    db.doc(`tallies/${electionId}`).get(),
  ]);

  const participation = [];
  voters.forEach((d) => {
    const v = d.data();
    if (v.hasVoted && v.hasVoted[electionId] === true) {
      participation.push({
        uid: d.id,
        hasVoted: true,
        votedAt: v.votedAt && v.votedAt[electionId] ? v.votedAt[electionId] : null,
      });
    }
  });

  const payload = buildBackupPayload({
    electionId,
    type,
    candidates: candidates.map((d) => ({ id: d.id, ...d.data() })),
    ballots: ballots.map((d) => ({ id: d.id, ...d.data() })),
    tally: tallySnap.exists ? tallySnap.data() : null,
    participation,
    createdAt: new Date(),
  });

  const text = serializeBackup(payload);
  const checksum = checksumOf(text);
  const backupId = db.collection('backups').doc().id;
  const storagePath = `backups/${backupId}.json`;
  const buffer = Buffer.from(text, 'utf8');

  const file = getStorage().bucket().file(storagePath);
  await file.save(buffer, { contentType: 'application/json', resumable: false });
  let sizeBytes = buffer.length;
  try {
    const [meta] = await file.getMetadata();
    if (meta.size) sizeBytes = Number(meta.size);
  } catch {
    // fall back to buffer length
  }

  await db.doc(`backups/${backupId}`).set({
    electionId,
    type,
    storagePath,
    sizeBytes,
    checksum,
    recordCounts: {
      candidates: candidates.length,
      ballots: ballots.length,
      participation: participation.length,
      hasTally: tallySnap.exists ? 1 : 0,
    },
    actorUid: request.auth.uid,
    createdAt: FieldValue.serverTimestamp(),
    restoredAt: null,
    restoredBy: null,
  });

  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'backup.created',
    target: `backups/${backupId}`,
    electionId,
    details: { type, sizeBytes, candidates: candidates.length, ballots: ballots.length, participation: participation.length },
  });

  return { ok: true, backupId, storagePath, sizeBytes, checksum };
});

/**
 * Restore an election backup (superadmin). Verifies the checksum and schema,
 * then upserts candidates/ballots/tally/participation for that election. Never
 * touches persistent collections (roster, voter accounts, positions, etc.).
 */
exports.restoreBackup = onCall(async (request) => {
  assertSuperAdmin(request.auth);
  const data = request.data || {};
  const backupId = requireBackupId(data);
  const overwrite = data.overwrite === true;

  const metaSnap = await db.doc(`backups/${backupId}`).get();
  if (!metaSnap.exists) throw new HttpsError('not-found', 'Backup was not found.');
  const meta = metaSnap.data();

  const file = getStorage().bucket().file(meta.storagePath);
  const [fileExists] = await file.exists();
  if (!fileExists) throw new HttpsError('failed-precondition', 'The backup payload is missing from storage.');
  const [buffer] = await file.download();
  const text = buffer.toString('utf8');

  if (checksumOf(text) !== meta.checksum) {
    throw new HttpsError('data-loss', 'Backup checksum mismatch — the payload is corrupt. Restore aborted.');
  }
  let payload;
  try {
    payload = deserializeBackup(text);
  } catch {
    throw new HttpsError('invalid-argument', 'The backup payload is not valid JSON.');
  }
  const validation = validateBackupPayload(payload);
  if (!validation.ok) throw new HttpsError('invalid-argument', validation.reason);

  const electionId = payload.electionId;
  const electionSnap = await db.doc(`elections/${electionId}`).get();
  if (!electionSnap.exists) throw new HttpsError('failed-precondition', 'The backup refers to an election that no longer exists.');

  // Refuse to stack restored ballots on top of existing ones unless overwriting.
  const existingBallots = await readDocsWhere(db, 'ballots', 'electionId', electionId);
  if (existingBallots.length > 0 && payload.ballots.length > 0 && !overwrite) {
    throw new HttpsError('failed-precondition', `This election already has ${existingBallots.length} ballots. Restoring would duplicate them — pass overwrite to replace.`);
  }

  const now = FieldValue.serverTimestamp();
  const batchSet = async (collectionName, records) => {
    for (let i = 0; i < records.length; i += 400) {
      const batch = db.batch();
      records.slice(i, i + 400).forEach((rec) => {
        const { id, ...dataFields } = rec;
        batch.set(db.doc(`${collectionName}/${id}`), dataFields, { merge: true });
      });
      await batch.commit();
    }
  };

  if (overwrite && existingBallots.length > 0) {
    for (let i = 0; i < existingBallots.length; i += 400) {
      const batch = db.batch();
      existingBallots.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  await batchSet('candidates', payload.candidates);
  await batchSet('ballots', payload.ballots);

  if (payload.tally) {
    await db.doc(`tallies/${electionId}`).set({ ...payload.tally, updatedAt: now }, { merge: true });
  } else if (overwrite) {
    const tallyRef = db.doc(`tallies/${electionId}`);
    if ((await tallyRef.get()).exists) await tallyRef.delete();
  }

  // Restore participation locks (hasVoted/votedAt) for the election.
  if (payload.participation.length) {
    for (let i = 0; i < payload.participation.length; i += 400) {
      const batch = db.batch();
      payload.participation.slice(i, i + 400).forEach((p) => {
        const voterRef = db.doc(`voters/${p.uid}`);
        const lockPatch = {
          [`hasVoted.${electionId}`]: true,
          updatedAt: now,
        };
        if (p.votedAt) lockPatch[`votedAt.${electionId}`] = p.votedAt;
        batch.update(voterRef, lockPatch);
      });
      await batch.commit();
    }
  }

  await db.doc(`backups/${backupId}`).update({
    restoredAt: now,
    restoredBy: request.auth.uid,
  });
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'backup.restored',
    target: `backups/${backupId}`,
    electionId,
    details: { overwrite, candidates: payload.candidates.length, ballots: payload.ballots.length, participation: payload.participation.length },
  });

  return {
    ok: true,
    electionId,
    counts: { candidates: payload.candidates.length, ballots: payload.ballots.length, participation: payload.participation.length },
  };
});

/** Delete a backup (superadmin): metadata record + storage payload. */
exports.deleteBackup = onCall(async (request) => {
  assertSuperAdmin(request.auth);
  const backupId = requireBackupId(request.data);
  const metaSnap = await db.doc(`backups/${backupId}`).get();
  if (!metaSnap.exists) throw new HttpsError('not-found', 'Backup was not found.');
  const meta = metaSnap.data();
  try {
    await getStorage().bucket().file(meta.storagePath).delete();
  } catch {
    // payload may already be gone; the metadata delete is what matters
  }
  await db.doc(`backups/${backupId}`).delete();
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'backup.deleted',
    target: `backups/${backupId}`,
    electionId: meta.electionId || undefined,
    details: { storagePath: meta.storagePath },
  });
  return { ok: true };
});
