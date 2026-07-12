import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";

const projectId = "css-department-voting-sy-f46a5";
const electionId = "css_department_election_2026";
const uid = "phase0-voter";
const yearLevel = 2;
const requiredPositionIds = [
  "president",
  "vp_internal",
  "vp_external",
  "secretary",
  "treasurer",
  "auditor",
  "pro",
  "business_manager_committee",
  "academic_committee_chair",
  "research_committee_chair",
  "ict_committee_chair",
  "events_committee_chair",
  "sports_committee_chair",
  "environmental_committee_chair",
  "membership_committee_chair",
  "community_committee_chair",
  "year_rep_2"
];

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: {
    rules: readFileSync("../firestore.rules", "utf8"),
    host: "127.0.0.1",
    port: 8081
  }
});

function authedDb(userId = uid) {
  return testEnv.authenticatedContext(userId).firestore();
}

function voteId(positionId) {
  return `${electionId}__${uid}__${positionId}`;
}

async function seed() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "elections", electionId), {
      title: "Phase 0 election",
      status: "open",
      positions: requiredPositionIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await setDoc(doc(db, "voters", uid), {
      studentNo: "7000001",
      fullName: "Phase Zero Voter",
      email: "phase.zero.scc@gmail.com",
      yearLevel,
      section: "BSCS-2A",
      eligible: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await setDoc(doc(db, "candidates", "phase0-president"), {
      electionId,
      positionId: "president",
      name: "President Candidate",
      active: true
    });
  });
}

function completionUpdate(db) {
  return updateDoc(doc(db, "voters", uid), {
    [`hasVoted.${electionId}`]: true,
    [`votedAt.${electionId}`]: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function presidentVote(db) {
  return setDoc(doc(db, "votes", voteId("president")), {
    electionId,
    uid,
    positionId: "president",
    candidateId: "phase0-president",
    yearLevel,
    createdAt: serverTimestamp()
  });
}

async function testStandaloneWritesAreRejected() {
  await seed();
  const db = authedDb();

  await assertFails(presidentVote(db));
  await assertFails(completionUpdate(db));
}

async function testAtomicLockAndVoteAreAccepted() {
  await seed();
  const db = authedDb();
  const batch = writeBatch(db);
  batch.set(doc(db, "votes", voteId("president")), {
    electionId,
    uid,
    positionId: "president",
    candidateId: "phase0-president",
    yearLevel,
    createdAt: serverTimestamp()
  });
  batch.update(doc(db, "voters", uid), {
    [`hasVoted.${electionId}`]: true,
    [`votedAt.${electionId}`]: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await assertSucceeds(batch.commit());
}

async function testForgedParticipationMapIsRejected() {
  await seed();
  const db = authedDb();
  await assertFails(updateDoc(doc(db, "voters", uid), {
    hasVoted: { [electionId]: true, forgedElection: true },
    votedAt: { [electionId]: serverTimestamp() },
    updatedAt: serverTimestamp()
  }));
}

try {
  await testStandaloneWritesAreRejected();
  await testAtomicLockAndVoteAreAccepted();
  await testForgedParticipationMapIsRejected();
  console.log("Phase 0 integrity rules tests passed.");
} finally {
  await testEnv.cleanup();
}
