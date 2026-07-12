// Phase 7: superadmin backend — admin registry, app config, audit tightening.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

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

const SUPER_UID = "super_uid";
const superCtx = () => testEnv.authenticatedContext(SUPER_UID, { email: "super.scc@gmail.com", superadmin: true });
const registryAdminCtx = () => testEnv.authenticatedContext("reg_admin_uid", { email: "reg.admin.scc@gmail.com" });
const studentCtx = () => testEnv.authenticatedContext("student_uid", { email: "student.scc@gmail.com" });
const guestCtx = () => testEnv.authenticatedContext("guest_uid", {}); // anonymous: no email token

async function seed({ allowGuestVoters } = {}) {
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
    await setDoc(doc(db, "admins", "reg.admin.scc@gmail.com"), {
      email: "reg.admin.scc@gmail.com",
      role: "admin",
      addedBy: SUPER_UID,
      reason: "seeded registry admin",
      createdAt: serverTimestamp()
    });
    if (allowGuestVoters !== undefined) {
      await setDoc(doc(db, "config", "app"), {
        allowGuestVoters,
        maintenanceMode: false,
        updatedBy: SUPER_UID,
        updatedAt: serverTimestamp()
      });
    }
  });
}

function adminGrant(overrides = {}) {
  return {
    email: "new.admin.scc@gmail.com",
    role: "admin",
    addedBy: SUPER_UID,
    reason: "handles candidate encoding",
    createdAt: serverTimestamp(),
    ...overrides
  };
}

function guestVoter() {
  return {
    fullName: "Guest Voter",
    email: "guest.voter.scc@gmail.com",
    yearLevel: 2,
    section: "BSCS-2A",
    eligible: true,
    guest: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

// --- admins registry ---
await seed();

await assertSucceeds(
  setDoc(doc(superCtx().firestore(), "admins", "new.admin.scc@gmail.com"), adminGrant())
);
console.log("PASS superadmin can grant admin");

await assertFails(
  setDoc(doc(registryAdminCtx().firestore(), "admins", "other.scc@gmail.com"), adminGrant({ email: "other.scc@gmail.com", addedBy: "reg_admin_uid" }))
);
console.log("PASS registry admin cannot grant admins");

await assertFails(
  setDoc(doc(superCtx().firestore(), "admins", "short.scc@gmail.com"), adminGrant({ email: "short.scc@gmail.com", reason: "short" }))
);
console.log("PASS grant requires a reason of at least 8 chars");

await assertFails(
  setDoc(doc(superCtx().firestore(), "admins", "mismatch.scc@gmail.com"), adminGrant({ email: "different@x.com" }))
);
console.log("PASS grant doc id must match email field");

await assertSucceeds(deleteDoc(doc(superCtx().firestore(), "admins", "reg.admin.scc@gmail.com")));
console.log("PASS superadmin can revoke admin");

await seed();
await assertSucceeds(getDoc(doc(registryAdminCtx().firestore(), "admins", "reg.admin.scc@gmail.com")));
await assertFails(getDoc(doc(studentCtx().firestore(), "admins", "reg.admin.scc@gmail.com")));
console.log("PASS admin can read own registry entry; student cannot read others'");

// --- registry membership grants admin powers ---
await assertSucceeds(
  updateDoc(doc(registryAdminCtx().firestore(), "elections", electionId), {
    status: "closed",
    updatedAt: serverTimestamp()
  })
);
console.log("PASS registry admin can run admin operations (election update)");

await assertFails(
  updateDoc(doc(studentCtx().firestore(), "elections", electionId), {
    status: "closed",
    updatedAt: serverTimestamp()
  })
);
console.log("PASS plain student still cannot run admin operations");

// --- config/app ---
await seed();
await assertSucceeds(
  setDoc(doc(superCtx().firestore(), "config", "app"), {
    allowGuestVoters: false,
    maintenanceMode: false,
    updatedBy: SUPER_UID,
    updatedAt: serverTimestamp()
  })
);
console.log("PASS superadmin can write config/app");

await assertFails(
  setDoc(doc(registryAdminCtx().firestore(), "config", "app"), {
    allowGuestVoters: true,
    maintenanceMode: false,
    updatedBy: "reg_admin_uid",
    updatedAt: serverTimestamp()
  })
);
console.log("PASS registry admin cannot write config/app");

await assertSucceeds(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "config", "app")));
console.log("PASS config/app is publicly readable");

// --- guest signup gating ---
await seed({ allowGuestVoters: true });
{
  const db = guestCtx().firestore();
  const { writeBatch } = await import("firebase/firestore");
  const batch = writeBatch(db);
  batch.set(doc(db, "voters", "guest_uid"), guestVoter());
  batch.set(doc(db, "emailIndex", "guest.voter.scc@gmail.com"), { uid: "guest_uid", createdAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
}
console.log("PASS guest signup allowed when config permits");

await seed({ allowGuestVoters: false });
{
  const db = guestCtx().firestore();
  const { writeBatch } = await import("firebase/firestore");
  const batch = writeBatch(db);
  batch.set(doc(db, "voters", "guest_uid"), guestVoter());
  batch.set(doc(db, "emailIndex", "guest.voter.scc@gmail.com"), { uid: "guest_uid", createdAt: serverTimestamp() });
  await assertFails(batch.commit());
}
console.log("PASS guest signup denied when config disables it");

// no config doc at all -> default allow
await seed();
{
  const db = guestCtx().firestore();
  const { writeBatch } = await import("firebase/firestore");
  const batch = writeBatch(db);
  batch.set(doc(db, "voters", "guest_uid"), guestVoter());
  batch.set(doc(db, "emailIndex", "guest.voter.scc@gmail.com"), { uid: "guest_uid", createdAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
}
console.log("PASS guest signup defaults to allowed when config/app is absent");

// --- audit tightening ---
await seed();
await assertFails(
  setDoc(doc(studentCtx().firestore(), "audit", "forged"), {
    ts: serverTimestamp(),
    actorUid: "student_uid",
    action: "election.publish",
    target: `elections/${electionId}`
  })
);
console.log("PASS student cannot forge audit entries");

await assertSucceeds(
  setDoc(doc(registryAdminCtx().firestore(), "audit", "real-admin-action"), {
    ts: serverTimestamp(),
    actorUid: "reg_admin_uid",
    actorRole: "admin",
    action: "candidate.update",
    target: "candidates/x",
    details: {}
  })
);
console.log("PASS registry admin can write audit entries");

await testEnv.cleanup();
console.log("Phase 7 superadmin rules tests passed.");
