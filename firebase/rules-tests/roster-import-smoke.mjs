// End-to-end smoke test for the roster feature against the emulator suite.
//
// Requires the auth, firestore, AND functions emulators running:
//   npx --prefix voting-app firebase emulators:start \
//     --only auth,firestore,functions,storage --project css-department-voting-sy-f46a5
//   cd firebase/rules-tests && node roster-import-smoke.mjs
//
// Exercises the REAL Cloud Functions (importRoster + submitBallot), not just
// rules: import validation summary, roster upsert, roster-based eligibility,
// email-match enforcement, and one-student-one-vote. Skips gracefully when the
// functions emulator is unreachable.

import assert from "node:assert/strict";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { initializeApp as initClientApp } from "firebase/app";
import { connectAuthEmulator, getAuth as getClientAuth, signInWithCustomToken, signOut as clientSignOut } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const PROJECT_ID = process.env.GCLOUD_PROJECT || "css-department-voting-sy-f46a5";
const FUNCTIONS_EMULATOR_HOST = process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1";
const FUNCTIONS_EMULATOR_PORT = Number(process.env.FUNCTIONS_EMULATOR_PORT ?? 5001);
const FIREBASE_CONFIG = {
  apiKey: "fake-api-key",
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
};

const ROSTER_ROWS = [
  { studentNo: "20260001", fullName: "Juan Dela Cruz", section: "BSCS 1-A", yearLevel: "1st Year", email: "juan.delacruz.scc@gmail.com", status: "active", eligible: "yes" },
  { studentNo: "20260002", fullName: "Maria Santos", section: "BSCS-2B", yearLevel: 2, email: "maria.santos.scc@gmail.com", status: "enrolled", eligible: "yes" },
  { studentNo: "20260003", fullName: "Pedro Reyes", section: "BSCS-3A", yearLevel: "3", status: "active", eligible: "yes" },
  { studentNo: "20260001", fullName: "Duplicate Juan", section: "BSCS-1A", yearLevel: 1, status: "active", eligible: "yes" },
  { studentNo: "bad", fullName: "", section: "BSIT-9Z", yearLevel: "Grade 12", status: "maybe", eligible: "sometimes" },
];

async function functionsReachable() {
  try {
    const response = await fetch(`http://${FUNCTIONS_EMULATOR_HOST}:${FUNCTIONS_EMULATOR_PORT}/`);
    return response.ok || response.status === 404; // 404 on root is fine — emulator is up
  } catch {
    return false;
  }
}

if (!(await functionsReachable())) {
  console.log("SKIP roster-import-smoke: functions emulator not reachable. Start it with --only auth,firestore,functions,storage.");
  process.exit(0);
}

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8081";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() });
const adminDb = getFirestore();
const adminAuth = getAuth();

await adminDb.recursiveDelete(adminDb.collection("voters"));
await adminDb.recursiveDelete(adminDb.collection("students"));
await adminDb.recursiveDelete(adminDb.collection("positions"));
await adminDb.recursiveDelete(adminDb.collection("elections"));

// Positions so year-1 voters have a configured ballot (selections optional).
await adminDb.doc("positions/president").set({ name: "President", order: 1, scope: "department", yearLevel: null, maxSelections: 1 });
await adminDb.doc("positions/year_rep_1").set({ name: "1st Year Representative", order: 19, scope: "year", yearLevel: 1, maxSelections: 1 });
await adminDb.doc("elections/css_department_election_2026").set({
  title: "CSS Department Election 2026",
  status: "open",
  positions: ["president", "year_rep_1"],
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});

// --- admin caller -----------------------------------------------------------
const adminUser = await adminAuth.createUser({ email: "admin.smoke@scc.edu.ph", password: "smoke-pass-123" });
await adminAuth.setCustomUserClaims(adminUser.uid, { admin: true });
const adminToken = await adminAuth.createCustomToken(adminUser.uid);

// --- students (voter accounts) ---------------------------------------------
const rosterStudent = await adminAuth.createUser({ email: "juan.delacruz.scc@gmail.com", password: "smoke-pass-123" });
const notOnRoster = await adminAuth.createUser({ email: "stranger.scc@gmail.com", password: "smoke-pass-123" });
const wrongEmail = await adminAuth.createUser({ email: "other.person.scc@gmail.com", password: "smoke-pass-123" });
const fakeName = await adminAuth.createUser({ email: "fake.name.scc@gmail.com", password: "smoke-pass-123" });
// Masterlist-style voter: registers any unclaimed ID; identity is proven by
// name + section + year matching a roster entry that has no student number.
const masterlistVoter = await adminAuth.createUser({ email: "ana.lopez.scc@gmail.com", password: "smoke-pass-123" });
const wrongNameVoter = await adminAuth.createUser({ email: "bob.smith.scc@gmail.com", password: "smoke-pass-123" });

function voterDoc(uid, studentNo, email, fullName = "Juan Dela Cruz", yearLevel = 1, section = "BSCS-1A") {
  return adminDb.doc(`voters/${uid}`).set({
    studentNo,
    fullName,
    email,
    yearLevel,
    section,
    eligible: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
await voterDoc(rosterStudent.uid, "20260001", "juan.delacruz.scc@gmail.com");
await voterDoc(notOnRoster.uid, "9999999", "stranger.scc@gmail.com", "Strange Person");
await voterDoc(wrongEmail.uid, "20260001", "other.person.scc@gmail.com");
// Same ID + email as the roster student, but a made-up name — only the name differs.
await voterDoc(fakeName.uid, "20260001", "juan.delacruz.scc@gmail.com", "Fake Name");
// Ana's voter record carries a student number, but the roster has NO record
// under that number — she must match by name + section + year instead.
await voterDoc(masterlistVoter.uid, "20260999", "ana.lopez.scc@gmail.com", "Ana Lopez", 2, "BSCS-2B");
await voterDoc(wrongNameVoter.uid, "20260998", "bob.smith.scc@gmail.com", "Bob Smith", 2, "BSCS-2B");

// --- client SDK wired to the emulators -------------------------------------
const app = initClientApp(FIREBASE_CONFIG);
const clientAuth = getClientAuth(app);
connectAuthEmulator(clientAuth, `http://${FUNCTIONS_EMULATOR_HOST}:9099`, { disableWarnings: true });
const functions = getFunctions(app); // default us-central1 region
connectFunctionsEmulator(functions, FUNCTIONS_EMULATOR_HOST, FUNCTIONS_EMULATOR_PORT);

async function callAs(uid, token, name, data) {
  const { user } = await signInWithCustomToken(clientAuth, token);
  assert.equal(user.uid, uid);
  const call = httpsCallable(functions, name);
  try {
    const result = await call(data);
    return { ok: true, data: result.data };
  } catch (error) {
    // Callable errors surface as functions/<status-code> on the client.
    const rawCode = error.code ?? "unknown";
    const code = String(rawCode).startsWith("functions/") ? String(rawCode).slice("functions/".length) : rawCode;
    return { ok: false, code, message: error.message ?? String(error) };
  }
}

let failures = 0;
function check(name, condition, extra = "") {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name} ${extra}`);
  }
}

try {
  // 1. importRoster as an admin: summary reflects valid/duplicate/invalid rows.
  const importResult = await callAs(adminUser.uid, adminToken, "importRoster", {
    rows: ROSTER_ROWS,
    replace: false,
  });
  check("importRoster succeeds for admin", importResult.ok === true);
  const summary = importResult.data?.summary ?? {};
  check("import summary counts inserted", summary.inserted === 3, JSON.stringify(summary));
  check("import summary counts duplicates", summary.duplicates === 1, JSON.stringify(summary));
  check("import summary counts invalid", summary.invalid === 1, JSON.stringify(summary));
  check("import summary rejects 2 rows", summary.rejected === 2, JSON.stringify(summary));
  check("import summary reports errors", Array.isArray(summary.errors) && summary.errors.length === 2);

  // 2. The roster docs were actually written.
  const juan = await adminDb.doc("students/20260001").get();
  check("roster doc written with normalized section", juan.exists && juan.data().section === "BSCS-1A");

  // 3. A non-admin cannot import.
  const strangerToken = await adminAuth.createCustomToken(rosterStudent.uid);
  const forbidden = await callAs(rosterStudent.uid, strangerToken, "importRoster", { rows: ROSTER_ROWS, replace: false });
  check("importRoster rejects non-admin", forbidden.ok === false && forbidden.code === "permission-denied");

  // 4. submitBallot: roster student can vote (empty ballot is legal).
  const vote1 = await callAs(rosterStudent.uid, strangerToken, "submitBallot", { electionId: "css_department_election_2026", selections: {} });
  check("roster student can vote", vote1.ok === true, vote1.message);

  // 5. One student, one vote: second submission is rejected server-side.
  const vote2 = await callAs(rosterStudent.uid, strangerToken, "submitBallot", { electionId: "css_department_election_2026", selections: {} });
  check("duplicate submission rejected", vote2.ok === false && vote2.code === "already-exists", vote2.message);
  const lock = await adminDb.doc(`voters/${rosterStudent.uid}`).get();
  check("participation lock recorded once", lock.data().hasVoted?.["css_department_election_2026"] === true);

  // 6. Student not on the official roster is denied.
  const notOnRosterToken = await adminAuth.createCustomToken(notOnRoster.uid);
  const denied = await callAs(notOnRoster.uid, notOnRosterToken, "submitBallot", { electionId: "css_department_election_2026", selections: {} });
  check("non-roster student denied", denied.ok === false && denied.code === "permission-denied", denied.message);

  // 7. Email mismatch (roster has juan's email; account uses another) is denied.
  const wrongEmailToken = await adminAuth.createCustomToken(wrongEmail.uid);
  const emailDenied = await callAs(wrongEmail.uid, wrongEmailToken, "submitBallot", { electionId: "css_department_election_2026", selections: {} });
  check("email-mismatch account denied", emailDenied.ok === false && emailDenied.code === "permission-denied", emailDenied.message);

  // 7b. A made-up name on a real Student ID (name + last name mismatch) is denied.
  const fakeNameToken = await adminAuth.createCustomToken(fakeName.uid);
  const nameDenied = await callAs(fakeName.uid, fakeNameToken, "submitBallot", { electionId: "css_department_election_2026", selections: {} });
  check("forged-name account denied", nameDenied.ok === false && nameDenied.code === "failed-precondition", nameDenied.message);

  // 8. Unauthenticated request is rejected.
  await clientSignOut(clientAuth); // clear the previous test user's token
  const anonymousCall = httpsCallable(functions, "submitBallot");
  try {
    await anonymousCall({ electionId: "css_department_election_2026", selections: {} });
    check("unauthenticated submitBallot rejected", false);
  } catch (error) {
    const rawCode = error.code ?? "unknown";
    const code = String(rawCode).startsWith("functions/") ? String(rawCode).slice("functions/".length) : rawCode;
    check("unauthenticated submitBallot rejected", code === "unauthenticated", code);
  }

  // 9. replace mode deactivates roster students absent from the file.
  const replaceResult = await callAs(adminUser.uid, adminToken, "importRoster", {
    rows: ROSTER_ROWS.filter((r) => r.studentNo === "20260001"),
    replace: true,
  });
  check("replace mode deactivates absent students", replaceResult.data?.summary?.deactivated === 2, JSON.stringify(replaceResult.data?.summary));
  const pedro = await adminDb.doc("students/20260003").get();
  check("absent student flipped to inactive", pedro.exists && pedro.data().status === "inactive");

  // 10. Masterlist import: rows with no student number, a CS sheet-style
  // section, and Enlisted status are accepted and normalized server-side.
  const nameRows = [
    { fullName: "Lopez, Ana", section: "CS 2B", yearLevel: "2", status: "Enlisted", eligible: "yes" },
    { fullName: "Lopez, Ana", section: "CS 2B", yearLevel: "2", status: "Enrolled", eligible: "yes" },
  ];
  const nameImport = await callAs(adminUser.uid, adminToken, "importRoster", { rows: nameRows, replace: false });
  check("masterlist rows import with one inserted and one duplicate",
    nameImport.data?.summary?.inserted === 1 && nameImport.data?.summary?.duplicates === 1,
    JSON.stringify(nameImport.data?.summary));
  const sectionSnap = await adminDb.collection("students").where("section", "==", "BSCS-2B").get();
  const anaDoc = sectionSnap.docs.find((d) => d.data().fullName === "Ana Lopez");
  check("masterlist row normalized to canonical section + active status",
    Boolean(anaDoc) && anaDoc.data().section === "BSCS-2B" && anaDoc.data().status === "active" && !anaDoc.data().studentNo,
    JSON.stringify(anaDoc && anaDoc.data()));

  // 11. Re-importing the same masterlist rows updates, never duplicates.
  const reImport = await callAs(adminUser.uid, adminToken, "importRoster", { rows: nameRows, replace: false });
  const sectionSnap2 = await adminDb.collection("students").where("section", "==", "BSCS-2B").get();
  const anaDocs = sectionSnap2.docs.filter((d) => d.data().fullName === "Ana Lopez");
  check("re-import updates the same masterlist entry",
    reImport.data?.summary?.updated === 1 && anaDocs.length === 1,
    JSON.stringify(reImport.data?.summary));

  // 12. checkMyRosterStatus mirrors the server verdict for the ballot page.
  const masterlistToken = await adminAuth.createCustomToken(masterlistVoter.uid);
  const statusOk = await callAs(masterlistVoter.uid, masterlistToken, "checkMyRosterStatus", { electionId: "css_department_election_2026" });
  check("status callable ok for an eligible masterlist voter", statusOk.data?.ok === true, JSON.stringify(statusOk.data));
  const wrongNameToken = await adminAuth.createCustomToken(wrongNameVoter.uid);
  const statusDenied = await callAs(wrongNameVoter.uid, wrongNameToken, "checkMyRosterStatus", { electionId: "css_department_election_2026" });
  check("status callable reports not-on-roster for a name mismatch",
    statusDenied.data?.ok === false && statusDenied.data?.reason === "not-on-roster",
    JSON.stringify(statusDenied.data));

  // 13. A voter with no ID-keyed roster record votes by name + section + year.
  const anaVote = await callAs(masterlistVoter.uid, masterlistToken, "submitBallot", { electionId: "css_department_election_2026", selections: {} });
  check("name-matched masterlist voter can vote", anaVote.ok === true, anaVote.message);
  const statusAfterVote = await callAs(masterlistVoter.uid, masterlistToken, "checkMyRosterStatus", { electionId: "css_department_election_2026" });
  check("status callable reports already-voted after voting",
    statusAfterVote.data?.ok === false && statusAfterVote.data?.reason === "already-voted",
    JSON.stringify(statusAfterVote.data));

  // 14. Same section + year but a different name → not on the roster.
  const bobVote = await callAs(wrongNameVoter.uid, wrongNameToken, "submitBallot", { electionId: "css_department_election_2026", selections: {} });
  check("wrong-name voter in an eligible section denied", bobVote.ok === false && bobVote.code === "permission-denied", bobVote.message);

  // 15. deleteRosterEntries: non-admins are denied.
  const deleteForbidden = await callAs(masterlistVoter.uid, masterlistToken, "deleteRosterEntries", { ids: ["20260001"] });
  check("deleteRosterEntries rejects non-admin", deleteForbidden.ok === false && deleteForbidden.code === "permission-denied");

  // 16. Admin removes one specific entry.
  const removeOne = await callAs(adminUser.uid, adminToken, "deleteRosterEntries", { ids: ["20260001"] });
  check("admin removes a specific roster entry", removeOne.data?.deleted === 1, JSON.stringify(removeOne.data));
  const removed = await adminDb.doc("students/20260001").get();
  check("removed roster entry is gone", !removed.exists);

  // 17. Admin removes everything.
  const removeAll = await callAs(adminUser.uid, adminToken, "deleteRosterEntries", { all: true });
  check("admin removes the whole roster", removeAll.ok === true && removeAll.data?.deleted > 0, JSON.stringify(removeAll.data));
  const remaining = await adminDb.collection("students").get();
  check("roster collection is empty after remove all", remaining.size === 0);
} finally {
  await adminAuth.deleteUser(adminUser.uid).catch(() => {});
  await adminAuth.deleteUser(rosterStudent.uid).catch(() => {});
  await adminAuth.deleteUser(notOnRoster.uid).catch(() => {});
  await adminAuth.deleteUser(wrongEmail.uid).catch(() => {});
  await adminAuth.deleteUser(fakeName.uid).catch(() => {});
  await adminAuth.deleteUser(masterlistVoter.uid).catch(() => {});
  await adminAuth.deleteUser(wrongNameVoter.uid).catch(() => {});
}

if (failures > 0) {
  console.error(`${failures} roster smoke check(s) failed.`);
  process.exit(1);
}
console.log("Roster import + vote smoke tests passed.");
