'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { validateBallot } = require('./ballotLogic');

initializeApp();
const db = getFirestore();

const DEFAULT_ELECTION_ID = 'css_department_election_2026';
const STUDENT_EMAIL_PATTERN = /^[a-z0-9._-]+\.scc@gmail\.com$/;
const STUDENT_NO_PATTERN = /^[0-9]{7,9}$/;
const ADMIN_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_PASSWORD_MIN_LENGTH = 8;

function normalizeCountMap(input) {
  return { ...(input || {}) };
}

function incrementCountMap(input, key, delta = 1) {
  const next = normalizeCountMap(input);
  next[key] = (next[key] || 0) + delta;
  return next;
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

/** Admin access: custom claim OR membership in the admins/{email} registry. */
async function assertAdmin(auth) {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const token = auth.token || {};
  if (token.admin === true || token.superadmin === true || token.role === 'admin' || token.role === 'superadmin') {
    return;
  }
  const email = typeof token.email === 'string' ? token.email.toLowerCase() : '';
  if (email) {
    const snap = await db.doc(`admins/${email}`).get();
    if (snap.exists) return;
  }
  throw new HttpsError('permission-denied', 'Admin access required.');
}

function assertSuperAdmin(auth) {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const token = auth.token || {};
  if (token.superadmin === true || token.role === 'superadmin') return;
  throw new HttpsError('permission-denied', 'Super admin access required.');
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
 */
exports.submitBallot = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in to vote.');
  const uid = auth.uid;
  const electionId = (request.data && request.data.electionId) || DEFAULT_ELECTION_ID;
  const selections = (request.data && request.data.selections) || {};

  const { positions, candidatesById } = await loadPositionsAndCandidates(electionId);

  const voterRef = db.doc(`voters/${uid}`);
  const electionRef = db.doc(`elections/${electionId}`);
  const tallyRef = db.doc(`tallies/${electionId}`);

  await db.runTransaction(async (tx) => {
    const [voterSnap, electionSnap, tallySnap] = await Promise.all([tx.get(voterRef), tx.get(electionRef), tx.get(tallyRef)]);
    if (!electionSnap.exists || electionSnap.data().status !== 'open') {
      throw new HttpsError('failed-precondition', 'Voting is not open for this election.');
    }
    const voter = validateVoterProfile(voterSnap.exists ? voterSnap.data() : null, uid, electionId);

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

    const tally = tallySnap.exists ? tallySnap.data() : {};
    const turnoutByYear = { 1: 0, 2: 0, 3: 0, 4: 0, ...((tally.turnout && tally.turnout.byYear) || {}) };
    const nextTally = {
      perCandidate: normalizeCountMap(tally.perCandidate),
      perPosition: normalizeCountMap(tally.perPosition),
      turnout: {
        total: (tally.turnout && tally.turnout.total) || 0,
        byYear: turnoutByYear,
      },
    };

    result.ballots.forEach((ballot) => {
      nextTally.perCandidate = incrementCountMap(nextTally.perCandidate, ballot.candidateId, 1);
      nextTally.perPosition = incrementCountMap(nextTally.perPosition, ballot.positionId, 1);
    });
    nextTally.turnout.total += 1;
    const yearKey = String(voter.yearLevel);
    if (yearKey in nextTally.turnout.byYear) {
      nextTally.turnout.byYear[yearKey] += 1;
    }

    tx.set(tallyRef, {
      ...nextTally,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

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
  await assertAdmin(request.auth);
  const electionId = (request.data && request.data.electionId) || DEFAULT_ELECTION_ID;
  const ballotsSnap = await db.collection('ballots').where('electionId', '==', electionId).get();
  return { ...tallyFromBallots(ballotsSnap), ballotCount: ballotsSnap.size };
}

);

/**
 * Create a Firebase Auth account and its runtime admin registry entry. The
 * password is accepted only by this trusted callable and is never persisted.
 */
exports.createAdminAccount = onCall(async (request) => {
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
    throw new HttpsError('internal', 'Unable to create the admin account.');
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
    throw new HttpsError('internal', 'The admin account could not be registered.');
  }

  return { ok: true, email, uid: userRecord.uid };
});

/**
 * Publish official results. Recomputes the tally from immutable ballots and
 * writes tallies/{electionId}, then flips the election to published.
 */
exports.publishTally = onCall(async (request) => {
  await assertAdmin(request.auth);
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

  await db.doc(`tallies/${electionId}`).set(tally);
  await electionRef.update({ status: 'published', updatedAt: FieldValue.serverTimestamp() });

  return { ok: true, turnout: turnoutTotal };
});
