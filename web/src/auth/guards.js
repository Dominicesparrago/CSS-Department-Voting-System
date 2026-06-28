import { ELECTION_ID } from "../lib/constants.js";
import { hasAdminClaim, hasVotedInElection, isStudentSession } from "./guards-core.js";
import { watchSession } from "./session.js";

export function requireStudentRoute({ onAllowed, onAlreadyVoted, onDenied }) {
  return watchSession((session) => {
    if (!session.user) {
      onDenied?.("Please sign in before opening the voting page.");
      return;
    }

    if (!isStudentSession(session)) {
      onDenied?.("No voter profile was found for this account.");
      return;
    }

    if (hasVotedInElection(session.voterProfile, ELECTION_ID)) {
      onAlreadyVoted?.(session);
      return;
    }

    onAllowed?.(session);
  });
}

export function requireAdminRoute({ onAllowed, onDenied }) {
  return watchSession((session) => {
    if (!session.user) {
      onDenied?.("Please sign in with an admin account.");
      return;
    }

    if (!hasAdminClaim(session.claims)) {
      onDenied?.("This account does not have admin access.");
      return;
    }

    onAllowed?.(session);
  });
}

