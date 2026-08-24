'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { assertSuperAdmin, assertAdmin, actorRole, isSuperAdminAuth } = require('./authGuards');
const { writeAudit } = require('./audit');
const { DEFAULT_ELECTION_ID } = require('./constants');
const { readAllDocs, readDocsWhere, batchDeleteByIds, chunk } = require('./dbHelpers');
const { isResetScope, scopeDefinition, preservedDataList } = require('./resetLogic');
const { parseDate } = require('./tally');
const { resolveElectionTransition } = require('./electionStateMachine');

const db = getFirestore();

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

/**
 * Create a new draft election (superadmin). The ballot defaults to the current
 * positions whitelist unless one is provided.
 */
exports.createElection = onCall(async (request) => {
  assertSuperAdmin(request.auth);
  const data = request.data || {};
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (title.length < 2) throw new HttpsError('invalid-argument', 'Election title is required.');

  const positions = Array.isArray(data.positions)
    ? data.positions.map(String).filter((p) => p.length > 0 && p.length <= 64)
    : [];
  if (positions.length) {
    const existing = await db.getAll(positions.map((id) => db.doc(`positions/${id}`)));
    const missing = existing.filter((d) => !d.exists).map((d) => d.id);
    if (missing.length) throw new HttpsError('invalid-argument', `Unknown position(s): ${missing.join(', ')}.`);
  }

  const id = data.id && /^[a-z0-9_-]{3,64}$/.test(data.id)
    ? data.id
    : `${slugify(title) || 'election'}_${Date.now()}`;

  await db.doc(`elections/${id}`).set({
    title,
    status: 'draft',
    registrationOpen: false,
    positions,
    eligibleSections: Array.isArray(data.eligibleSections) ? data.eligibleSections.map(String).filter(Boolean) : [],
    openAt: data.openAt !== undefined ? parseDate(data.openAt) : null,
    closeAt: data.closeAt !== undefined ? parseDate(data.closeAt) : null,
    metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : {},
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'election.create',
    target: `elections/${id}`,
    electionId: id,
    details: { title, positions: positions.length },
  });
  return { ok: true, id };
});

/** Update an existing election's configurable fields (superadmin). */
exports.updateElection = onCall(async (request) => {
  assertSuperAdmin(request.auth);
  const data = request.data || {};
  const electionId = typeof data.electionId === 'string' ? data.electionId : '';
  if (!electionId) throw new HttpsError('invalid-argument', 'Election id is required.');

  const ref = db.doc(`elections/${electionId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Election was not found.');
  const current = snap.data();
  if (current.status === 'finalized' && data.force !== true) {
    throw new HttpsError('failed-precondition', 'This election is finalized. Use force to apply a superadmin emergency edit (audited).');
  }

  const patch = { updatedAt: FieldValue.serverTimestamp() };
  const changed = [];
  if (typeof data.title === 'string') {
    const t = data.title.trim();
    if (t.length < 2) throw new HttpsError('invalid-argument', 'Election title is too short.');
    patch.title = t;
    changed.push('title');
  }
  if (data.positions !== undefined) {
    if (!Array.isArray(data.positions)) throw new HttpsError('invalid-argument', 'positions must be an array.');
    const ids = data.positions.map(String).filter((p) => p.length > 0);
    const existing = await db.getAll(ids.map((id) => db.doc(`positions/${id}`)));
    const missing = existing.filter((d) => !d.exists).map((d) => d.id);
    if (missing.length) throw new HttpsError('invalid-argument', `Unknown position(s): ${missing.join(', ')}.`);
    patch.positions = ids;
    changed.push('positions');
  }
  if (data.eligibleSections !== undefined) {
    if (!Array.isArray(data.eligibleSections)) throw new HttpsError('invalid-argument', 'eligibleSections must be an array.');
    patch.eligibleSections = data.eligibleSections.map(String).map((s) => s.trim()).filter(Boolean).sort();
    changed.push('eligibleSections');
  }
  if (data.openAt !== undefined) {
    patch.openAt = parseDate(data.openAt);
    changed.push('openAt');
  }
  if (data.closeAt !== undefined) {
    patch.closeAt = parseDate(data.closeAt);
    changed.push('closeAt');
  }
  if (data.metadata !== undefined) {
    if (!data.metadata || typeof data.metadata !== 'object' || Array.isArray(data.metadata)) {
      throw new HttpsError('invalid-argument', 'metadata must be an object.');
    }
    patch.metadata = data.metadata;
    changed.push('metadata');
  }
  if (changed.length === 0) throw new HttpsError('invalid-argument', 'Nothing to update.');

  await ref.update(patch);
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'election.update',
    target: `elections/${electionId}`,
    electionId,
    details: { fields: changed, force: data.force === true },
  });
  return { ok: true };
});

/**
 * Open or close an election through the enforced state machine (admin). This is
 * the ONLY sanctioned path for draft->open / open->closed; reopening a closed
 * election requires a superadmin force (audited). Clients may no longer write
 * election documents directly — the rules deny it and every transition is
 * audited here.
 */
exports.setElectionStatus = onCall(async (request) => {
  await assertAdmin(db, request.auth);
  const data = request.data || {};
  const electionId = typeof data.electionId === 'string' && data.electionId ? data.electionId : DEFAULT_ELECTION_ID;
  const nextStatus = typeof data.status === 'string' ? data.status.trim() : '';
  const force = data.force === true;

  const ref = db.doc(`elections/${electionId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Election was not found.');
  const current = snap.data();

  const decision = resolveElectionTransition({
    currentStatus: current.status,
    nextStatus,
    locked: current.locked === true,
    isSuperadmin: isSuperAdminAuth(request.auth),
    force,
  });
  if (!decision.ok) throw new HttpsError(decision.code, decision.message);

  await ref.update({ status: nextStatus, updatedAt: FieldValue.serverTimestamp() });
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'election.status.set',
    target: `elections/${electionId}`,
    electionId,
    details: { from: current.status, to: nextStatus, force },
  });
  return { ok: true, from: current.status, to: nextStatus };
});

/** Open or close registration (admin). Refused while the election is locked/finalized. */
exports.setRegistrationOpen = onCall(async (request) => {
  await assertAdmin(db, request.auth);
  const data = request.data || {};
  const electionId = typeof data.electionId === 'string' && data.electionId ? data.electionId : DEFAULT_ELECTION_ID;
  if (typeof data.registrationOpen !== 'boolean') {
    throw new HttpsError('invalid-argument', 'registrationOpen must be a boolean.');
  }

  const ref = db.doc(`elections/${electionId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Election was not found.');
  const current = snap.data();
  if (!isSuperAdminAuth(request.auth)) {
    if (current.locked === true) throw new HttpsError('failed-precondition', 'Election data is locked.');
    if (current.status === 'finalized') throw new HttpsError('failed-precondition', 'Election results are finalized.');
  }
  if (!['draft', 'open', 'closed'].includes(current.status)) {
    throw new HttpsError('failed-precondition', `Registration cannot change while the election is ${current.status}.`);
  }

  await ref.update({ registrationOpen: data.registrationOpen, updatedAt: FieldValue.serverTimestamp() });
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'election.registration.set',
    target: `elections/${electionId}`,
    electionId,
    details: { registrationOpen: data.registrationOpen },
  });
  return { ok: true };
});

/**
 * Configure which sections may vote (admin). Empty list = all active, eligible
 * roster students. Sections are normalized to the canonical BSCS-<year><letter>
 * format server-side so client normalization can never diverge.
 */
exports.setEligibleSections = onCall(async (request) => {
  const { normalizeSection } = require('./rosterLogic');
  await assertAdmin(db, request.auth);
  const data = request.data || {};
  const electionId = typeof data.electionId === 'string' && data.electionId ? data.electionId : DEFAULT_ELECTION_ID;
  if (!Array.isArray(data.sections)) {
    throw new HttpsError('invalid-argument', 'sections must be an array.');
  }
  if (data.sections.length > 64) {
    throw new HttpsError('invalid-argument', 'At most 64 sections may be listed.');
  }
  const sections = Array.from(new Set(data.sections.map((s) => normalizeSection(String(s))).filter(Boolean))).sort();
  if (sections.some((s) => s.length > 32)) {
    throw new HttpsError('invalid-argument', 'Section names are too long.');
  }

  const ref = db.doc(`elections/${electionId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Election was not found.');
  const current = snap.data();
  if (!isSuperAdminAuth(request.auth)) {
    if (current.locked === true) throw new HttpsError('failed-precondition', 'Election data is locked.');
    if (current.status === 'finalized') throw new HttpsError('failed-precondition', 'Election results are finalized.');
  }
  if (!['draft', 'open'].includes(current.status)) {
    throw new HttpsError('failed-precondition', `Eligibility cannot change while the election is ${current.status}.`);
  }

  await ref.update({ eligibleSections: sections, updatedAt: FieldValue.serverTimestamp() });
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'election.eligibleSections.set',
    target: `elections/${electionId}`,
    electionId,
    details: { sections, count: sections.length },
  });
  return { ok: true, sections };
});

/**
 * Irreversible election reset for a fresh cycle. This removes the election's
 * candidates, ballots, tally, voter records, identity indexes, and imported
 * student roster. The election document, positions, admin accounts, config,
 * and audit history remain so the election can be configured again.
 *
 * Safety: only permitted on a closed/draft election (never open/published), so
 * in-flight votes can never race the deletion pipeline.
 */
exports.resetAllElectionData = onCall(async (request) => {
  assertSuperAdmin(request.auth);
  const data = request.data || {};
  const electionId = typeof data.electionId === 'string' ? data.electionId : '';
  const confirmation = typeof data.confirmation === 'string' ? data.confirmation : '';
  const requiredConfirmation = 'DELETE ALL STUDENT AND CANDIDATE DATA';

  if (!electionId) throw new HttpsError('invalid-argument', 'Election id is required.');
  if (confirmation !== requiredConfirmation) {
    throw new HttpsError('failed-precondition', `Type exactly: ${requiredConfirmation}`);
  }

  const electionRef = db.doc(`elections/${electionId}`);
  const electionSnap = await electionRef.get();
  if (!electionSnap.exists) throw new HttpsError('not-found', 'Election was not found.');
  const electionStatus = electionSnap.data().status;
  if (electionSnap.data().locked === true) {
    throw new HttpsError('failed-precondition', 'Unlock the election before resetting all data.');
  }
  if (!['draft', 'closed'].includes(electionStatus)) {
    throw new HttpsError('failed-precondition', `Close the election before resetting (current status: ${electionStatus}).`);
  }

  const [candidates, ballots, voters, rosterStudents, studentIndexes, emailIndexes] = await Promise.all([
    readDocsWhere(db, 'candidates', 'electionId', electionId),
    readDocsWhere(db, 'ballots', 'electionId', electionId),
    readAllDocs(db, 'voters'),
    readAllDocs(db, 'students'),
    readAllDocs(db, 'studentIndex'),
    readAllDocs(db, 'emailIndex'),
  ]);

  const deleted = {
    candidates: await batchDeleteByIds(db, 'candidates', candidates.map((d) => d.id)),
    ballots: await batchDeleteByIds(db, 'ballots', ballots.map((d) => d.id)),
    voters: await batchDeleteByIds(db, 'voters', voters.map((d) => d.id)),
    students: await batchDeleteByIds(db, 'students', rosterStudents.map((d) => d.id)),
    studentIndexes: await batchDeleteByIds(db, 'studentIndex', studentIndexes.map((d) => d.id)),
    emailIndexes: await batchDeleteByIds(db, 'emailIndex', emailIndexes.map((d) => d.id)),
    tallies: 0,
    authUsers: 0,
  };

  // Voter documents are the application-side identity registry. Remove the
  // matching Firebase Auth accounts as well, in chunks supported by Admin SDK.
  for (let i = 0; i < voters.length; i += 1000) {
    const result = await getAuth().deleteUsers(voters.slice(i, i + 1000).map((d) => d.id));
    deleted.authUsers += result.successCount;
  }

  const tallyRef = db.doc(`tallies/${electionId}`);
  if ((await tallyRef.get()).exists) {
    await tallyRef.delete();
    deleted.tallies = 1;
  }

  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'election.reset-all-data',
    target: `elections/${electionId}`,
    electionId,
    details: { deleted, confirmationRequired: requiredConfirmation, fromStatus: electionStatus },
  });

  return { ok: true, electionId, deleted };
});

/** Archive a completed election (superadmin). */
exports.archiveElection = onCall(async (request) => {
  assertSuperAdmin(request.auth);
  const electionId = typeof (request.data || {}).electionId === 'string' ? request.data.electionId : '';
  if (!electionId) throw new HttpsError('invalid-argument', 'Election id is required.');
  const snap = await db.doc(`elections/${electionId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Election was not found.');
  const status = snap.data().status;
  if (!['closed', 'published', 'finalized'].includes(status)) {
    throw new HttpsError('failed-precondition', `Only completed elections can be archived (current status: ${status}).`);
  }
  await db.doc(`elections/${electionId}`).update({
    status: 'archived',
    archivedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'election.archive',
    target: `elections/${electionId}`,
    electionId,
    details: { from: status },
  });
  return { ok: true };
});

/** Restore an archived election back to draft (superadmin). */
exports.restoreElection = onCall(async (request) => {
  assertSuperAdmin(request.auth);
  const electionId = typeof (request.data || {}).electionId === 'string' ? request.data.electionId : '';
  if (!electionId) throw new HttpsError('invalid-argument', 'Election id is required.');
  const snap = await db.doc(`elections/${electionId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Election was not found.');
  if (snap.data().status !== 'archived') throw new HttpsError('failed-precondition', 'Only archived elections can be restored.');
  await db.doc(`elections/${electionId}`).update({
    status: 'draft',
    archivedAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'election.restore',
    target: `elections/${electionId}`,
    electionId,
    details: {},
  });
  return { ok: true };
});

/** Lock an election (superadmin). While locked, ordinary admin edits and voting are refused. */
exports.lockElection = onCall(async (request) => {
  assertSuperAdmin(request.auth);
  const electionId = typeof (request.data || {}).electionId === 'string' ? request.data.electionId : '';
  if (!electionId) throw new HttpsError('invalid-argument', 'Election id is required.');
  const snap = await db.doc(`elections/${electionId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Election was not found.');
  const status = snap.data().status;
  if (status === 'finalized' || status === 'archived') {
    throw new HttpsError('failed-precondition', `A ${status} election cannot be locked.`);
  }
  await db.doc(`elections/${electionId}`).update({
    locked: true,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'election.lock',
    target: `elections/${electionId}`,
    electionId,
    details: {},
  });
  return { ok: true };
});

/** Unlock an election (superadmin). Audited. Refused once finalized/archived — those are immutable states. */
exports.unlockElection = onCall(async (request) => {
  assertSuperAdmin(request.auth);
  const electionId = typeof (request.data || {}).electionId === 'string' ? request.data.electionId : '';
  if (!electionId) throw new HttpsError('invalid-argument', 'Election id is required.');
  const snap = await db.doc(`elections/${electionId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Election was not found.');
  const status = snap.data().status;
  if (status === 'finalized' || status === 'archived') {
    throw new HttpsError('failed-precondition', `A ${status} election cannot be unlocked.`);
  }
  await db.doc(`elections/${electionId}`).update({
    locked: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'election.unlock',
    target: `elections/${electionId}`,
    electionId,
    details: {},
  });
  return { ok: true };
});

/**
 * Affected-record counts for a proposed reset. Ballots are never client-readable,
 * so this must come from the server.
 */
exports.estimateReset = onCall(async (request) => {
  assertSuperAdmin(request.auth);
  const electionId = typeof (request.data || {}).electionId === 'string' ? request.data.electionId : DEFAULT_ELECTION_ID;
  const electionSnap = await db.doc(`elections/${electionId}`).get();
  if (!electionSnap.exists) throw new HttpsError('not-found', 'Election was not found.');

  const [candidates, ballots, voters, tallies, positions] = await Promise.all([
    readDocsWhere(db, 'candidates', 'electionId', electionId),
    readDocsWhere(db, 'ballots', 'electionId', electionId),
    readAllDocs(db, 'voters'),
    readDocsWhere(db, 'tallies', 'electionId', electionId),
    db.collection('positions').count().get().then((s) => s.data().count).catch(() => 0),
  ]);
  const votersLocked = voters.filter((d) => d.data().hasVoted && d.data().hasVoted[electionId] === true).length;

  return {
    electionId,
    electionTitle: electionSnap.data().title || '',
    candidates: candidates.length,
    ballots: ballots.length,
    tallies: tallies.length,
    votersLocked,
    positions,
  };
});

// scope -> which data to reset. 'assignments' maps to candidates in this schema.
const SCOPE_PLAN = {
  candidates: { candidates: true, ballots: false, tallies: false, locks: false },
  assignments: { candidates: true, ballots: false, tallies: false, locks: false },
  voters: { candidates: false, ballots: false, tallies: false, locks: true },
  ballots: { candidates: false, ballots: true, tallies: true, locks: true },
  full: { candidates: true, ballots: true, tallies: true, locks: true },
};

async function verifyBackupForReset(backupId, electionId) {
  const snap = await db.doc(`backups/${backupId}`).get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'A backup must be created before a destructive reset. Create a backup first.');
  const meta = snap.data();
  if (meta.electionId !== electionId) {
    throw new HttpsError('failed-precondition', 'The backup is for a different election. Create a fresh backup for this election.');
  }
  const [exists] = await getStorage().bucket().file(meta.storagePath).exists();
  if (!exists) throw new HttpsError('failed-precondition', 'The backup payload is missing from storage. Reset aborted.');
  return meta;
}

async function clearVoterLocks(electionId) {
  const voters = await readAllDocs(db, 'voters');
  const toClear = voters.filter((d) => {
    const v = d.data();
    return (v.hasVoted && v.hasVoted[electionId] === true) || (v.votedAt && v.votedAt[electionId]);
  }).map((d) => d.id);
  let cleared = 0;
  await chunk(toClear, 400, async (ids) => {
    const batch = db.batch();
    ids.forEach((uid) => {
      batch.update(db.doc(`voters/${uid}`), {
        [`hasVoted.${electionId}`]: FieldValue.delete(),
        [`votedAt.${electionId}`]: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    cleared += ids.length;
  });
  return cleared;
}

/**
 * Election-scoped destructive reset (superadmin only). Requires a fresh backup
 * for the election; refuses otherwise. The election must be locked AND in a
 * quiescent state (draft/closed) so a live vote can never interleave with the
 * deletion batches (which would open a double-vote window). Batches writes;
 * never touches persistent data (roster, positions, voter accounts, admin
 * registry, config, audit, or any other election).
 */
exports.resetElectionData = onCall(async (request) => {
  assertSuperAdmin(request.auth);
  const data = request.data || {};
  const electionId = typeof data.electionId === 'string' ? data.electionId : '';
  const scope = data.scope;
  const backupId = typeof data.backupId === 'string' ? data.backupId : '';

  if (!electionId) throw new HttpsError('invalid-argument', 'Election id is required.');
  if (!isResetScope(scope)) throw new HttpsError('invalid-argument', `Unknown reset scope "${scope}".`);
  if (!backupId) throw new HttpsError('invalid-argument', 'A backup id is required before any destructive reset.');

  const electionSnap = await db.doc(`elections/${electionId}`).get();
  if (!electionSnap.exists) throw new HttpsError('not-found', 'Election was not found.');
  const current = electionSnap.data();
  if (current.locked !== true) {
    throw new HttpsError('failed-precondition', 'Lock the election before running a scoped reset.');
  }
  if (!['draft', 'closed'].includes(current.status)) {
    throw new HttpsError('failed-precondition', `Scoped resets require a draft or closed election (current status: ${current.status}).`);
  }

  await verifyBackupForReset(backupId, electionId);

  const plan = SCOPE_PLAN[scope];
  const deleted = { candidates: 0, ballots: 0, tallies: 0, votersLocked: 0 };

  // Safety: clearing participation locks while ballots still exist would leave
  // turnout (locks) inconsistent with ballots — refuse unless explicitly forced.
  if (plan.locks && !plan.ballots) {
    const ballots = await readDocsWhere(db, 'ballots', 'electionId', electionId);
    if (ballots.length > 0 && data.force !== true) {
      throw new HttpsError('failed-precondition', `This election already has ${ballots.length} ballots. Resetting voter status alone would make turnout inconsistent — use the ballots reset, or pass force.`);
    }
  }

  if (plan.candidates) {
    const candidates = await readDocsWhere(db, 'candidates', 'electionId', electionId);
    deleted.candidates = await batchDeleteByIds(db, 'candidates', candidates.map((d) => d.id));
  }
  if (plan.ballots) {
    const ballots = await readDocsWhere(db, 'ballots', 'electionId', electionId);
    deleted.ballots = await batchDeleteByIds(db, 'ballots', ballots.map((d) => d.id));
  }
  if (plan.tallies) {
    const tallyRef = db.doc(`tallies/${electionId}`);
    if ((await tallyRef.get()).exists) {
      await tallyRef.delete();
      deleted.tallies = 1;
    }
  }
  if (plan.locks) {
    deleted.votersLocked = await clearVoterLocks(electionId);
  }

  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: `reset.${scope}`,
    target: `elections/${electionId}`,
    electionId,
    details: {
      scope,
      backupId,
      deleted,
      preserved: preservedDataList(),
      label: scopeDefinition(scope).label,
    },
  });

  return { ok: true, scope, deleted, preserved: preservedDataList() };
});
