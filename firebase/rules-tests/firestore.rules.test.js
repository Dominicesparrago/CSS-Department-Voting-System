import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc
} from "firebase/firestore";

const projectId = "css-department-voting-sy-f46a5";
const electionId = "css_department_election_2026";

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: {
    rules: readFileSync("../firestore.rules", "utf8"),
    host: "127.0.0.1",
    port: 8081
  }
});

async function seedBaseData(status = "open") {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "positions/president"), {
      name: "President",
      order: 1,
      scope: "department",
      yearLevel: null,
      maxSelections: 1
    });
    await setDoc(doc(db, "positions/year_rep_3"), {
      name: "3rd Year Representative",
      order: 18,
      scope: "year",
      yearLevel: 3,
      maxSelections: 1
    });
    await setDoc(doc(db, "elections", electionId), {
      title: "CSS Department Election 2026",
      status,
      positions: ["president", "year_rep_3"],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await setDoc(doc(db, "candidates/cand_president"), {
      electionId,
      positionId: "president",
      name: "Candidate President",
      section: "BSCS 3-A",
      yearLevel: 3,
      platform: "Platform",
      party: null,
      photoURL: "",
      photoPath: "",
      order: 1,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await setDoc(doc(db, "candidates/cand_year_3"), {
      electionId,
      positionId: "year_rep_3",
      name: "Candidate Year 3",
      section: "BSCS 3-A",
      yearLevel: 3,
      platform: "Platform",
      party: null,
      photoURL: "",
      photoPath: "",
      order: 1,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await setDoc(doc(db, "voters/student2"), {
      studentNo: "1234567",
      fullName: "Student Two",
      email: "student.two.scc@gmail.com",
      yearLevel: 2,
      section: "BSCS 2-A",
      eligible: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await setDoc(doc(db, "voters/student3"), {
      studentNo: "7654321",
      fullName: "Student Three",
      email: "student.three.scc@gmail.com",
      yearLevel: 3,
      section: "BSCS 3-A",
      eligible: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await setDoc(doc(db, "tallies", electionId), {
      perCandidate: {
        cand_president: 0,
        cand_year_3: 0
      },
      perPosition: {
        president: 0,
        year_rep_3: 0
      },
      turnout: {
        total: 0,
        byYear: {
          "2": 0,
          "3": 0
        }
      },
      updatedAt: serverTimestamp()
    });
  });
}

function authedDb(uid, token = {}) {
  return testEnv.authenticatedContext(uid, token).firestore();
}

async function createVoterWithStudentIndex(db, uid, studentNo) {
  await runTransaction(db, async (tx) => {
    tx.set(doc(db, "voters", uid), {
      studentNo,
      fullName: "Maria Santos",
      email: "maria.santos.scc@gmail.com",
      yearLevel: 2,
      section: "BSCS 2-B",
      eligible: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    tx.set(doc(db, "studentIndex", studentNo), {
      uid,
      createdAt: serverTimestamp()
    });
  });
}

async function createVoterWithMismatchedStudentIndex(db, uid, voterStudentNo, indexStudentNo) {
  await runTransaction(db, async (tx) => {
    tx.set(doc(db, "voters", uid), {
      studentNo: voterStudentNo,
      fullName: "Maria Santos",
      email: "maria.santos.scc@gmail.com",
      yearLevel: 2,
      section: "BSCS 2-B",
      eligible: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    tx.set(doc(db, "studentIndex", indexStudentNo), {
      uid,
      createdAt: serverTimestamp()
    });
  });
}

async function castVote(db, uid, positionId, candidateId, yearLevel) {
  await runTransaction(db, async (tx) => {
    tx.set(doc(db, "votes", `${electionId}__${uid}__${positionId}`), {
      electionId,
      uid,
      positionId,
      candidateId,
      yearLevel,
      createdAt: serverTimestamp()
    });
    tx.update(doc(db, "voters", uid), {
      [`hasVoted.${electionId}`]: true,
      [`votedAt.${electionId}`]: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}

async function testVoterSelfRegistration() {
  await seedBaseData();
  await assertSucceeds(createVoterWithStudentIndex(authedDb("newStudent"), "newStudent", "1112223"));

  await assertFails(
    setDoc(doc(authedDb("badEmail"), "voters/badEmail"), {
      studentNo: "1112224",
      fullName: "Bad Email",
      email: "bad.email@gmail.com",
      yearLevel: 1,
      section: "BSCS 1-A",
      eligible: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  );

  await assertFails(
    setDoc(doc(authedDb("badStudentNo"), "voters/badStudentNo"), {
      studentNo: "12345",
      fullName: "Bad Student No",
      email: "bad.student.scc@gmail.com",
      yearLevel: 1,
      section: "BSCS 1-A",
      eligible: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  );
}

async function testDuplicateStudentNoRejected() {
  await seedBaseData();
  await assertSucceeds(createVoterWithStudentIndex(authedDb("first"), "first", "9998887"));
  await assertFails(
    createVoterWithMismatchedStudentIndex(
      authedDb("mismatch"),
      "mismatch",
      "1234567",
      "7654321"
    )
  );
  await assertFails(createVoterWithStudentIndex(authedDb("second"), "second", "9998887"));
}

async function testCandidateAdminOnly() {
  await seedBaseData();
  await assertFails(
    setDoc(doc(authedDb("student2"), "candidates/cand_bad"), {
      electionId,
      positionId: "president",
      name: "Unauthorized",
      section: "BSCS 2-A",
      yearLevel: 2,
      platform: "No",
      active: true,
      order: 2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  );
  await assertSucceeds(
    setDoc(doc(authedDb("admin", { admin: true }), "candidates/cand_admin"), {
      electionId,
      positionId: "president",
      name: "Admin Candidate",
      section: "BSCS 4-A",
      yearLevel: 4,
      platform: "Ok",
      active: true,
      order: 2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  );
}

async function testVoteRules() {
  await seedBaseData("open");
  await assertSucceeds(castVote(authedDb("student3"), "student3", "president", "cand_president", 3));

  await assertFails(
    setDoc(doc(authedDb("student3"), `votes/${electionId}__student3__president`), {
      electionId,
      uid: "student3",
      positionId: "president",
      candidateId: "cand_president",
      yearLevel: 3,
      createdAt: serverTimestamp()
    })
  );

  await seedBaseData("open");
  await assertFails(castVote(authedDb("student2"), "student2", "year_rep_3", "cand_year_3", 2));

  await seedBaseData("draft");
  await assertFails(castVote(authedDb("student3"), "student3", "president", "cand_president", 3));
}

async function testReadVisibility() {
  await seedBaseData("open");
  await assertSucceeds(getDoc(doc(authedDb("student2"), "positions/president")));
  await assertFails(getDoc(doc(authedDb("student2"), `votes/${electionId}__student3__president`)));
  await assertFails(getDoc(doc(authedDb("student2"), `tallies/${electionId}`)));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "elections", electionId), {
      title: "CSS Department Election 2026",
      status: "published",
      positions: ["president", "year_rep_3"],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  await assertSucceeds(getDoc(doc(authedDb("student2"), `tallies/${electionId}`)));
}

async function testTallyWritesAdminOnly() {
  await seedBaseData("open");
  await assertFails(
    setDoc(doc(authedDb("student2"), `tallies/${electionId}`), {
      perCandidate: {
        forged: 999
      },
      perPosition: {
        president: 999
      },
      turnout: {
        total: 999,
        byYear: {
          "2": 999
        }
      },
      updatedAt: serverTimestamp()
    })
  );

  await assertSucceeds(
    setDoc(doc(authedDb("admin", { admin: true }), `tallies/${electionId}`), {
      perCandidate: {
        cand_president: 1
      },
      perPosition: {
        president: 1
      },
      turnout: {
        total: 1,
        byYear: {
          "3": 1
        }
      },
      updatedAt: serverTimestamp()
    })
  );
}

try {
  await testVoterSelfRegistration();
  await testDuplicateStudentNoRejected();
  await testCandidateAdminOnly();
  await testVoteRules();
  await testReadVisibility();
  await testTallyWritesAdminOnly();
  console.log("Firestore rules tests passed.");
} finally {
  await testEnv.cleanup();
}

assert.ok(true);
