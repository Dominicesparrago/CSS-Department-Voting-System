'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { validateBallot } = require('./ballotLogic');

initializeApp();
const db = getFirestore();

const DEFAULT_ELECTION_ID = 'css_department_election_2026';

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
 * Cast a complete ballot. The only path that writes votes. Ballots are stored
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

  await db.runTransaction(async (tx) => {
    const [voterSnap, electionSnap] = await Promise.all([tx.get(voterRef), tx.get(electionRef)]);
    if (!electionSnap.exists || electionSnap.data().status !== 'open') {
      throw new HttpsError('failed-precondition', 'Voting is not open for this election.');
    }
    if (!voterSnap.exists) {
      throw new HttpsError('permission-denied', 'No voter profile found for this account.');
    }
    const voter = voterSnap.data();
    if (voter.eligible !== true) {
      throw new HttpsError('permission-denied', 'This account is not eligible to vote.');
    }
    if (voter.hasVoted && voter.hasVoted[electionId] === true) {
      throw new HttpsError('already-exists', 'You have already voted in this election.');
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
