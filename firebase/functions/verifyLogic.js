'use strict';

/**
 * Pre-finalization result verification checks (pure — no I/O). Mirrors a subset
 * of the Database Doctor plus election-specific gates so the "VERIFY RESULTS →
 * CONFIRM → FINALIZE" flow has a single source of truth.
 */

const COMPLETED_STATUSES = ['closed', 'published', 'finalized'];

function ok(label, detail) {
  return { label, status: 'ok', detail };
}

function fail(label, detail) {
  return { label, status: 'error', detail };
}

function verifyResults({ election, positions, candidates, ballots, tally }) {
  const checks = [];
  const candidatesList = candidates || [];
  const positionsList = positions || [];
  const ballotsList = ballots || [];
  const electionData = election || {};
  const status = electionData.status;

  // 1. Election completed.
  if (COMPLETED_STATUSES.includes(status)) {
    checks.push(ok('Election completed', `Election status is "${status}".`));
  } else {
    checks.push(fail('Election completed', `Election is not completed (status is "${status || 'unknown'}").`));
  }

  // 2. Ballots valid.
  const positionIds = new Set(positionsList.map((p) => p.id));
  const candidateById = new Map(candidatesList.map((c) => [c.id, c]));
  const badBallots = ballotsList.filter(
    (b) => !candidateById.has(b.candidateId) || !positionIds.has(b.positionId),
  );
  if (badBallots.length === 0) {
    checks.push(ok('Ballots valid', `${ballotsList.length} ballot(s) reference valid candidates and positions.`));
  } else {
    checks.push(fail('Ballots valid', `${badBallots.length} ballot(s) reference missing candidates or positions.`));
  }

  // 3. Candidate references valid.
  const badCandidates = candidatesList.filter((c) => !positionIds.has(c.positionId));
  if (badCandidates.length === 0) {
    checks.push(ok('Candidate references valid', `All ${candidatesList.length} candidate(s) reference an existing position.`));
  } else {
    checks.push(fail('Candidate references valid', `${badCandidates.length} candidate(s) reference a missing position.`));
  }

  // 4. Positions valid (the election's ballot references real positions).
  const scopedIds = electionData.positions || [];
  const missingScoped = scopedIds.filter((id) => !positionIds.has(id));
  if (missingScoped.length === 0) {
    checks.push(ok('Positions valid', `Election ballot references ${scopedIds.length} existing position(s).`));
  } else {
    checks.push(fail('Positions valid', `${missingScoped.length} position id(s) on the election ballot do not exist.`));
  }

  // 5. Vote totals consistent (tally vs recomputed ballots).
  if (!tally) {
    checks.push(fail('Vote totals consistent', 'No tally document exists for this election.'));
  } else {
    const perCandidate = {};
    const perPosition = {};
    ballotsList.forEach((b) => {
      perCandidate[b.candidateId] = (perCandidate[b.candidateId] || 0) + 1;
      perPosition[b.positionId] = (perPosition[b.positionId] || 0) + 1;
    });
    const sameMap = (a, b) => {
      const keysA = Object.keys(a || {});
      const keysB = Object.keys(b || {});
      return keysA.length === keysB.length && keysA.every((k) => (a[k] || 0) === (b[k] || 0));
    };
    if (sameMap(tally.perCandidate, perCandidate) && sameMap(tally.perPosition, perPosition)) {
      checks.push(ok('Vote totals consistent', 'The tally matches the immutable ballots exactly.'));
    } else {
      checks.push(fail('Vote totals consistent', 'The tally does not match the immutable ballots — recompute before finalizing.'));
    }
  }

  const hasError = checks.some((c) => c.status === 'error');
  return { ok: !hasError, checks };
}

module.exports = { verifyResults };
