'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { assertSuperAdmin, assertAdmin, actorRole, isSuperAdminAuth } = require('./authGuards');
const { writeAudit } = require('./audit');
const { DEFAULT_ELECTION_ID } = require('./constants');
const { readAllDocs, readDocsWhere, batchDeleteByIds, chunk } = require('./dbHelpers');
const { isResetScope, scopeDefinition, preservedDataList } = require('./resetLogic');
const { parseDate } = require('./tally');
const { resolveElectionTransition } = require('./electionStateMachine');
const { createRateLimiter } = require('./rateLimit');

const db = getFirestore();
const limiter = createRateLimiter({ db });
const RESET_PAGE_SIZE = 400;

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

function toHttpsError(error, fallbackCode, fallbackMessage) {
  if (error && error.code && typeof error.code === 'string' && error instanceof HttpsError) throw error;
  // Preserve already-thrown HttpsError by code string
  if (error && error.code && ['unauthenticated','permission-denied','invalid-argument','not-found','failed-precondition','already-exists','data-loss','aborted','out-of-range','unimplemented','internal','unavailable'].includes(error.code)) {
    throw error;
  }
  console.error(`[${fallbackCode}] ${fallbackMessage}:`, error);
  throw new HttpsError(fallbackCode, fallbackMessage);
}

/**
 * Create a new draft election (superadmin). The ballot defaults to the current
 * positions whitelist unless one is provided.
 */
exports.createElection = onCall({ invoker: 'public' }, async (request) => {
  try {
  await limiter.enforce(request, 'adminLight');
  assertSuperAdmin(request.auth);
  const data = request.data || {};
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (title.length < 2) throw new HttpsError('invalid-argument', 'Election title is required.');
  if (title.length > 120) throw new HttpsError('invalid-argument', 'Election title is too long (max 120).');
  if (Array.isArray(data.positions) && data.positions.length > 50) {
    throw new HttpsError('invalid-argument', 'At most 50 positions may be linked to an election.');
  }

  const positions = Array.isArray(data.positions)
    ? data.positions.map(String).filter((p) => p.length > 0 && p.length <= 64)
    : [];
  if (positions.length) {
    const existing = await db.getAll(...positions.map((id) => db.doc(`positions/${id}`)));
    const missing = existing.filter((d) => !d.exists).map((d) => d.id);
    if (missing.length) throw new HttpsError('invalid-argument', `Unknown position(s): ${missing.join(', ')}.`);
  }
  if (Array.isArray(data.eligibleSections) && data.eligibleSections.length > 64) {
    throw new HttpsError('invalid-argument', 'At most 64 eligible sections may be listed.');
  }
  if (data.metadata && typeof data.metadata === 'object' && JSON.stringify(data.metadata).length > 4096) {
    throw new HttpsError('invalid-argument', 'metadata is too large (max 4KB).');
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
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('createElection unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for createElection: ' + msg + '. Run firebase deploy --only firestore.');
    }
    throw new HttpsError('internal', 'createElection failed: ' + msg);
  }
});

/** Update an existing election's configurable fields (superadmin). */
exports.updateElection = onCall({ invoker: 'public' }, async (request) => {
  try {
  await limiter.enforce(request, 'adminLight');
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
    if (t.length > 120) throw new HttpsError('invalid-argument', 'Election title is too long (max 120).');
    patch.title = t;
    changed.push('title');
  }
  if (data.positions !== undefined) {
    if (!Array.isArray(data.positions)) throw new HttpsError('invalid-argument', 'positions must be an array.');
    if (data.positions.length > 50) throw new HttpsError('invalid-argument', 'At most 50 positions may be linked.');
    const ids = data.positions.map(String).filter((p) => p.length > 0 && p.length <= 64);
    if (ids.length > 50) throw new HttpsError('invalid-argument', 'At most 50 positions may be linked.');
    const existing = await db.getAll(...ids.map((id) => db.doc(`positions/${id}`)));
    const missing = existing.filter((d) => !d.exists).map((d) => d.id);
    if (missing.length) throw new HttpsError('invalid-argument', `Unknown position(s): ${missing.join(', ')}.`);
    patch.positions = ids;
    changed.push('positions');
  }
  if (data.eligibleSections !== undefined) {
    if (!Array.isArray(data.eligibleSections)) throw new HttpsError('invalid-argument', 'eligibleSections must be an array.');
    if (data.eligibleSections.length > 64) throw new HttpsError('invalid-argument', 'At most 64 eligible sections may be listed.');
    patch.eligibleSections = data.eligibleSections.map(String).map((s) => s.trim()).filter(Boolean).sort();
    if (patch.eligibleSections.length > 64) throw new HttpsError('invalid-argument', 'At most 64 eligible sections may be listed.');
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
    if (JSON.stringify(data.metadata).length > 4096) throw new HttpsError('invalid-argument', 'metadata is too large (max 4KB).');
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
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('updateElection unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for updateElection: ' + msg + '. Run firebase deploy --only firestore.');
    }
    throw new HttpsError('internal', 'updateElection failed: ' + msg);
  }
});

/**
 * Open or close an election through the enforced state machine (admin). This is
 * the ONLY sanctioned path for draft->open / open->closed; reopening a closed
 * election requires a superadmin force (audited). Clients may no longer write
 * election documents directly — the rules deny it and every transition is
 * audited here.
 */
exports.setElectionStatus = onCall({ invoker: 'public' }, async (request) => {
  try {
  await limiter.enforce(request, 'adminLight');
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
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('setElectionStatus unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for setElectionStatus: ' + msg + '. Run firebase deploy --only firestore.');
    }
    throw new HttpsError('internal', 'setElectionStatus failed: ' + msg);
  }
});

/** Open or close registration (admin). Refused while the election is locked/finalized. */
exports.setRegistrationOpen = onCall({ invoker: 'public' }, async (request) => {
  try {
  await limiter.enforce(request, 'adminLight');
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
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('setRegistrationOpen unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for setRegistrationOpen: ' + msg + '. Run firebase deploy --only firestore.');
    }
    throw new HttpsError('internal', 'setRegistrationOpen failed: ' + msg);
  }
});

/** Save or clear the automatic close time. Admins may schedule it while editable. */
exports.setElectionCloseAt = onCall({ invoker: 'public' }, async (request) => {
  try {
    await limiter.enforce(request, 'adminLight');
    await assertAdmin(db, request.auth);
    const data = request.data || {};
    const electionId = typeof data.electionId === 'string' && data.electionId ? data.electionId : DEFAULT_ELECTION_ID;
    const ref = db.doc(`elections/${electionId}`);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Election was not found.');
    const current = snap.data();
    if (!isSuperAdminAuth(request.auth) && (current.locked === true || current.status === 'finalized')) {
      throw new HttpsError('failed-precondition', 'Election data is locked.');
    }
    const rawCloseAt = data.closeAt;
    const closeAt = rawCloseAt === null || rawCloseAt === '' ? null : parseDate(rawCloseAt);
    if (rawCloseAt !== null && rawCloseAt !== '' && !closeAt) {
      throw new HttpsError('invalid-argument', 'Enter a valid close date and time.');
    }
    if (closeAt && closeAt.toMillis() <= Date.now()) {
      throw new HttpsError('invalid-argument', 'The automatic close time must be in the future.');
    }
    await ref.update({ closeAt, updatedAt: FieldValue.serverTimestamp() });
    await writeAudit(db, {
      actorUid: request.auth.uid,
      actorRole: actorRole(request.auth),
      action: 'election.schedule-close',
      target: `elections/${electionId}`,
      electionId,
      details: { closeAt: closeAt ? closeAt.toDate().toISOString() : null },
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('setElectionCloseAt unexpected error:', error);
    throw new HttpsError('internal', 'Unable to save the automatic close schedule.');
  }
});

/**
 * Configure which sections may vote (admin). Empty list = all active, eligible
 * roster students. Sections are normalized to the canonical BSCS-<year><letter>
 * format server-side so client normalization can never diverge.
 */
exports.setEligibleSections = onCall({ invoker: 'public' }, async (request) => {
  try {
  const { normalizeSection } = require('./rosterLogic');
  await limiter.enforce(request, 'adminLight');
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
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('setEligibleSections unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for setEligibleSections: ' + msg + '. Run firebase deploy --only firestore.');
    }
    throw new HttpsError('internal', 'setEligibleSections failed: ' + msg);
  }
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
exports.resetAllElectionData = onCall(
  { invoker: 'public', timeoutSeconds: 540, memory: '1GiB' },
  async (request) => {
  try {
  await limiter.enforce(request, 'saHeavy');
  assertSuperAdmin(request.auth);
  const data = request.data || {};
  const electionId = typeof data.electionId === 'string' ? data.electionId : '';
  const confirmation = typeof data.confirmation === 'string' ? data.confirmation : '';
  const requiredConfirmation = 'DELETE ALL STUDENT AND CANDIDATE DATA';

  if (!electionId) throw new HttpsError('invalid-argument', 'Election id is required.');
  if (confirmation !== requiredConfirmation) {
    throw new HttpsError('failed-precondition', `Type exactly: ${requiredConfirmation}`);
  }
  // Hard gate (plan §13): a verified full-coverage backup must exist before
  // this operation may run. It is the only recovery point for the roster,
  // voter profiles, and identity indexes about to be deleted.
  const backupId = typeof data.backupId === 'string' ? data.backupId : '';
  if (!backupId) throw new HttpsError('invalid-argument', 'A full-coverage backup id is required before resetting all data.');

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

  await verifyBackupForReset(backupId, electionId, { requireFull: true });

  console.log(`resetAllElectionData: starting full reset of ${electionId} (status: ${electionStatus}, backup: ${backupId}).`);

  // Read→delete one page at a time so peak memory stays flat even for very
  // large rosters; each commit logs a breadcrumb so a mid-run failure pinpoints
  // exactly which collection and how far it got.
  async function purge(queryFactory, label, collectIds) {
    let total = 0;
    for (;;) {
      const snap = await queryFactory().get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      total += snap.size;
      if (collectIds) snap.docs.forEach((d) => collectIds.push(d.id));
      console.log(`resetAllElectionData: ${label} deleted ${total}...`);
      if (snap.size < RESET_PAGE_SIZE) break;
    }
    return total;
  }

  // Voter uids are captured during the voters pass (ids only — small in memory)
  // because their Auth accounts must be deleted after the Firestore purge.
  const voterUids = [];
  const deleted = {
    candidates: await purge(
      () => db.collection('candidates').where('electionId', '==', electionId).orderBy('__name__').limit(RESET_PAGE_SIZE),
      'candidates',
    ),
    ballots: await purge(
      () => db.collection('ballots').where('electionId', '==', electionId).orderBy('__name__').limit(RESET_PAGE_SIZE),
      'ballots',
    ),
    voters: await purge(() => db.collection('voters').orderBy('__name__').limit(RESET_PAGE_SIZE), 'voters', voterUids),
    students: await purge(() => db.collection('students').orderBy('__name__').limit(RESET_PAGE_SIZE), 'students'),
    studentIndexes: await purge(() => db.collection('studentIndex').orderBy('__name__').limit(RESET_PAGE_SIZE), 'studentIndex'),
    emailIndexes: await purge(() => db.collection('emailIndex').orderBy('__name__').limit(RESET_PAGE_SIZE), 'emailIndex'),
    tallies: 0,
    authUsers: 0,
  };

  // Voter documents are the application-side identity registry. Remove the
  // matching Firebase Auth accounts as well, in chunks supported by Admin SDK.
  for (let i = 0; i < voterUids.length; i += 1000) {
    const result = await getAuth().deleteUsers(voterUids.slice(i, i + 1000));
    deleted.authUsers += result.successCount;
    console.log(`resetAllElectionData: auth users deleted ${deleted.authUsers}/${voterUids.length}...`);
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
    details: { deleted, confirmationRequired: requiredConfirmation, fromStatus: electionStatus, backupId },
  });

  return { ok: true, electionId, deleted, backupId };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('resetAllElectionData unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for resetAllElectionData: ' + msg + '. Run firebase deploy --only firestore.');
    }
    throw new HttpsError('internal', 'resetAllElectionData failed: ' + msg);
  }
});

/** Archive a completed election (superadmin). */
exports.archiveElection = onCall({ invoker: 'public' }, async (request) => {
  try {
  await limiter.enforce(request, 'adminLight');
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
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('archiveElection unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for archiveElection: ' + msg + '. Run firebase deploy --only firestore.');
    }
    throw new HttpsError('internal', 'archiveElection failed: ' + msg);
  }
});

/** Restore an archived election back to draft (superadmin). */
exports.restoreElection = onCall({ invoker: 'public' }, async (request) => {
  try {
  await limiter.enforce(request, 'adminLight');
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
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('restoreElection unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for restoreElection: ' + msg + '. Run firebase deploy --only firestore.');
    }
    throw new HttpsError('internal', 'restoreElection failed: ' + msg);
  }
});

/** Lock an election (superadmin). While locked, ordinary admin edits and voting are refused. */
exports.lockElection = onCall({ invoker: 'public' }, async (request) => {
  try {
  await limiter.enforce(request, 'adminLight');
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
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('lockElection unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for lockElection: ' + msg + '. Run firebase deploy --only firestore.');
    }
    throw new HttpsError('internal', 'lockElection failed: ' + msg);
  }
});

/** Unlock an election (superadmin). Audited. Refused once finalized/archived — those are immutable states. */
exports.unlockElection = onCall({ invoker: 'public' }, async (request) => {
  try {
  await limiter.enforce(request, 'adminLight');
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
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('unlockElection unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for unlockElection: ' + msg + '. Run firebase deploy --only firestore.');
    }
    throw new HttpsError('internal', 'unlockElection failed: ' + msg);
  }
});

/**
 * Affected-record counts for a proposed reset. Ballots are never client-readable,
 * so this must come from the server. All figures come from index-only COUNT
 * aggregations — no document is read regardless of collection size.
 */
exports.estimateReset = onCall({ invoker: 'public' }, async (request) => {
  try {
  await limiter.enforce(request, 'saHeavy');
  assertSuperAdmin(request.auth);
  const electionId = typeof (request.data || {}).electionId === 'string' ? request.data.electionId : DEFAULT_ELECTION_ID;
  const electionSnap = await db.doc(`elections/${electionId}`).get();
  if (!electionSnap.exists) throw new HttpsError('not-found', 'Election was not found.');

  const countOf = (query, fallback = 0) =>
    query.count().get().then((s) => Number(s.data().count || 0)).catch(() => fallback);

  const [candidates, ballots, votersLocked, tallies, positions] = await Promise.all([
    countOf(db.collection('candidates').where('electionId', '==', electionId)),
    countOf(db.collection('ballots').where('electionId', '==', electionId)),
    // Map sub-field equality uses the automatic single-field index.
    countOf(db.collection('voters').where(`hasVoted.${electionId}`, '==', true)),
    countOf(db.collection('tallies').where('electionId', '==', electionId)),
    db.collection('positions').count().get().then((s) => s.data().count).catch(() => 0),
  ]);

  return {
    electionId,
    electionTitle: electionSnap.data().title || '',
    candidates,
    ballots,
    tallies,
    votersLocked,
    positions,
  };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('estimateReset unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for estimateReset: ' + msg + '. Run firebase deploy --only firestore.');
    }
    throw new HttpsError('internal', 'estimateReset failed: ' + msg);
  }
});

// scope -> which data to reset. 'assignments' maps to candidates in this schema.
const SCOPE_PLAN = {
  candidates: { candidates: true, ballots: false, tallies: false, locks: false },
  assignments: { candidates: true, ballots: false, tallies: false, locks: false },
  voters: { candidates: false, ballots: false, tallies: false, locks: true },
  ballots: { candidates: false, ballots: true, tallies: true, locks: true },
  full: { candidates: true, ballots: true, tallies: true, locks: true },
};

async function verifyBackupForReset(backupId, electionId, { requireFull = false } = {}) {
  try {
    const snap = await db.doc(`backups/${backupId}`).get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'A backup must be created before a destructive reset. Create a backup first.');
  const meta = snap.data();
  if (meta.electionId !== electionId) {
    throw new HttpsError('failed-precondition', 'The backup is for a different election. Create a fresh backup for this election.');
  }
  if (requireFull && meta.type !== 'pre-reset-full') {
    throw new HttpsError('failed-precondition', 'This reset deletes the roster and voter accounts — it requires a full-coverage backup (type "pre-reset-full"). Create one first.');
  }
    let exists;
    try {
      [exists] = await getStorage().bucket().file(meta.storagePath).exists();
    } catch (storageError) {
      console.error('verifyBackupForReset storage exists error:', storageError);
      throw new HttpsError('unavailable', 'Unable to verify backup in Storage (' + (storageError.message || 'unknown') + '). Check Storage bucket permissions.');
    }
    if (!exists) throw new HttpsError('failed-precondition', 'The backup payload is missing from storage. Reset aborted.');
    return meta;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('verifyBackupForReset unexpected:', error);
    throw new HttpsError('internal', 'Backup verification failed: ' + (error.message || 'unknown'));
  }
}

/** Delete only an election's ballots and tally so candidates can be edited again. */
exports.deleteBallots = onCall({ invoker: 'public' }, async (request) => {
  try {
  await limiter.enforce(request, 'saHeavy');
  assertSuperAdmin(request.auth);
  const data = request.data || {};
  const electionId = typeof data.electionId === 'string' ? data.electionId : '';
  const backupId = typeof data.backupId === 'string' ? data.backupId : '';

  if (!electionId) throw new HttpsError('invalid-argument', 'Election id is required.');
  if (!backupId) throw new HttpsError('invalid-argument', 'A backup id is required before deleting ballots.');

  const electionSnap = await db.doc(`elections/${electionId}`).get();
  if (!electionSnap.exists) throw new HttpsError('not-found', 'Election was not found.');
  const current = electionSnap.data();
  if (!['draft', 'closed'].includes(current.status)) {
    throw new HttpsError('failed-precondition', `Ballot deletion requires a draft or closed election (current status: ${current.status}).`);
  }
  if (current.locked !== true) {
    throw new HttpsError('failed-precondition', 'Lock the election before deleting ballots.');
  }

  await verifyBackupForReset(backupId, electionId);

  const ballots = await readDocsWhere(db, 'ballots', 'electionId', electionId);
  const deletedBallots = await batchDeleteByIds(db, 'ballots', ballots.map((d) => d.id));
  const tallyRef = db.doc(`tallies/${electionId}`);
  const deletedTallies = (await tallyRef.get()).exists ? 1 : 0;
  if (deletedTallies) await tallyRef.delete();

  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: 'superadmin',
    action: 'election.delete-ballots',
    target: `elections/${electionId}`,
    electionId,
    details: { deletedBallots, deletedTallies, backupId, fromStatus: current.status },
  });

  return { ok: true, deletedBallots, deletedTallies };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('deleteBallots unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for deleteBallots: ' + msg + '. Run firebase deploy --only firestore.');
    }
    throw new HttpsError('internal', 'deleteBallots failed: ' + msg);
  }
});

/** Superadmin emergency action: permit profile-only candidate edits without removing ballots. */
exports.unlockCandidateProfiles = onCall({ invoker: 'public' }, async (request) => {
  try {
    await limiter.enforce(request, 'adminLight');
    assertSuperAdmin(request.auth);
    const electionId = typeof (request.data || {}).electionId === 'string' ? request.data.electionId : '';
    if (!electionId) throw new HttpsError('invalid-argument', 'Election id is required.');
    const ref = db.doc(`elections/${electionId}`);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Election was not found.');
    if (['finalized', 'archived'].includes(snap.data().status)) {
      throw new HttpsError('failed-precondition', 'Finalized or archived elections cannot be changed.');
    }
    await ref.update({ candidateProfileEditingUnlocked: true, updatedAt: FieldValue.serverTimestamp() });
    await writeAudit(db, {
      actorUid: request.auth.uid,
      actorRole: actorRole(request.auth),
      action: 'candidate.profile-editing.unlock',
      target: ref.path,
      electionId,
      details: { preservesBallots: true, profileOnly: true },
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('unlockCandidateProfiles unexpected error:', error);
    throw new HttpsError('internal', 'unlockCandidateProfiles failed.');
  }
});

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

/** Close due elections independently of the admin browser. */
exports.autoCloseElections = onSchedule({ schedule: 'every 1 minutes', timeZone: 'Asia/Manila' }, async () => {
  const now = Timestamp.now();
  const snap = await db.collection('elections').where('status', '==', 'open').get();
  let closed = 0;
  for (const election of snap.docs) {
    const closeAt = election.data().closeAt;
    if (!closeAt || typeof closeAt.toMillis !== 'function' || closeAt.toMillis() > now.toMillis()) continue;
    const didClose = await db.runTransaction(async (tx) => {
      const current = await tx.get(election.ref);
      const data = current.exists ? current.data() : null;
      const currentCloseAt = data && data.closeAt;
      if (!data || data.status !== 'open' || !currentCloseAt || typeof currentCloseAt.toMillis !== 'function' || currentCloseAt.toMillis() > now.toMillis()) return false;
      tx.update(election.ref, { status: 'closed', updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!didClose) continue;
    closed += 1;
    await writeAudit(db, {
      actorUid: 'system:auto-close',
      actorRole: 'system',
      action: 'election.auto-close',
      target: election.ref.path,
      electionId: election.id,
      details: { closeAt: closeAt.toDate().toISOString() },
    });
  }
  console.log(`autoCloseElections closed ${closed} election(s).`);
});

/**
 * Election-scoped destructive reset (superadmin only). Requires a fresh backup
 * for the election; refuses otherwise. The election must be locked AND in a
 * quiescent state (draft/closed) so a live vote can never interleave with the
 * deletion batches (which would open a double-vote window). Batches writes;
 * never touches persistent data (roster, positions, voter accounts, admin
 * registry, config, audit, or any other election).
 */
exports.resetElectionData = onCall({ invoker: 'public' }, async (request) => {
  try {
  await limiter.enforce(request, 'saHeavy');
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
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('resetElectionData unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for resetElectionData: ' + msg + '. Run firebase deploy --only firestore.');
    }
    throw new HttpsError('internal', 'resetElectionData failed: ' + msg);
  }
});
