import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getDownloadURL,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { db, storage } from "../firebase/init.js";
import { ELECTION_ID } from "../lib/constants.js";
import { buildTallies } from "./adminCore.js";

const MAX_CANDIDATE_IMAGE_BYTES = 2 * 1024 * 1024;

function snapshotRecords(snapshot) {
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data()
  }));
}

export async function loadElection(electionId = ELECTION_ID) {
  const snapshot = await getDoc(doc(db, "elections", electionId));
  if (!snapshot.exists()) {
    throw new Error("Election was not found.");
  }

  return {
    id: snapshot.id,
    ...snapshot.data()
  };
}

export async function loadPositions() {
  const snapshot = await getDocs(query(collection(db, "positions"), orderBy("order", "asc")));
  return snapshotRecords(snapshot);
}

export async function loadCandidates() {
  const snapshot = await getDocs(query(collection(db, "candidates"), orderBy("order", "asc")));
  return snapshotRecords(snapshot);
}

export async function loadVoters() {
  const snapshot = await getDocs(query(collection(db, "voters"), orderBy("fullName", "asc")));
  return snapshotRecords(snapshot);
}

export function watchVotes(onChange, onError) {
  return onSnapshot(
    query(collection(db, "votes"), orderBy("createdAt", "asc")),
    (snapshot) => onChange(snapshotRecords(snapshot)),
    onError
  );
}

export async function loadVotes() {
  const snapshot = await getDocs(query(collection(db, "votes"), orderBy("createdAt", "asc")));
  return snapshotRecords(snapshot);
}

export function watchElection(onChange, onError, electionId = ELECTION_ID) {
  return onSnapshot(
    doc(db, "elections", electionId),
    (snapshot) => {
      if (snapshot.exists()) {
        onChange({ id: snapshot.id, ...snapshot.data() });
      }
    },
    onError
  );
}

export function validateCandidatePhoto(file) {
  if (!file) {
    return "";
  }

  if (!file.type.startsWith("image/")) {
    return "Upload an image file.";
  }

  if (file.size > MAX_CANDIDATE_IMAGE_BYTES) {
    return "Image must be 2MB or smaller.";
  }

  return "";
}

async function uploadCandidatePhoto(candidateId, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const photoPath = `candidates/${candidateId}-${Date.now()}-${safeName}`;
  const photoRef = ref(storage, photoPath);
  await uploadBytes(photoRef, file, { contentType: file.type });
  return {
    photoPath,
    photoURL: await getDownloadURL(photoRef)
  };
}

export async function saveCandidate({ candidate, photoFile, actorUid }) {
  const photoError = validateCandidatePhoto(photoFile);
  if (photoError) {
    throw new Error(photoError);
  }

  const candidateRef = candidate.id
    ? doc(db, "candidates", candidate.id)
    : doc(collection(db, "candidates"));

  const photoFields = photoFile
    ? await uploadCandidatePhoto(candidateRef.id, photoFile)
    : {};

  const payload = {
    electionId: ELECTION_ID,
    positionId: candidate.positionId,
    name: candidate.name.trim(),
    section: candidate.section.trim(),
    yearLevel: Number(candidate.yearLevel),
    platform: candidate.platform.trim(),
    goals: candidate.goals?.trim() || null,
    bio: candidate.bio?.trim() || null,
    party: candidate.party?.trim() || null,
    order: Number(candidate.order),
    active: candidate.active === true,
    ...photoFields,
    updatedAt: serverTimestamp()
  };

  if (candidate.id) {
    await updateDoc(candidateRef, payload);
    await createAudit(actorUid, "candidate.update", `candidates/${candidateRef.id}`, {
      positionId: payload.positionId,
      active: payload.active
    });
  } else {
    await setDoc(candidateRef, {
      ...payload,
      photoURL: payload.photoURL || "",
      photoPath: payload.photoPath || "",
      createdAt: serverTimestamp()
    });
    await createAudit(actorUid, "candidate.create", `candidates/${candidateRef.id}`, {
      positionId: payload.positionId
    });
  }

  return candidateRef.id;
}

export async function setCandidateActive(candidateId, active, actorUid) {
  await updateDoc(doc(db, "candidates", candidateId), {
    active,
    updatedAt: serverTimestamp()
  });
  await createAudit(actorUid, "candidate.active.set", `candidates/${candidateId}`, { active });
}

export async function setVoterEligibility(uid, eligible, actorUid) {
  await updateDoc(doc(db, "voters", uid), {
    eligible,
    updatedAt: serverTimestamp()
  });
  await createAudit(actorUid, "voter.eligible.set", `voters/${uid}`, { eligible });
}

export async function setElectionStatus(status, actorUid, electionId = ELECTION_ID) {
  await updateDoc(doc(db, "elections", electionId), {
    status,
    updatedAt: serverTimestamp()
  });
  await createAudit(actorUid, "election.status.set", `elections/${electionId}`, { status });
}

export async function publishElection({ actorUid, electionId = ELECTION_ID }) {
  const electionSnapshot = await getDoc(doc(db, "elections", electionId));
  const election = electionSnapshot.exists() ? electionSnapshot.data() : null;
  if (election?.status !== "closed") {
    throw new Error("Close the election before publishing results.");
  }

  const freshVotes = await loadVotes();
  const tallies = buildTallies(electionId, freshVotes);

  await setDoc(doc(db, "tallies", electionId), {
    ...tallies,
    updatedAt: serverTimestamp()
  });
  await updateDoc(doc(db, "elections", electionId), {
    status: "published",
    updatedAt: serverTimestamp()
  });
  await createAudit(actorUid, "election.publish", `elections/${electionId}`, {
    voteDocs: freshVotes.filter((vote) => vote.electionId === electionId).length,
    turnout: tallies.turnout.total
  });

  return tallies;
}

export async function createAudit(actorUid, action, target, details = {}) {
  await addDoc(collection(db, "audit"), {
    ts: serverTimestamp(),
    actorUid,
    actorRole: "admin",
    action,
    target,
    details
  });
}
