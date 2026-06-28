import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "../firebase/init.js";
import { ELECTION_ID } from "../lib/constants.js";
import { requiredPositionsForVoter } from "./ballotState.js";

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

export async function loadRequiredPositions(yearLevel) {
  const snapshot = await getDocs(query(collection(db, "positions"), orderBy("order", "asc")));
  const positions = snapshot.docs.map((positionDoc) => ({
    id: positionDoc.id,
    ...positionDoc.data()
  }));

  return requiredPositionsForVoter(positions, yearLevel);
}

export async function loadCandidatesForPositions(positions, electionId = ELECTION_ID) {
  const entries = await Promise.all(
    positions.map(async (position) => {
      const snapshot = await getDocs(
        query(
          collection(db, "candidates"),
          where("electionId", "==", electionId),
          where("positionId", "==", position.id),
          where("active", "==", true),
          orderBy("order", "asc")
        )
      );

      return [
        position.id,
        snapshot.docs.map((candidateDoc) => ({
          id: candidateDoc.id,
          ...candidateDoc.data()
        }))
      ];
    })
  );

  return Object.fromEntries(entries);
}

