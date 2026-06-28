import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { ELECTION_ID, positions } from "../seed-data.js";
import {
  aggregateVotes,
  buildTallies,
  votesToCsv
} from "../../web/src/admin/adminCore.js";

const projectId = "css-department-voting-system";
const adminUid = "phase4-admin";
const studentUid = "phase4-student";

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: {
    rules: readFileSync("../firestore.rules", "utf8"),
    host: "127.0.0.1",
    port: 8081
  },
  storage: {
    rules: readFileSync("../storage.rules", "utf8"),
    host: "127.0.0.1",
    port: 9199
  }
});

function dbFor(uid, token = {}) {
  return testEnv.authenticatedContext(uid, token).firestore();
}

function storageFor(uid, token = {}) {
  return testEnv.authenticatedContext(uid, token).storage("css-department-voting-system.firebasestorage.app");
}

async function readCollection(path) {
  let records = [];
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDocs(collection(context.firestore(), path));
    records = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));
  });
  return records;
}

async function seedPhase4Data(status = "open") {
  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    for (const position of positions) {
      const { id, ...data } = position;
      await setDoc(doc(db, "positions", id), data);
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

    const candidates = [
      ["cand_president_a", "president", "President Candidate A", 1],
      ["cand_president_b", "president", "President Candidate B", 2],
      ["cand_year2_a", "year_rep_2", "Year 2 Candidate A", 1]
    ];

    for (const [id, positionId, name, order] of candidates) {
      await setDoc(doc(db, "candidates", id), {
        electionId: ELECTION_ID,
        positionId,
        name,
        section: "BSCS 2-A",
        yearLevel: 2,
        platform: `${name} platform`,
        party: null,
        photoURL: "",
        photoPath: "",
        order,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    const voters = [
      ["voter-a", "Ana Reyes", "1112223", 2, true],
      ["voter-b", "Ben Santos", "2223334", 2, true],
      ["voter-c", "Cara Cruz", "3334445", 3, false]
    ];

    for (const [uid, fullName, studentNo, yearLevel, eligible] of voters) {
      await setDoc(doc(db, "voters", uid), {
        studentNo,
        fullName,
        email: `${fullName.toLowerCase().replace(" ", ".")}.scc@gmail.com`,
        yearLevel,
        section: `BSCS ${yearLevel}-A`,
        eligible,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    const votes = [
      ["voter-a", "president", "cand_president_a", 2],
      ["voter-b", "president", "cand_president_b", 2],
      ["voter-a", "year_rep_2", "cand_year2_a", 2],
      ["voter-b", "year_rep_2", "cand_year2_a", 2]
    ];

    for (const [uid, positionId, candidateId, yearLevel] of votes) {
      await setDoc(doc(db, "votes", `${ELECTION_ID}__${uid}__${positionId}`), {
        electionId: ELECTION_ID,
        uid,
        positionId,
        candidateId,
        yearLevel,
        createdAt: serverTimestamp()
      });
    }
  });
}

async function testDashboardAggregation() {
  await seedPhase4Data("open");
  const [candidates, voters, votes] = await Promise.all([
    readCollection("candidates"),
    readCollection("voters"),
    readCollection("votes")
  ]);

  const aggregate = aggregateVotes({ votes, candidates, positions, voters });
  assert.equal(aggregate.perCandidate.cand_year2_a, 2);
  assert.equal(aggregate.perPosition.president, 2);
  assert.equal(aggregate.turnout.total, 2);
  assert.equal(aggregate.turnout.byYear["2"], 2);
  assert.equal(aggregate.eligible.total, 2);

  const tallies = buildTallies(ELECTION_ID, votes);
  assert.equal(tallies.perCandidate.cand_president_a, 1);
  assert.equal(tallies.perPosition.year_rep_2, 2);
  assert.equal(tallies.turnout.total, 2);

  const csv = votesToCsv({ votes, candidates, positions });
  assert.equal(csv.includes("uid"), false);
  assert.equal(csv.includes(`${ELECTION_ID}__voter-a__president`), false);
}

async function testCandidateCrudRules() {
  await seedPhase4Data("open");
  const adminDb = dbFor(adminUid, { admin: true });
  const studentDb = dbFor(studentUid);
  const payload = {
    electionId: ELECTION_ID,
    positionId: "president",
    name: "New Admin Candidate",
    section: "BSCS 4-A",
    yearLevel: 4,
    platform: "Admin-created platform",
    party: null,
    photoURL: "",
    photoPath: "",
    order: 3,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await assertFails(setDoc(doc(studentDb, "candidates", "student-forged-candidate"), payload));
  await assertSucceeds(setDoc(doc(adminDb, "candidates", "admin-created-candidate"), payload));
  await assertSucceeds(updateDoc(doc(adminDb, "candidates", "admin-created-candidate"), {
    active: false,
    updatedAt: serverTimestamp()
  }));
}

async function testVoterElectionTallyAuditRules() {
  await seedPhase4Data("closed");
  const adminDb = dbFor(adminUid, { admin: true });
  const studentDb = dbFor("voter-a");
  const votes = await readCollection("votes");
  const tallies = buildTallies(ELECTION_ID, votes);

  await assertFails(updateDoc(doc(studentDb, "voters", "voter-a"), {
    eligible: false,
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(doc(adminDb, "voters", "voter-a"), {
    eligible: false,
    updatedAt: serverTimestamp()
  }));

  await assertFails(updateDoc(doc(studentDb, "elections", ELECTION_ID), {
    status: "open",
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(doc(adminDb, "elections", ELECTION_ID), {
    status: "open",
    updatedAt: serverTimestamp()
  }));

  await assertFails(getDoc(doc(studentDb, "tallies", ELECTION_ID)));
  await assertSucceeds(setDoc(doc(adminDb, "tallies", ELECTION_ID), {
    ...tallies,
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(doc(adminDb, "elections", ELECTION_ID), {
    status: "published",
    updatedAt: serverTimestamp()
  }));
  await assertSucceeds(getDoc(doc(studentDb, "tallies", ELECTION_ID)));

  await assertSucceeds(setDoc(doc(adminDb, "audit", "phase4-admin-action"), {
    ts: serverTimestamp(),
    actorUid: adminUid,
    actorRole: "admin",
    action: "phase4.test",
    target: `elections/${ELECTION_ID}`,
    details: { ok: true }
  }));
}

async function testVotesReadAndStorageRules() {
  await seedPhase4Data("open");
  const adminDb = dbFor(adminUid, { admin: true });
  const studentDb = dbFor(studentUid);

  await assertFails(getDocs(collection(studentDb, "votes")));
  await assertSucceeds(getDocs(collection(adminDb, "votes")));

  await assertFails(
    uploadBytes(
      ref(storageFor(studentUid), "candidates/student-upload.jpg"),
      new Blob(["fake image bytes"], { type: "image/jpeg" })
    )
  );
  await assertFails(
    uploadBytes(
      ref(storageFor(adminUid, { admin: true }), "candidates/not-image.txt"),
      new Blob(["plain text"], { type: "text/plain" })
    )
  );
  await assertSucceeds(
    uploadBytes(
      ref(storageFor(adminUid, { admin: true }), "candidates/admin-upload.jpg"),
      new Blob(["fake image bytes"], { type: "image/jpeg" })
    )
  );
}

try {
  await testDashboardAggregation();
  await testCandidateCrudRules();
  await testVoterElectionTallyAuditRules();
  await testVotesReadAndStorageRules();
  console.log("Phase 4 admin dashboard tests passed.");
} finally {
  await testEnv.cleanup();
}
