// Phase 0: secret-ballot integrity. Ballots are anonymous and written only by
// the trusted submitBallot function (Admin SDK, which bypasses these rules).
// These tests assert the rules layer alone makes ballots unlinkable to voters:
// no client can write a ballot, read a ballot, forge the participation lock, or
// write a tally. The happy-path submission itself is covered by the functions
// unit tests (firebase/functions/ballotLogic.test.js) and the browser E2E.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

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

const studentCtx = () => testEnv.authenticatedContext("student", { email: "student.scc@gmail.com" });
const adminCtx = () => testEnv.authenticatedContext("admin_uid", { email: "admin.scc@gmail.com", admin: true });

async function seed() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "elections", electionId), {
      title: "Test Election",
      status: "open",
      registrationOpen: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await setDoc(doc(db, "voters", "student"), {
      studentNo: "1112223",
      fullName: "Student One",
      email: "student.scc@gmail.com",
      yearLevel: 3,
      section: "BSCS-3A",
      eligible: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    // A ballot as the submitBallot function would write it: anonymous, no uid.
    await setDoc(doc(db, "ballots", "seeded_ballot"), {
      electionId,
      positionId: "president",
      candidateId: "cand_president",
      yearLevel: 3
    });
    await setDoc(doc(db, "tallies", electionId), {
      perCandidate: { cand_president: 1 },
      perPosition: { president: 1 },
      turnout: { total: 1, byYear: { "3": 1 } },
      updatedAt: serverTimestamp()
    });
  });
}

await seed();

// --- ballots are unwritable by clients ---
await assertFails(
  setDoc(doc(studentCtx().firestore(), "ballots/forged"), {
    electionId,
    positionId: "president",
    candidateId: "cand_president",
    yearLevel: 3
  })
);
console.log("PASS student cannot create a ballot");

await assertFails(
  setDoc(doc(adminCtx().firestore(), "ballots/forged_by_admin"), {
    electionId,
    positionId: "president",
    candidateId: "cand_president",
    yearLevel: 3
  })
);
console.log("PASS admin cannot create a ballot");

await assertFails(updateDoc(doc(adminCtx().firestore(), "ballots/seeded_ballot"), { candidateId: "swapped" }));
console.log("PASS admin cannot tamper with an existing ballot");

// --- ballots are unreadable by everyone (the secret ballot) ---
await assertFails(getDoc(doc(studentCtx().firestore(), "ballots/seeded_ballot")));
console.log("PASS student cannot read a ballot");

await assertFails(getDoc(doc(adminCtx().firestore(), "ballots/seeded_ballot")));
console.log("PASS admin cannot read a ballot — no vote can be traced to a voter");

// --- participation lock cannot be forged ---
await assertFails(
  updateDoc(doc(studentCtx().firestore(), "voters/student"), {
    [`hasVoted.${electionId}`]: true,
    [`votedAt.${electionId}`]: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
);
console.log("PASS voter cannot forge their participation lock");

// profile edits still work (proves it's the lock fields, not the doc, that are frozen)
await assertSucceeds(
  updateDoc(doc(studentCtx().firestore(), "voters/student"), {
    fullName: "Student One Renamed",
    updatedAt: serverTimestamp()
  })
);
console.log("PASS voter can still edit their own profile fields");

// --- tallies are function-only ---
await assertFails(
  setDoc(doc(adminCtx().firestore(), "tallies", electionId), {
    perCandidate: { cand_president: 999 },
    perPosition: { president: 999 },
    turnout: { total: 999, byYear: { "3": 999 } },
    updatedAt: serverTimestamp()
  })
);
console.log("PASS admin cannot write tallies directly (publishTally function only)");

// published tallies remain publicly readable
await testEnv.withSecurityRulesDisabled(async (context) => {
  await setDoc(doc(context.firestore(), "elections", electionId), {
    title: "Test Election",
    status: "published",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
});
await assertSucceeds(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "tallies", electionId)));
console.log("PASS published tally is publicly readable");

await testEnv.cleanup();
console.log("Phase 0 integrity rules tests passed.");
