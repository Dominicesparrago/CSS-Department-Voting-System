'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assertElectionConfigWritable, actorRole } = require('./authGuards');
const { writeAudit } = require('./audit');
const { DEFAULT_ELECTION_ID } = require('./constants');
const { processCandidateImport } = require('./candidateImportLogic');

const db = getFirestore();

/**
 * Batch upsert candidates for an election (admin). The client sends normalized
 * rows (already parsed from CSV/XLSX); this function re-validates every row
 * authoritatively, rejects duplicates/invalid rows, and merges the rest into
 * candidates/{id} — the only path that creates candidate documents.
 */
exports.importCandidates = onCall(async (request) => {
  const data = request.data || {};
  const electionId = typeof data.electionId === 'string' ? data.electionId : DEFAULT_ELECTION_ID;
  await assertElectionConfigWritable(db, request.auth, electionId);

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
});