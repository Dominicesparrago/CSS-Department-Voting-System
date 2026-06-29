import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  collection
} from "firebase/firestore";
import { ELECTION_ID, positions } from "../seed-data.js";
import { requiredPositionsForVoter } from "../../web/src/student/ballotState.js";

const projectId = "css-department-voting-sy-f46a5";
const uid = "phase6-voter";
const duplicateUid = "phase6-duplicate";
const adminUid = "phase6-admin";
const studentNo = "6060001";
const yearLevel = 2;

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: {
    rules: readFileSync("../firestore.rules", "utf8"),
    host: "127.0.0.1",
    port: 8081
  }
});

function authedDb(userId, token = {}) {
  return testEnv.authenticatedContext(userId, token).firestore();
}

function candidateId(positionId, number = 1) {
  return `phase6_${positionId}_${number}`;
}

async function seedBase({ status = "open", eligible = true } = {}) {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    for (const position of positions) {
      const { id, ...data } = position;
      await setDoc(doc(db, "positions", id), data);
      await setDoc(doc(db, "candidates", candidateId(id)), {
        electionId: ELECTION_ID,
        positionId: id,
        name: `${position.name} Candidate`,
        section: "BSCS 2-A",
        yearLevel: position.scope === "year" ? position.yearLevel : 2,
        platform: "Phase 6 anti-cheating sweep candidate.",
        party: null,
        photoURL: "",
        photoPath: "",
        order: 1,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    await setDoc(doc(db, "elections", ELECTION_ID), {
      title: "CSS Department Election 2026",
      status,
      positions: positions.map((position) => position.id),
      openAt: null,
      closeAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, "voters", uid), {
      studentNo,
      fullName: "Phase Six Voter",
      email: "phase.six.scc@gmail.com",
      yearLevel,
      section: "BSCS 2-A",
      eligible,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}

function completeSelections(required) {
  return Object.fromEntries(required.map((position) => [position.id, candidateId(position.id)]));
}

async function submitBallot(db, userId = uid, voterYear = yearLevel, required = requiredPositionsForVoter(positions, yearLevel)) {
  const batch = writeBatch(db);
  const selections = completeSelections(required);
  for (const position of required) {
    batch.set(doc(db, "votes", `${ELECTION_ID}__${userId}__${position.id}`), {
      electionId: ELECTION_ID,
      uid: userId,
      positionId: position.id,
      candidateId: selections[position.id],
      yearLevel: voterYear,
      createdAt: serverTimestamp()
    });
  }
  batch.update(doc(db, "voters", userId), {
    [`hasVoted.${ELECTION_ID}`]: true,
    [`votedAt.${ELECTION_ID}`]: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return batch.commit();
}

async function testDuplicateStudentNoRejected() {
  await testEnv.clearFirestore();
  const db = authedDb(uid);
  const batch = writeBatch(db);
  batch.set(doc(db, "voters", uid), {
    studentNo,
    fullName: "Phase Six Voter",
    email: "phase.six.scc@gmail.com",
    yearLevel,
    section: "BSCS 2-A",
    eligible: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.set(doc(db, "studentIndex", studentNo), {
    uid,
    createdAt: serverTimestamp()
  });
  await assertSucceeds(batch.commit());

  const duplicateDb = authedDb(duplicateUid);
  const duplicateBatch = writeBatch(duplicateDb);
  duplicateBatch.set(doc(duplicateDb, "voters", duplicateUid), {
    studentNo,
    fullName: "Duplicate Voter",
    email: "duplicate.voter.scc@gmail.com",
    yearLevel,
    section: "BSCS 2-B",
    eligible: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  duplicateBatch.set(doc(duplicateDb, "studentIndex", studentNo), {
    uid: duplicateUid,
    createdAt: serverTimestamp()
  });
  await assertFails(duplicateBatch.commit());
}

async function testVoteIntegrityGuards() {
  await seedBase({ status: "open", eligible: true });
  const voterDb = authedDb(uid);
  const required = requiredPositionsForVoter(positions, yearLevel);

  assert.equal(required.length, 17);
  await assertSucceeds(submitBallot(voterDb, uid, yearLevel, required));
  await assertFails(submitBallot(voterDb, uid, yearLevel, required));

  const voteRef = doc(voterDb, "votes", `${ELECTION_ID}__${uid}__president`);
  await assertFails(updateDoc(voteRef, { candidateId: candidateId("secretary") }));
  await assertFails(deleteDoc(voteRef));

  await seedBase({ status: "draft", eligible: true });
  await assertFails(submitBallot(authedDb(uid), uid, yearLevel, required));

  await seedBase({ status: "open", eligible: false });
  await assertFails(submitBallot(authedDb(uid), uid, yearLevel, required));

  await seedBase({ status: "open", eligible: true });
  const wrongYearPosition = positions.find((position) => position.id === "year_rep_3");
  await assertFails(submitBallot(authedDb(uid), uid, yearLevel, [wrongYearPosition]));
}

async function testNonAdminBlocksAndTallies() {
  await seedBase({ status: "open", eligible: true });
  const voterDb = authedDb(uid);
  const adminDb = authedDb(adminUid, { admin: true });

  await assertFails(setDoc(doc(voterDb, "candidates", "phase6_forged"), {
    electionId: ELECTION_ID,
    positionId: "president",
    name: "Forged Candidate",
    section: "BSCS 2-A",
    yearLevel: 2,
    platform: "No.",
    party: null,
    photoURL: "",
    photoPath: "",
    order: 99,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
  await assertFails(getDocs(collection(voterDb, "votes")));
  await assertFails(getDoc(doc(voterDb, "voters", "someone-else")));
  await assertFails(setDoc(doc(voterDb, "tallies", ELECTION_ID), {
    perCandidate: { forged: 100 },
    perPosition: { president: 100 },
    turnout: { total: 100, byYear: { "2": 100 } },
    updatedAt: serverTimestamp()
  }));

  await assertSucceeds(getDocs(collection(adminDb, "votes")));
  await assertSucceeds(setDoc(doc(adminDb, "tallies", ELECTION_ID), {
    perCandidate: {},
    perPosition: {},
    turnout: { total: 0, byYear: { "1": 0, "2": 0, "3": 0, "4": 0 } },
    updatedAt: serverTimestamp()
  }));
}

try {
  await testDuplicateStudentNoRejected();
  await testVoteIntegrityGuards();
  await testNonAdminBlocksAndTallies();
  console.log("Phase 6 anti-cheating sweep passed:");
  console.log("- duplicate studentNo rejected");
  console.log("- one-vote-per-position enforced by deterministic ID and !exists");
  console.log("- vote update/delete rejected");
  console.log("- voting when election is not open rejected");
  console.log("- ineligible voter rejected");
  console.log("- cross-year Year Rep vote rejected");
  console.log("- non-admin candidate/voter/tally/vote access rejected");
  console.log("- client tally writes rejected");
} finally {
  await testEnv.cleanup();
}
