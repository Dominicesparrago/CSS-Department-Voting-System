import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch
} from "firebase/firestore";
import { ELECTION_ID, positions } from "../seed-data.js";
import {
  isBallotComplete,
  requiredPositionsForVoter,
  unansweredPositions
} from "../../web/src/student/ballotState.js";

const projectId = "css-department-voting-sy-f46a5";
const uid = "student-year-2";
const voterYearLevel = 2;

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

function testCandidateId(positionId, number = 1) {
  return `test_${positionId}_${number}`;
}

async function seedElection(status = "open") {
  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    for (const position of positions) {
      const { id, ...data } = position;
      await setDoc(doc(db, "positions", id), data);

      for (const number of [1, 2]) {
        const yearLevel = position.scope === "year" ? position.yearLevel : ((position.order + number) % 4) + 1;
        await setDoc(doc(db, "candidates", testCandidateId(id, number)), {
          electionId: ELECTION_ID,
          positionId: id,
          name: `${position.name} Candidate ${number}`,
          section: `BSCS ${yearLevel}-A`,
          yearLevel,
          platform: `Test platform for ${position.name} candidate ${number}.`,
          party: null,
          photoURL: "",
          photoPath: "",
          order: number,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
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
      studentNo: "2223334",
      fullName: "Year Two Student",
      email: "year.two.scc@gmail.com",
      yearLevel: voterYearLevel,
      section: "BSCS 2-A",
      eligible: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, "tallies", ELECTION_ID), {
      perCandidate: {},
      perPosition: {},
      turnout: {
        total: 0,
        byYear: {
          "2": 0
        }
      },
      updatedAt: serverTimestamp()
    });
  });
}

function completeSelections(requiredPositions) {
  return Object.fromEntries(
    requiredPositions.map((position) => [position.id, testCandidateId(position.id)])
  );
}

async function submitBallot(db, requiredPositions, selections, userId = uid, yearLevel = voterYearLevel) {
  const batch = writeBatch(db);

  requiredPositions.forEach((position) => {
    batch.set(doc(db, "votes", `${ELECTION_ID}__${userId}__${position.id}`), {
      electionId: ELECTION_ID,
      uid: userId,
      positionId: position.id,
      candidateId: selections[position.id],
      yearLevel,
      createdAt: serverTimestamp()
    });
  });

  batch.update(doc(db, "voters", userId), {
    [`hasVoted.${ELECTION_ID}`]: true,
    [`votedAt.${ELECTION_ID}`]: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await batch.commit();
}

async function readWithRulesDisabled(path) {
  let data = null;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDoc(doc(context.firestore(), path));
    data = snapshot.exists() ? snapshot.data() : null;
  });
  return data;
}

async function testCompleteBallotSubmit() {
  await seedElection("open");
  const required = requiredPositionsForVoter(positions, voterYearLevel);
  const selections = completeSelections(required);

  assert.equal(required.length, 17);
  assert.equal(required.filter((position) => position.scope === "department").length, 16);
  assert.deepEqual(
    required.filter((position) => position.scope === "year").map((position) => position.id),
    ["year_rep_2"]
  );
  assert.equal(isBallotComplete(required, selections), true);

  await assertSucceeds(submitBallot(authedDb(uid), required, selections));

  for (const position of required) {
    const vote = await readWithRulesDisabled(`votes/${ELECTION_ID}__${uid}__${position.id}`);
    assert.equal(vote.electionId, ELECTION_ID);
    assert.equal(vote.uid, uid);
    assert.equal(vote.positionId, position.id);
    assert.equal(vote.candidateId, selections[position.id]);
    assert.equal(vote.yearLevel, voterYearLevel);
    assert.deepEqual(Object.keys(vote).sort(), [
      "candidateId",
      "createdAt",
      "electionId",
      "positionId",
      "uid",
      "yearLevel"
    ]);
  }

  const voter = await readWithRulesDisabled(`voters/${uid}`);
  assert.equal(voter.hasVoted[ELECTION_ID], true);

  const tally = await readWithRulesDisabled(`tallies/${ELECTION_ID}`);
  assert.equal(tally.turnout.total, 0);
  assert.deepEqual(tally.perCandidate, {});
  assert.deepEqual(tally.perPosition, {});
}

async function testIncompleteClientBlocked() {
  await seedElection("open");
  const required = requiredPositionsForVoter(positions, voterYearLevel);
  const selections = completeSelections(required);
  delete selections.president;

  assert.equal(isBallotComplete(required, selections), false);
  assert.deepEqual(unansweredPositions(required, selections).map((position) => position.id), ["president"]);
}

async function testSecondSubmitRejected() {
  await seedElection("open");
  const required = requiredPositionsForVoter(positions, voterYearLevel);
  const selections = completeSelections(required);

  await assertSucceeds(submitBallot(authedDb(uid), required, selections));
  await assertFails(submitBallot(authedDb(uid), required, selections));
}

async function testWrongYearRepRejected() {
  await seedElection("open");
  const wrongYearPosition = positions.find((position) => position.id === "year_rep_3");
  await assertFails(
    submitBallot(
      authedDb(uid),
      [wrongYearPosition],
      { year_rep_3: testCandidateId("year_rep_3") }
    )
  );
}

async function testClosedElectionRejected() {
  await seedElection("draft");
  const required = requiredPositionsForVoter(positions, voterYearLevel);
  const selections = completeSelections(required);

  await assertFails(submitBallot(authedDb(uid), required, selections));
}

try {
  await testCompleteBallotSubmit();
  await testIncompleteClientBlocked();
  await testSecondSubmitRejected();
  await testWrongYearRepRejected();
  await testClosedElectionRejected();
  console.log("Phase 3 vote flow tests passed.");
} finally {
  await testEnv.cleanup();
}
