// Admin-flow smoke test against the local Firebase emulators.
// Mirrors the exact Firestore operations AdminRedesignConsole triggers via lib/admin/adminData.ts.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDocs, getFirestore,
  limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';

const ELECTION_ID = 'css_department_election_2026';
const app = initializeApp({ apiKey: 'fake-api-key', authDomain: 'localhost', projectId: 'css-department-voting-sy-f46a5' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8081);

const results = [];
async function step(name, fn) {
  try {
    const detail = await fn();
    results.push(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    results.push(`FAIL  ${name} — ${error.message}`);
  }
}

function createAudit(actorUid, action, target, details = {}) {
  return addDoc(collection(db, 'audit'), {
    ts: serverTimestamp(), actorUid, actorRole: 'admin', action, target, details,
  });
}

await step('admin sign-in + admin claim', async () => {
  const cred = await signInWithEmailAndPassword(auth, 'admin.scc@gmail.com', 'admin123456');
  const token = await cred.user.getIdTokenResult(true);
  if (token.claims.admin !== true) throw new Error(`claim missing: ${JSON.stringify(token.claims)}`);
  return `uid ${cred.user.uid.slice(0, 8)}…`;
});
const uid = auth.currentUser?.uid ?? '';

await step('lifecycle: open voting (status draft→open)', async () => {
  await updateDoc(doc(db, 'elections', ELECTION_ID), { status: 'open', updatedAt: serverTimestamp() });
  await createAudit(uid, 'election.status.set', `elections/${ELECTION_ID}`, { status: 'open' });
});

await step('lifecycle: toggle registration', async () => {
  await updateDoc(doc(db, 'elections', ELECTION_ID), { registrationOpen: false, updatedAt: serverTimestamp() });
  await createAudit(uid, 'election.registration.set', `elections/${ELECTION_ID}`, { registrationOpen: false });
  await updateDoc(doc(db, 'elections', ELECTION_ID), { registrationOpen: true, updatedAt: serverTimestamp() });
});

let candidateId = '';
await step('candidate: create (saveCandidate shape)', async () => {
  const candidateRef = doc(collection(db, 'candidates'));
  await setDoc(candidateRef, {
    electionId: ELECTION_ID, positionId: 'president', name: 'Smoke Test Candidate',
    section: 'BSCS-4A', yearLevel: 4, platform: 'Automated smoke test platform.',
    goals: null, bio: null, party: null, order: 99, active: true,
    photoURL: '', photoPath: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  await createAudit(uid, 'candidate.create', `candidates/${candidateRef.id}`, { positionId: 'president' });
  candidateId = candidateRef.id;
  return candidateRef.id.slice(0, 8) + '…';
});

await step('candidate: deactivate (Active checkbox path)', async () => {
  await updateDoc(doc(db, 'candidates', candidateId), { active: false, updatedAt: serverTimestamp() });
  await createAudit(uid, 'candidate.active.set', `candidates/${candidateId}`, { active: false });
});

await step('candidates: admin list query (loadCandidates shape)', async () => {
  const snap = await getDocs(query(collection(db, 'candidates'), where('electionId', '==', ELECTION_ID), orderBy('order', 'asc')));
  if (snap.empty) throw new Error('no candidates returned');
  return `${snap.size} candidate(s)`;
});

await step('audit: watchAudit query (orderBy ts desc, limit 20)', async () => {
  const snap = await getDocs(query(collection(db, 'audit'), orderBy('ts', 'desc'), limit(20)));
  if (snap.empty) throw new Error('no audit entries returned');
  const first = snap.docs[0].data();
  if (!first.action || !first.actorUid) throw new Error('audit entry missing fields');
  return `${snap.size} entries, latest: ${first.action}`;
});

await step('candidate: delete (ConfirmDialog→removeCandidate path)', async () => {
  await deleteDoc(doc(db, 'candidates', candidateId));
  await createAudit(uid, 'candidate.delete', `candidates/${candidateId}`, {});
});

await step('lifecycle: close polls (status open→closed)', async () => {
  await updateDoc(doc(db, 'elections', ELECTION_ID), { status: 'closed', updatedAt: serverTimestamp() });
  await createAudit(uid, 'election.status.set', `elections/${ELECTION_ID}`, { status: 'closed' });
});

await step('lifecycle: publish results (tallies + status published)', async () => {
  await setDoc(doc(db, 'tallies', ELECTION_ID), {
    perCandidate: {}, perPosition: {}, turnout: { total: 0, byYear: { 1: 0, 2: 0, 3: 0, 4: 0 } }, updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'elections', ELECTION_ID), { status: 'published', updatedAt: serverTimestamp() });
  await createAudit(uid, 'election.publish', `elections/${ELECTION_ID}`, { voteDocs: 0, turnout: 0 });
});

await step('audit immutability: update must be denied', async () => {
  const snap = await getDocs(query(collection(db, 'audit'), orderBy('ts', 'desc'), limit(1)));
  try {
    await updateDoc(snap.docs[0].ref, { action: 'tampered' });
    throw new Error('rules allowed tampering with an audit record!');
  } catch (error) {
    if (!/permission|insufficient/i.test(error.message)) throw error;
    return 'correctly rejected';
  }
});

await step('reset election to draft for future runs', async () => {
  await updateDoc(doc(db, 'elections', ELECTION_ID), { status: 'draft', updatedAt: serverTimestamp() });
});

console.log('\n===== ADMIN SMOKE RESULTS =====');
for (const line of results) console.log(line);
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
