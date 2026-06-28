export function requiredPositionsForVoter(positions, yearLevel) {
  return positions
    .filter((position) => {
      if (position.scope === "department") {
        return true;
      }

      return position.scope === "year" && position.yearLevel === yearLevel;
    })
    .sort((a, b) => a.order - b.order);
}

export function unansweredPositions(requiredPositions, selections) {
  return requiredPositions.filter((position) => !selections[position.id]);
}

export function isBallotComplete(requiredPositions, selections) {
  return requiredPositions.length > 0 && unansweredPositions(requiredPositions, selections).length === 0;
}

export function selectedCandidatesByPosition(requiredPositions, candidatesByPosition, selections) {
  return requiredPositions.map((position) => ({
    position,
    candidate: (candidatesByPosition[position.id] || []).find(
      (candidate) => candidate.id === selections[position.id]
    )
  }));
}

