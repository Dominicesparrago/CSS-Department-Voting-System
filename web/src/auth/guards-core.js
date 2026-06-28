export function hasAdminClaim(claims = {}) {
  return claims.admin === true || claims.role === "admin";
}

export function hasVotedInElection(voterProfile, electionId) {
  return voterProfile?.hasVoted?.[electionId] === true;
}

export function isStudentSession(session) {
  return Boolean(session?.user && session?.voterProfile);
}

