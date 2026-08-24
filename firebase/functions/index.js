'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { validateBallot } = require('./ballotLogic');
const {
  processRosterImport,
  validateRosterEligibility,
  resolveNameRosterMatch,
  identityKey,
  normalizeSection,
} = require('./rosterLogic');
const { assertAdmin, assertSuperAdmin, actorRole } = require('./authGuards');
const { writeAudit } = require('./audit');
const {
  DEFAULT_ELECTION_ID,
  STUDENT_EMAIL_PATTERN,
  STUDENT_NO_PATTERN,
  ADMIN_EMAIL_PATTERN,
  ADMIN_PASSWORD_MIN_LENGTH,
  MAX_ROSTER_ROWS,
  ROSTER_BATCH_SIZE,
} = require('./constants');
const { readAllDocs } = require('./dbHelpers');

initializeApp();
const db = getFirestore();
function toHttpsError(error, fallbackCode, fallbackMessage) {
  if (error instanceof HttpsError) throw error;
  if (error && error.code && ['unauthenticated','permission-denied','invalid-argument','not-found','failed-precondition','already-exists','data-loss','aborted','out-of-range','unimplemented','internal','unavailable'].includes(error.code)) throw error;
  console.error(`[${fallbackCode}] ${fallbackMessage}:`, error);
  throw new HttpsError(fallbackCode, fallbackMessage);
}


function validateVoterProfile(voter, uid, electionId) {
  if (!voter) {
    throw new HttpsError('permission-denied', 'No voter profile found for this account.');
  }
  if (voter.eligible !== true) {
    throw new HttpsError('permission-denied', 'This account is not eligible to vote.');
  }
  if (voter.hasVoted && voter.hasVoted[electionId] === true) {
    throw new HttpsError('already-exists', 'You have already voted in this election.');
  }
  if (typeof voter.fullName !== 'string' || voter.fullName.trim().length < 2) {
    throw new HttpsError('failed-precondition', 'Invalid voter profile.');
  }
  if (typeof voter.email !== 'string' || !STUDENT_EMAIL_PATTERN.test(voter.email)) {
    throw new HttpsError('failed-precondition', 'Invalid voter email.');
  }
  if (typeof voter.studentNo !== 'string' || !STUDENT_NO_PATTERN.test(voter.studentNo)) {
    throw new HttpsError('failed-precondition', 'Invalid student ID.');
  }
  const yearLevel = Number(voter.yearLevel);
  if (![1, 2, 3, 4].includes(yearLevel)) {
    throw new HttpsError('failed-precondition', 'Invalid year level.');
  }
  if (typeof voter.section !== 'string' || voter.section.trim().length < 2) {
    throw new HttpsError('failed-precondition', 'Invalid section.');
  }
  return { ...voter, uid, yearLevel };
}

function normalizeAdminAccountInput(data) {
  const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
  const password = typeof data?.password === 'string' ? data.password : '';
  if (!ADMIN_EMAIL_PATTERN.test(email)) {
    throw new HttpsError('invalid-argument', 'Enter a valid admin email address.');
  }
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    throw new HttpsError('invalid-argument', `Admin passwords must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`);
  }
  return { email, password };
}

function electionWindowMillis(value) {
  if (value == null) return null;
  if (typeof value.toMillis === 'function') {
    try { return value.toMillis(); } catch { return null; }
  }
  if (typeof value._seconds === 'number') return value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6);
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function loadPositionsAndCandidates(electionId) {
  const [positionsSnap, candidatesSnap] = await Promise.all([
    db.collection('positions').orderBy('order', 'asc').get(),
    db.collection('candidates').where('electionId', '==', electionId).get(),
  ]);
  const positions = positionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const candidatesById = {};
  candidatesSnap.docs.forEach((d) => {
    candidatesById[d.id] = { id: d.id, ...d.data() };
  });
  return { positions, candidatesById };
}

/**
 * Cast a ballot, including an intentionally empty ballot. The only path that writes votes. Ballots are stored
 * anonymously (random ids, no uid, no timestamp); the voter's participation lock
 * is set in the same transaction. No document ever links a person to a choice.
 *
 * The vote path deliberately never touches tallies/{electionId}: a single tally
 * document sustains only ~1 write/sec, so incrementing it per vote would
 * serialize every ballot under load. Counts are derived from immutable ballots
 * on demand (getResults); publishTally writes the official tally at close.
 */
exports.submitBallot = onCall(
  {
    // Rejects requests without a valid App Check token once enforcement is
    // enabled in the Firebase console (see docs/RATE_LIMIT_HARDENING.md).
    enforceAppCheck: true,
    // Keeps a warm instance so a simultaneous voting burst isn't absorbed by cold starts.
    minInstances: 1,
  },
  async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in to vote.');
  const uid = auth.uid;
  const electionId = (request.data && request.data.electionId) || DEFAULT_ELECTION_ID;
  const selections = (request.data && request.data.selections) || {};
  if (selections && typeof selections === 'object' && Object.keys(selections).length > 30) {
    throw new HttpsError('invalid-argument', 'Too many selections.');
  }

  const { positions, candidatesById } = await loadPositionsAndCandidates(electionId);

  const voterRef = db.doc(`voters/${uid}`);
  const electionRef = db.doc(`elections/${electionId}`);

  await db.runTransaction(async (tx) => {
    const [voterSnap, electionSnap] = await Promise.all([tx.get(voterRef), tx.get(electionRef)]);
    if (!electionSnap.exists || electionSnap.data().status !== 'open') {
      throw new HttpsError('failed-precondition', 'Voting is not open for this election.');
    }
    if (electionSnap.data().locked === true) {
      throw new HttpsError('failed-precondition', 'Voting is locked for this election.');
    }
    const electionData = electionSnap.data();
    const nowMs = Date.now();
    const openAtMs = electionWindowMillis(electionData.openAt);
    const closeAtMs = electionWindowMillis(electionData.closeAt);
    if (openAtMs != null && nowMs < openAtMs) {
      throw new HttpsError('failed-precondition', 'Voting has not started yet.');
    }
    if (closeAtMs != null && nowMs > closeAtMs) {
      throw new HttpsError('failed-precondition', 'Voting has ended.');
    }
    const voter = validateVoterProfile(voterSnap.exists ? voterSnap.data() : null, uid, electionId);

    // The official roster, not the self-asserted voter profile, is the
    // authoritative eligibility source. The voter's locked studentNo is the
    // primary identity link: if a students/{studentNo} record exists it must be
    // active, eligible, and match the account's year/section/name/email. When
    // no student-number record exists (roster imported from a masterlist
    // without an ID column), the registered name + section + year must match
    // EXACTLY ONE active, eligible roster entry.
    const rosterResult = await resolveRosterRecord((ref) => tx.get(ref), voter);
    if (!rosterResult.ok) {
      throw new HttpsError(rosterResult.code, rosterResult.message);
    }
    const rosterEligibility = validateRosterEligibility({
      voter,
      roster: rosterResult.record,
      election: electionSnap.exists ? electionSnap.data() : null,
    });
    if (!rosterEligibility.ok) {
      throw new HttpsError(rosterEligibility.code, rosterEligibility.message);
    }

    const result = validateBallot({
      positions,
      yearLevel: voter.yearLevel,
      selections,
      candidatesById,
      electionId,
    });
    if (!result.ok) throw new HttpsError(result.code, result.message);

    // Anonymous ballots: random ids, no uid, no timestamp — unlinkable and unorderable.
    for (const ballot of result.ballots) {
      tx.set(db.collection('ballots').doc(), ballot);
    }

    // Participation lock: proves the voter voted, carries no ballot content.
    tx.set(
      voterRef,
      {
        hasVoted: { [electionId]: true },
        votedAt: { [electionId]: FieldValue.serverTimestamp() },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  return { ok: true };
});

/**
 * Bind an authenticated voter to their official roster record. Reads through a
 * caller-provided `get` (a Firestore transaction inside submitBallot, a plain
 * document reference outside) so the same resolution is atomic with the vote.
 *
 * 1. students/{voter.studentNo} exists → the ID-keyed record wins (strongest).
 * 2. Otherwise the roster entry is matched by name + section + year (masterlist
 *    imports without student numbers) — exactly one active, eligible entry.
 */
async function resolveRosterRecord(get, voter) {
  const idSnap = await get(db.doc(`students/${voter.studentNo}`));
  if (idSnap.exists && idSnap.data().studentNo) {
    return { ok: true, record: idSnap.data() };
  }
  const sectionSnap = await get(db.collection('students').where('section', '==', normalizeSection(voter.section)));
  const result = resolveNameRosterMatch(sectionSnap.docs.map((d) => d.data()), voter);
  if (!result.ok) {
    const ambiguous = result.reason === 'mismatch';
    return {
      ok: false,
      code: 'permission-denied',
      message: ambiguous
        ? 'Your registration does not match the official roster. Contact the election committee.'
        : "You are not on the official roster for this election. If you're a current CSS student, contact the election committee.",
    };
  }
  return { ok: true, record: result.record };
}

/**
 * Pre-ballot authorization used by the checkMyRosterStatus callable: profile,
 * participation lock, and roster eligibility. Mirrors submitBallot's checks so
 * the ballot page's early denial and the server's enforcement agree.
 */
async function checkVoterEligibility(get, uid, electionId) {
  const [voterSnap, electionSnap] = await Promise.all([
    get(db.doc(`voters/${uid}`)),
    get(db.doc(`elections/${electionId}`)),
  ]);
  let voter;
  try {
    voter = validateVoterProfile(voterSnap.exists ? voterSnap.data() : null, uid, electionId);
  } catch (error) {
    return {
      ok: false,
      reason: error.code === 'already-exists' ? 'already-voted' : 'no-profile',
      message: error.message,
    };
  }
  const rosterResult = await resolveRosterRecord(get, voter);
  if (!rosterResult.ok) {
    return { ok: false, reason: 'not-on-roster', message: rosterResult.message };
  }
  const eligibility = validateRosterEligibility({
    voter,
    roster: rosterResult.record,
    election: electionSnap.exists ? electionSnap.data() : null,
  });
  if (!eligibility.ok) {
    return { ok: false, reason: eligibility.reason, message: eligibility.message };
  }
  return { ok: true };
}

/**
 * Early read-only roster status for the current voter (used by the ballot
 * page before the ballot opens). Returns only the voter's own result — never
 * other students' data. The submitBallot function re-verifies everything
 * inside its write transaction, so this is UX, not security.
 */
exports.checkMyRosterStatus = onCall(
  { enforceAppCheck: true },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to vote.');
  const electionId = (request.data && request.data.electionId) || DEFAULT_ELECTION_ID;
  return checkVoterEligibility((ref) => ref.get(), request.auth.uid, electionId);
  },
);

/**
 * Registration-time roster verification for new sign-ups. Verifies the
 * self-reported registration values against the official Firestore roster —
 * the same records submitBallot enforces against. Returns only a verdict for
 * the calling student; never other students' data.
 *
 * Intentionally callable before sign-in: it runs during registration, before
 * the Auth account exists. App Check enforcement is the abuse control here
 * (scripts/bots cannot mint reCAPTCHA tokens), not an auth requirement.
 */
exports.verifyStudentAgainstRoster = onCall(
  { enforceAppCheck: true },
  async (request) => {
  const data = request.data || {};
  const electionId = data.electionId || DEFAULT_ELECTION_ID;
  const voter = {
    studentNo: String(data.studentId || '').trim(),
    fullName: String(data.fullName || '').trim(),
    email: String(data.email || '').trim().toLowerCase(),
    yearLevel: Number(data.yearLevel),
    section: String(data.section || '').trim(),
  };
  if (voter.fullName.length > 120 || voter.email.length > 120 || voter.section.length > 32 || voter.studentNo.length > 20) {
    return { ok: false, state: 'not-on-roster', message: 'Input exceeds allowed length.' };
  }
  if (!voter.studentNo) {
    return { ok: false, state: 'not-on-roster', message: 'Student ID is required for verification.' };
  }
  try {
    const rosterResult = await resolveRosterRecord((ref) => ref.get(), voter);
    if (!rosterResult.ok) {
      return { ok: false, state: 'not-on-roster', message: rosterResult.message };
    }
    const electionSnap = await db.doc(`elections/${electionId}`).get();
    const eligibility = validateRosterEligibility({
      voter,
      roster: rosterResult.record,
      election: electionSnap.exists ? electionSnap.data() : null,
    });
    if (!eligibility.ok) {
      const stateByReason = {
        'not-on-roster': 'not-on-roster',
        inactive: 'ineligible',
        'not-eligible': 'ineligible',
        mismatch: 'mismatch',
        'email-mismatch': 'email-mismatch',
        'section-not-eligible': 'ineligible',
      };
      return {
        ok: false,
        state: stateByReason[eligibility.reason] || 'ineligible',
        message: eligibility.message,
      };
    }
    return { ok: true, state: 'verified', message: 'Student verified against the official roster.' };
  } catch (error) {
    console.error('Roster verification error:', error);
    return {
      ok: false,
      state: 'verification_unavailable',
      message: 'Roster verification failed due to a technical error. Please try again.',
    };
  }
});

/**
 * Remove roster entries. Admin-only. Accepts explicit document ids, or
 * `all: true` to remove every roster entry. Deleting an entry is permanent —
 * the student can no longer vote (participation locks already recorded are
 * preserved).
 */
exports.deleteRosterEntries = onCall(async (request) => {
  try {
  await assertAdmin(db, request.auth);
  const data = request.data || {};
  let ids = [];
  if (data.all === true) {
    const docs = await readAllRosterDocs();
    ids = docs.map((d) => d.id);
  } else if (Array.isArray(data.ids)) {
    ids = data.ids.map(String).filter((id) => id && id.length > 0 && id.length <= 64);
  }
  if (ids.length === 0) {
    throw new HttpsError('invalid-argument', 'No roster entries selected to remove.');
  }
  if (ids.length > MAX_ROSTER_ROWS) {
    throw new HttpsError('invalid-argument', `Roster removals are limited to ${MAX_ROSTER_ROWS} entries.`);
  }

  const now = FieldValue.serverTimestamp();
  let deleted = 0;
  for (let i = 0; i < ids.length; i += ROSTER_BATCH_SIZE) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + ROSTER_BATCH_SIZE)) {
      batch.delete(db.doc(`students/${id}`));
    }
    await batch.commit();
    deleted += Math.min(ROSTER_BATCH_SIZE, ids.length - i);
  }

  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'roster.remove',
    target: 'students',
    details: {
      count: deleted,
      all: data.all === true,
      ...(data.all === true ? {} : { ids: ids.slice(0, 100) }),
    },
  });

  return { ok: true, deleted };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('deleteRosterEntries unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for deleteRosterEntries: ' + msg + '. Run firebase deploy --only firestore.');
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      throw new HttpsError('permission-denied', msg);
    }
    throw new HttpsError('internal', 'deleteRosterEntries failed: ' + msg);
  }
});

/** Read every roster document id + status (paginated so large rosters are complete). */
async function readAllRosterDocs() {
  return readAllDocs(db, 'students');
}

/**
 * Import the official student roster. Admin-only. The client parses the Excel
 * file and sends normalized rows; this function re-validates every row
 * authoritatively, rejects invalid/duplicate records, and upserts the valid
 * ones into `students/{studentNo}`. Roster documents are written nowhere else.
 *
 * `replace: true` additionally soft-deactivates roster students absent from
 * the file (records and participation are preserved; status flips to inactive).
 */
exports.importRoster = onCall(async (request) => {
  try {
  await assertAdmin(db, request.auth);
  const data = request.data || {};
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const replace = data.replace === true;

  if (rows.length === 0) {
    throw new HttpsError('invalid-argument', 'The roster file contains no rows to import.');
  }
  if (rows.length > MAX_ROSTER_ROWS) {
    throw new HttpsError('invalid-argument', `Roster files are limited to ${MAX_ROSTER_ROWS} rows.`);
  }

  const { summary, records } = processRosterImport(rows);
  if (records.length === 0) {
    throw new HttpsError('invalid-argument', 'No valid student records were found in the file. Nothing was imported.');
  }

  const now = FieldValue.serverTimestamp();
  const existingDocs = await readAllRosterDocs();
  const existingById = new Map(existingDocs.map((d) => [d.id, d.data()]));
  // Masterlist rows (no student number) are upserted by section + normalized
  // name, so re-importing the same file never creates duplicate entries.
  const existingByName = new Map();
  existingDocs.forEach((d) => {
    const data = d.data();
    if (!data.studentNo && data.section && data.fullName) {
      const key = identityKey(data);
      if (!existingByName.has(key)) existingByName.set(key, d.id);
    }
  });

  records.forEach((record) => {
    if (record.studentNo) {
      if (existingById.has(record.studentNo)) summary.updated += 1;
      else summary.inserted += 1;
    } else {
      if (existingByName.has(identityKey(record))) summary.updated += 1;
      else summary.inserted += 1;
    }
  });

  for (let i = 0; i < records.length; i += ROSTER_BATCH_SIZE) {
    const batch = db.batch();
    for (const record of records.slice(i, i + ROSTER_BATCH_SIZE)) {
      const payload = {
        // Only carry a student number forward when the file actually provided
        // one; masterlist rows keep no studentNo field at all.
        ...(record.studentNo ? { studentNo: record.studentNo } : {}),
        fullName: record.fullName,
        section: record.section,
        yearLevel: record.yearLevel,
        // Only carry an email forward when the file actually provided one, so
        // a re-import with an empty email column never wipes known addresses.
        ...(record.email ? { email: record.email } : {}),
        status: record.status,
        eligible: record.eligible,
        importedAt: now,
        updatedAt: now,
      };
      let ref;
      let isNew = false;
      if (record.studentNo) {
        ref = db.doc(`students/${record.studentNo}`);
        isNew = !existingById.has(record.studentNo);
      } else {
        const existingId = existingByName.get(identityKey(record));
        ref = existingId ? db.doc(`students/${existingId}`) : db.collection('students').doc();
        isNew = !existingId;
      }
      if (isNew) payload.createdAt = now;
      batch.set(ref, payload, { merge: true });
    }
    await batch.commit();
  }

  if (replace) {
    const fileKeys = new Set(records.map((record) => identityKey(record)));
    const toDeactivate = existingDocs
      .filter((d) => {
        const data = d.data();
        return data.status === 'active' && !fileKeys.has(identityKey(data));
      })
      .map((d) => d.id);
    summary.deactivated = toDeactivate.length;
    for (let i = 0; i < toDeactivate.length; i += ROSTER_BATCH_SIZE) {
      const batch = db.batch();
      for (const id of toDeactivate.slice(i, i + ROSTER_BATCH_SIZE)) {
        batch.update(db.doc(`students/${id}`), { status: 'inactive', updatedAt: now });
      }
      await batch.commit();
    }
  }

  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'roster.import',
    target: 'students',
    details: {
      total: summary.total,
      inserted: summary.inserted,
      updated: summary.updated,
      duplicates: summary.duplicates,
      invalid: summary.invalid,
      missingRequired: summary.missingRequired,
      rejected: summary.rejected,
      deactivated: summary.deactivated,
      replace,
    },
  });

  return { ok: true, summary };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('importRoster unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for importRoster: ' + msg + '. Run firebase deploy --only firestore.');
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      throw new HttpsError('permission-denied', msg);
    }
    throw new HttpsError('internal', 'importRoster failed: ' + msg);
  }
});

function tallyFromBallots(ballotsSnap) {
  const perCandidate = {};
  const perPosition = {};
  ballotsSnap.docs.forEach((d) => {
    const b = d.data();
    perCandidate[b.candidateId] = (perCandidate[b.candidateId] || 0) + 1;
    perPosition[b.positionId] = (perPosition[b.positionId] || 0) + 1;
  });
  return { perCandidate, perPosition };
}

/**
 * Aggregate results for the admin console. Reads raw ballots server-side and
 * returns only counts — admins never receive individual ballot documents.
 */
exports.getResults = onCall(async (request) => {
  try {
    await assertAdmin(db, request.auth);
    const electionId = (request.data && request.data.electionId) || DEFAULT_ELECTION_ID;
    const ballotsSnap = await db.collection('ballots').where('electionId', '==', electionId).get();
    return { ...tallyFromBallots(ballotsSnap), ballotCount: ballotsSnap.size };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('getResults unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for getResults: ' + msg + '. Run firebase deploy --only firestore.');
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      throw new HttpsError('permission-denied', msg);
    }
    throw new HttpsError('internal', 'getResults failed: ' + msg);
  }
});

/**
 * Create a Firebase Auth account and its runtime admin registry entry. The
 * password is accepted only by this trusted callable and is never persisted.
 */
exports.createAdminAccount = onCall(async (request) => {
  try {
    assertSuperAdmin(request.auth);
    const { email, password } = normalizeAdminAccountInput(request.data);
    const adminRef = db.doc(`admins/${email}`);
    const existingAdmin = await adminRef.get();
    if (existingAdmin.exists) {
      throw new HttpsError('already-exists', 'This email already has admin access.');
    }

    let userRecord;
    try {
      userRecord = await getAuth().createUser({ email, password });
    } catch (error) {
      if (error && error.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'An account already exists for this email.');
      }
      console.error('createAdminAccount createUser error:', error);
      throw new HttpsError('internal', `Unable to create the admin account: ${error.message || error.code || 'unknown error'}. Check Auth configuration and password requirements.`);
    }

    try {
      await adminRef.create({
        email,
        role: 'admin',
        addedBy: request.auth.uid,
        reason: 'Admin account created by superadmin',
        createdAt: FieldValue.serverTimestamp(),
      });
      await db.collection('audit').add({
        ts: FieldValue.serverTimestamp(),
        actorUid: request.auth.uid,
        actorRole: 'superadmin',
        action: 'admin.account.create',
        target: `admins/${email}`,
        details: { email, uid: userRecord.uid },
      });
    } catch (error) {
      await adminRef.delete().catch(() => {});
      await getAuth().deleteUser(userRecord.uid).catch(() => {});
      console.error('createAdminAccount Firestore error:', error);
      throw new HttpsError('internal', `The admin account could not be registered: ${error.message || 'unknown error'}.`);
    }

    return { ok: true, email, uid: userRecord.uid };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('createAdminAccount unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    throw new HttpsError('internal', 'createAdminAccount failed: ' + msg);
  }
});

/**
 * Publish official results. Recomputes the tally from immutable ballots and
 * writes tallies/{electionId}, then flips the election to published.
 */
exports.publishTally = onCall(async (request) => {
  try {
  await assertAdmin(db, request.auth);
  const electionId = (request.data && request.data.electionId) || DEFAULT_ELECTION_ID;

  const electionRef = db.doc(`elections/${electionId}`);
  const electionSnap = await electionRef.get();
  if (!electionSnap.exists || electionSnap.data().status !== 'closed') {
    throw new HttpsError('failed-precondition', 'Close the election before publishing results.');
  }

  const [ballotsSnap, votersSnap] = await Promise.all([
    db.collection('ballots').where('electionId', '==', electionId).get(),
    db.collection('voters').get(),
  ]);

  const { perCandidate, perPosition } = tallyFromBallots(ballotsSnap);

  // Turnout comes from the participation lock, not from ballots.
  const byYear = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let turnoutTotal = 0;
  votersSnap.docs.forEach((d) => {
    const v = d.data();
    if (v.hasVoted && v.hasVoted[electionId] === true) {
      turnoutTotal += 1;
      const yr = Number(v.yearLevel);
      if (yr >= 1 && yr <= 4) byYear[yr] += 1;
    }
  });

  const tally = {
    perCandidate,
    perPosition,
    turnout: { total: turnoutTotal, byYear: { 1: byYear[1], 2: byYear[2], 3: byYear[3], 4: byYear[4] } },
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.runTransaction(async (tx) => {
    const txElectionSnap = await tx.get(electionRef);
    if (!txElectionSnap.exists || txElectionSnap.data().status !== 'closed') {
      throw new HttpsError('failed-precondition', 'Close the election before publishing results.');
    }
    tx.set(db.doc(`tallies/${electionId}`), tally);
    tx.update(electionRef, { status: 'published', updatedAt: FieldValue.serverTimestamp() });
  });

  await writeAudit(db, {
    actorUid: request.auth.uid,
    actorRole: actorRole(request.auth),
    action: 'election.publish',
    target: `elections/${electionId}`,
    electionId,
    details: { turnout: turnoutTotal },
  });

  return { ok: true, turnout: turnoutTotal };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('publishTally unexpected error:', error);
    const msg = error && error.message ? error.message : 'unknown error';
    if (msg.includes('requires an index') || msg.includes('FAILED_PRECONDITION')) {
      throw new HttpsError('failed-precondition', 'Firestore index missing for publishTally: ' + msg + '. Run firebase deploy --only firestore.');
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      throw new HttpsError('permission-denied', msg);
    }
    throw new HttpsError('internal', 'publishTally failed: ' + msg);
  }
});

// Superadmin Tier 1 & Tier 2 callables (registered separately so index.js stays
// readable and each module can be unit-tested in isolation). Helper modules
// (tally.js, resetLogic.js, backupLogic.js, doctorLogic.js, verifyLogic.js,
// candidateImportLogic.js) are not callables and are intentionally not merged.
Object.assign(module.exports,
  require('./electionOps'),
  require('./backupOps'),
  require('./doctorOps'),
  require('./finalizeOps'),
  require('./candidateOps'),
  require('./positionOps'),
  require('./rosterStudentOps'),
);
