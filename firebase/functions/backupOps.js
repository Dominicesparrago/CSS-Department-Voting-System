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

function toHttpsError(error, fallbackCode, fallbackMessage) {
  if (error && error.code && typeof error.code === 'string' && error.message) {
    // Already an HttpsError – preserve it
    if (['unauthenticated','permission-denied','invalid-argument','not-found','failed-precondition','already-exists','data-loss','aborted','out-of-range','unimplemented','internal','unavailable'].includes(error.code)) {
      throw error;
    }
  }
  console.error(`[${fallbackCode}] ${fallbackMessage}:`, error);
  throw new HttpsError(fallbackCode, fallbackMessage);
}

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

  try {
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

    // Storage: wrap separately so bucket misconfiguration surfaces as actionable error
    let file;
    try {
      file = getStorage().bucket().file(storagePath);
    } catch (storageError) {
      console.error('createBackup: getStorage bucket error:', storageError);
      throw new HttpsError('unavailable', 'Backup storage is not configured. Check Storage bucket and service account permissions.');
    }
    try {
      await file.save(buffer, { contentType: 'application/json', resumable: false });
    } catch (storageError) {
      console.error('createBackup: file.save error:', storageError);
      throw new HttpsError('unavailable', `Unable to save backup to Storage (${storageError.message || 'unknown error'}). Check Storage rules and bucket permissions.`);
    }
    let sizeBytes = buffer.length;
    try {
      const [meta] = await file.getMetadata();
      if (meta.size) sizeBytes = Number(meta.size);
    } catch {
      // fall back to buffer length
    }

    try {
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
    } catch (dbError) {
      // best-effort cleanup of orphaned storage payload
      await file.delete().catch(() => {});
      console.error('createBackup: Firestore write error:', dbError);
      throw new HttpsError('unavailable', `Unable to record backup metadata (${dbError.message || 'unknown error'}).`);
    }

    await writeAudit(db, {
      actorUid: request.auth.uid,
      actorRole: actorRole(request.auth),
      action: 'backup.created',
      target: `backups/${backupId}`,
      electionId,
      details: { type, sizeBytes, candidates: candidates.length, ballots: ballots.length, participation: participation.length },
    });

    return { ok: true, backupId, storagePath, sizeBytes, checksum };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    return toHttpsError(error, 'internal', `Backup failed: ${error.message || 'unknown error'}`);
  }
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

  try {
    const metaSnap = await db.doc(`backups/${backupId}`).get();
    if (!metaSnap.exists) throw new HttpsError('not-found', 'Backup was not found.');
    const meta = metaSnap.data();

    let file;
    try {
      file = getStorage().bucket().file(meta.storagePath);
    } catch (storageError) {
      console.error('restoreBackup: bucket error:', storageError);
      throw new HttpsError('unavailable', 'Backup storage is not configured.');
    }
    let fileExists;
    try {
      [fileExists] = await file.exists();
    } catch (storageError) {
      console.error('restoreBackup: file.exists error:', storageError);
      throw new HttpsError('unavailable', `Unable to check backup payload in Storage (${storageError.message || 'unknown'}).`);
    }
    if (!fileExists) throw new HttpsError('failed-precondition', 'The backup payload is missing from storage.');
    let buffer;
    try {
      [buffer] = await file.download();
    } catch (storageError) {
      console.error('restoreBackup: file.download error:', storageError);
      throw new HttpsError('unavailable', `Unable to download backup payload (${storageError.message || 'unknown'}).`);
    }
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
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    return toHttpsError(error, 'internal', `Restore failed: ${error.message || 'unknown error'}`);
  }
});

/** Delete a backup (superadmin): metadata record + storage payload. */
exports.deleteBackup = onCall(async (request) => {
  assertSuperAdmin(request.auth);
  const backupId = requireBackupId(request.data);
  try {
    const metaSnap = await db.doc(`backups/${backupId}`).get();
    if (!metaSnap.exists) throw new HttpsError('not-found', 'Backup was not found.');
    const meta = metaSnap.data();
    try {
      await getStorage().bucket().file(meta.storagePath).delete();
    } catch (storageError) {
      console.warn('deleteBackup: storage delete warning:', storageError.message || storageError);
      // payload may already be gone; the metadata delete is what matters
    }
    try {
      await db.doc(`backups/${backupId}`).delete();
    } catch (dbError) {
      console.error('deleteBackup: Firestore delete error:', dbError);
      throw new HttpsError('unavailable', `Unable to delete backup record (${dbError.message || 'unknown'}).`);
    }
    await writeAudit(db, {
      actorUid: request.auth.uid,
      actorRole: actorRole(request.auth),
      action: 'backup.deleted',
      target: `backups/${backupId}`,
      electionId: meta.electionId || undefined,
      details: { storagePath: meta.storagePath },
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    return toHttpsError(error, 'internal', `Delete backup failed: ${error.message || 'unknown error'}`);
  }
});
