import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
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

async function seedBaseData(status = "open", registrationOpen = true, allowGuestVoters = false) {
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
      registrationOpen,
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
    // Official roster record for student2 (written by the importRoster function
    // in production; seeded here with rules disabled).
    await setDoc(doc(db, "students/1234567"), {
      studentNo: "1234567",
      fullName: "Student Two",
      email: "student.two.scc@gmail.com",
      yearLevel: 2,
      section: "BSCS 2-A",
      status: "active",
      eligible: true,
      importedAt: serverTimestamp(),
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
    if (allowGuestVoters) {
      await setDoc(doc(db, "config/app"), {
        allowGuestVoters: true,
        maintenanceMode: false,
        updatedBy: "rules-test",
        updatedAt: serverTimestamp()
      });
    }
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

async function createGuestWithEmailIndex(db, uid, overrides = {}) {
  const email = overrides.email ?? "guest.one.scc@gmail.com";
  const studentNo = overrides.studentNo ?? "7776665";
  const yearLevel = overrides.yearLevel ?? 3;
  const section = overrides.section ?? "BSCS 3-D";
  const batch = writeBatch(db);

  batch.set(doc(db, "voters", uid), {
    studentNo,
    fullName: overrides.fullName ?? "Guest One",
    email,
    yearLevel,
    section,
    eligible: true,
    guest: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.set(doc(db, "emailIndex", email), {
    uid,
    createdAt: serverTimestamp()
  });
  batch.set(doc(db, "studentIndex", studentNo), {
    uid,
    createdAt: serverTimestamp()
  });

  await batch.commit();
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

async function testGuestOneTimeRegistration() {
  await seedBaseData("open", true, true);

  await assertSucceeds(createGuestWithEmailIndex(authedDb("guest1"), "guest1"));
  await assertFails(createGuestWithEmailIndex(authedDb("guest2"), "guest2"));
  await assertFails(
    setDoc(doc(authedDb("guestNoIndex"), "voters/guestNoIndex"), {
      studentNo: "5554443",
      fullName: "Guest No Index",
      email: "guest.noindex.scc@gmail.com",
      yearLevel: 2,
      section: "BSCS 2-A",
      eligible: true,
      guest: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  );
}

async function testRegistrationGate() {
  await seedBaseData("draft", false, true);
  await assertFails(createVoterWithStudentIndex(authedDb("closedStudent"), "closedStudent", "1112225"));
  await assertFails(createGuestWithEmailIndex(authedDb("closedGuest"), "closedGuest"));

  await seedBaseData("draft", true, true);
  await assertSucceeds(createVoterWithStudentIndex(authedDb("openStudent"), "openStudent", "1112226"));
  await assertSucceeds(createGuestWithEmailIndex(authedDb("openGuest"), "openGuest"));
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

// Ballots are written only by the trusted submitBallot function (Admin SDK).
// No client may write a ballot or forge the participation lock.
async function testBallotsAreFunctionOnly() {
  await seedBaseData("open");
  await assertFails(
    setDoc(doc(authedDb("student3"), "ballots/forged1"), {
      electionId,
      positionId: "president",
      candidateId: "cand_president",
      yearLevel: 3
    })
  );

  // A voter cannot mark themselves as having voted without casting a ballot.
  await assertFails(
    updateDoc(doc(authedDb("student3"), "voters/student3"), {
      [`hasVoted.${electionId}`]: true,
      [`votedAt.${electionId}`]: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  );
}

async function testReadVisibility() {
  await seedBaseData("open");
  await assertSucceeds(getDoc(doc(authedDb("student2"), "positions/president")));
  // The secret ballot: ballots are never client-readable — not even by an admin.
  await assertFails(getDoc(doc(authedDb("student2"), "ballots/anything")));
  await assertFails(getDoc(doc(authedDb("admin", { admin: true }), "ballots/anything")));
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

// The official roster is function-written only. Students may read their own
// record; admins may read any; nobody may write.
async function testRosterRules() {
  await seedBaseData("open");

  // The student whose locked voter profile carries this studentNo may read it.
  await assertSucceeds(getDoc(doc(authedDb("student2"), "students/1234567")));
  // An admin may read the roster.
  await assertSucceeds(getDoc(doc(authedDb("admin", { admin: true }), "students/1234567")));
  // No other student may read another student's roster record.
  await assertFails(getDoc(doc(authedDb("student3"), "students/1234567")));
  // A signed-out client may not read roster records.
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "students/1234567")));

  // No client — student or admin — may create, update, or delete roster records.
  const forged = {
    studentNo: "9990001",
    fullName: "Forged",
    section: "BSCS-1A",
    yearLevel: 1,
    status: "active",
    eligible: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await assertFails(setDoc(doc(authedDb("student2"), "students/9990001"), forged));
  await assertFails(setDoc(doc(authedDb("admin", { admin: true }), "students/9990001"), forged));
  await assertFails(updateDoc(doc(authedDb("student2"), "students/1234567"), { status: "inactive" }));
  await assertFails(updateDoc(doc(authedDb("admin", { admin: true }), "students/1234567"), { status: "inactive" }));
  await assertFails(deleteDoc(doc(authedDb("admin", { admin: true }), "students/1234567")));
}

// Tallies are written only by the publishTally function (Admin SDK) — no client,
// not even an admin, may write them directly.
async function testTallyWritesDenied() {
  await seedBaseData("open");
  const forged = {
    perCandidate: { forged: 999 },
    perPosition: { president: 999 },
    turnout: { total: 999, byYear: { "2": 999 } },
    updatedAt: serverTimestamp()
  };
  await assertFails(setDoc(doc(authedDb("student2"), `tallies/${electionId}`), forged));
  await assertFails(setDoc(doc(authedDb("admin", { admin: true }), `tallies/${electionId}`), forged));
}

try {
  await testVoterSelfRegistration();
  await testDuplicateStudentNoRejected();
  await testGuestOneTimeRegistration();
  await testRegistrationGate();
  await testCandidateAdminOnly();
  await testBallotsAreFunctionOnly();
  await testReadVisibility();
  await testTallyWritesDenied();
  await testRosterRules();
  console.log("Firestore rules tests passed.");
} finally {
  await testEnv.cleanup();
}

assert.ok(true);
