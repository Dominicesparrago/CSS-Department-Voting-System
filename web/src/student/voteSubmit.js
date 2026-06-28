import {
  doc,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "../firebase/init.js";
import { ELECTION_ID } from "../lib/constants.js";
import { isBallotComplete } from "./ballotState.js";

export function voteDocId(electionId, uid, positionId) {
  return `${electionId}__${uid}__${positionId}`;
}

export async function submitCompleteBallot({ user, voterProfile, election, requiredPositions, selections }) {
  if (election.status !== "open") {
    throw new Error("Voting is not open for this election.");
  }

  if (!isBallotComplete(requiredPositions, selections)) {
    throw new Error("Complete every race before submitting.");
  }

  const batch = writeBatch(db);
  const createdAt = serverTimestamp();

  requiredPositions.forEach((position) => {
    batch.set(doc(db, "votes", voteDocId(election.id || ELECTION_ID, user.uid, position.id)), {
      electionId: election.id || ELECTION_ID,
      uid: user.uid,
      positionId: position.id,
      candidateId: selections[position.id],
      yearLevel: voterProfile.yearLevel,
      createdAt
    });
  });

  batch.update(doc(db, "voters", user.uid), {
    [`hasVoted.${election.id || ELECTION_ID}`]: true,
    [`votedAt.${election.id || ELECTION_ID}`]: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await batch.commit();
}

