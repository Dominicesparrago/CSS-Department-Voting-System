'use strict';

// Pure ballot-shaping/validation logic, shared by the callable and its unit tests.
// Mirrors voting-app/lib/student/ballotState.ts so the server is the source of truth.

/** Department races plus only the voter's own year representative, in ballot order. */
function requiredPositionsForVoter(positions, yearLevel) {
  return positions
    .filter((p) => p.scope === 'department' || (p.scope === 'year' && p.yearLevel === yearLevel))
    .sort((a, b) => a.order - b.order);
}

/**
 * Validate a submitted selections map against the voter's required races and the
 * live candidate set. Returns { ok: true, ballots } or { ok: false, code, message }.
 *
 * `candidatesById` maps candidateId -> { electionId, positionId, active, yearLevel }.
 * A valid ballot may leave any required race blank, including all races, but
 * every submitted selection must be an active candidate for its race.
 */
function validateBallot({ positions, yearLevel, selections, candidatesById, electionId }) {
  const required = requiredPositionsForVoter(positions, yearLevel);
  if (required.length === 0) {
    return { ok: false, code: 'failed-precondition', message: 'No ballot is configured for your year level.' };
  }

  const selectedPositionIds = Object.keys(selections || {});
  const requiredIds = new Set(required.map((p) => p.id));

  for (const posId of selectedPositionIds) {
    if (!requiredIds.has(posId)) {
      return { ok: false, code: 'invalid-argument', message: `Position ${posId} is not on your ballot.` };
    }
  }

  const ballots = [];
  for (const position of required) {
    const candidateId = selections?.[position.id];
    if (!candidateId) continue;
    const candidate = candidatesById[candidateId];
    if (!candidate) {
      return { ok: false, code: 'invalid-argument', message: 'A selected candidate does not exist.' };
    }
    if (candidate.electionId !== electionId || candidate.positionId !== position.id || candidate.active !== true) {
      return { ok: false, code: 'invalid-argument', message: 'A selection is invalid for its race.' };
    }
    ballots.push({ electionId, positionId: position.id, candidateId, yearLevel });
  }

  return { ok: true, ballots };
}

module.exports = { requiredPositionsForVoter, validateBallot };
