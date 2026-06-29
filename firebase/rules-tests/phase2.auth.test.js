import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { initializeApp, deleteApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { hasAdminClaim, hasVotedInElection, isStudentSession } from "../../web/src/auth/guards-core.js";

const projectId = "css-department-voting-sy-f46a5";
const electionId = "css_department_election_2026";
const authHost = "127.0.0.1:9099";
const app = initializeApp({
  apiKey: "test-api-key",
  authDomain: `${projectId}.firebaseapp.com`,
  projectId
}, "phase2-auth-test");
const auth = getAuth(app);
const db = getFirestore(app);

connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8081);

process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
const adminApp = initializeAdminApp({ projectId }, "phase2-admin-test");
const adminAuth = getAdminAuth(adminApp);

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: {
    rules: readFileSync("../firestore.rules", "utf8"),
    host: "127.0.0.1",
    port: 8081
  }
});

async function clearAuthUsers() {
  await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/accounts`, {
    method: "DELETE"
  });
}

async function clearFirestore() {
  await testEnv.clearFirestore();
}

async function registerStudent(values) {
  const credential = await createUserWithEmailAndPassword(auth, values.email, values.password);
  const { user } = credential;

  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    batch.set(doc(db, "voters", user.uid), {
      studentNo: values.studentNo,
      fullName: values.fullName,
      email: values.email,
      yearLevel: values.yearLevel,
      section: values.section,
      eligible: true,
      createdAt: now,
      updatedAt: now
    });
    batch.set(doc(db, "studentIndex", values.studentNo), {
      uid: user.uid,
      createdAt: now
    });
    await batch.commit();
    return user;
  } catch (error) {
    await deleteUser(user);
    throw error;
  }
}

async function readDocWithoutRules(path) {
  let data = null;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDoc(doc(context.firestore(), path));
    data = snapshot.exists() ? snapshot.data() : null;
  });
  return data;
}

async function assertSignInFails(email, password) {
  let failed = false;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch {
    failed = true;
  }
  assert.equal(failed, true);
}

try {
  await clearAuthUsers();
  await clearFirestore();

  const validUser = await registerStudent({
    email: "phase.two.scc@gmail.com",
    password: "password123",
    studentNo: "1234567",
    fullName: "Phase Two Student",
    yearLevel: 2,
    section: "BSCS 2-A"
  });

  const voter = await readDocWithoutRules(`voters/${validUser.uid}`);
  const index = await readDocWithoutRules("studentIndex/1234567");
  assert.equal(voter.studentNo, "1234567");
  assert.equal(index.uid, validUser.uid);
  assert.equal(isStudentSession({ user: validUser, voterProfile: voter }), true);

  await signOut(auth);
  const loginCredential = await signInWithEmailAndPassword(auth, "phase.two.scc@gmail.com", "password123");
  assert.equal(loginCredential.user.email, "phase.two.scc@gmail.com");

  await signOut(auth);
  await assert.rejects(
    registerStudent({
      email: "duplicate.id.scc@gmail.com",
      password: "password123",
      studentNo: "1234567",
      fullName: "Duplicate Student",
      yearLevel: 2,
      section: "BSCS 2-B"
    })
  );
  await assertSignInFails("duplicate.id.scc@gmail.com", "password123");

  assert.equal(isStudentSession({ user: null, voterProfile: null }), false);
  assert.equal(hasVotedInElection({ hasVoted: { [electionId]: true } }, electionId), true);
  assert.equal(hasAdminClaim({}), false);

  const adminUser = await registerStudent({
    email: "phase.admin.scc@gmail.com",
    password: "password123",
    studentNo: "7654321",
    fullName: "Phase Admin",
    yearLevel: 4,
    section: "BSCS 4-A"
  });
  await adminAuth.setCustomUserClaims(adminUser.uid, { admin: true });
  await adminUser.getIdToken(true);
  const tokenResult = await adminUser.getIdTokenResult(true);
  assert.equal(hasAdminClaim(tokenResult.claims), true);

  console.log("Phase 2 auth integration tests passed.");
} finally {
  await signOut(auth).catch(() => {});
  await testEnv.cleanup();
  await deleteAdminApp(adminApp);
  await deleteApp(app);
}
