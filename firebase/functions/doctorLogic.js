'use strict';

const { DEFAULT_ELECTION_ID } = require('./constants');

/**
 * Database Doctor integrity checks (pure — no I/O). The Cloud Function feeds
 * raw collection data in; this module returns a structured report plus the
 * list of safe, confirmed-only repair actions. A scan never modifies data.
 */

const VALID_STATUSES = ['draft', 'open', 'closed', 'published', 'finalized', 'archived'];
const STUDENT_NO_PATTERN = /^[0-9]{7,9}$/;
const STUDENT_EMAIL_PATTERN = /^[a-z0-9._-]+\.scc@gmail\.com$/;

function ok(code, message) {
  return { code, status: 'ok', count: 0, message, ids: [] };
}

function warn(code, message, ids) {
  return { code, status: 'warn', count: ids.length, message, ids };
}

function error(code, message, ids) {
  return { code, status: 'error', count: ids.length, message, ids };
}

function sameCountMap(a, b) {
  const keysA = Object.keys(a || {});
  const keysB = Object.keys(b || {});
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if ((a[key] || 0) !== (b[key] || 0)) return false;
  }
  return true;
}

function runIntegrityChecks({ voters, students, studentIndex, emailIndex, candidates, ballots, positions, elections, tallies }) {
  const votersList = voters || [];
  const studentsList = students || [];
  const studentIndexList = studentIndex || [];
  const emailIndexList = emailIndex || [];
  const candidatesList = candidates || [];
  const ballotsList = ballots || [];
  const positionsList = positions || [];
  const electionsList = elections || [];
  const talliesList = tallies || [];
  const checks = [];

  // Duplicate student numbers among voters.
  const voterNoSeen = new Map();
  const dupVoterIds = new Set();
  for (const v of votersList) {
    const no = v.data.studentNo;
    if (!no) continue;
    if (voterNoSeen.has(no)) {
      dupVoterIds.add(v.id);
      dupVoterIds.add(voterNoSeen.get(no));
    } else {
      voterNoSeen.set(no, v.id);
    }
  }
  if (dupVoterIds.size > 0) {
    checks.push(error('duplicate_voter_student_no', `Duplicate student number(s) on ${dupVoterIds.size} voter record(s).`, [...dupVoterIds]));
  } else {
    checks.push(ok('duplicate_voter_student_no', 'No duplicate student numbers among voters.'));
  }

  // Duplicate student numbers on the official roster.
  const rosterNoSeen = new Map();
  const dupRosterIds = new Set();
  for (const s of studentsList) {
    const no = s.data.studentNo;
    if (!no) continue;
    if (rosterNoSeen.has(no)) {
      dupRosterIds.add(s.id);
      dupRosterIds.add(rosterNoSeen.get(no));
    } else {
      rosterNoSeen.set(no, s.id);
    }
  }
  if (dupRosterIds.size > 0) {
    checks.push(error('duplicate_roster_student_no', `Duplicate student number(s) on ${dupRosterIds.size} roster record(s).`, [...dupRosterIds]));
  } else {
    checks.push(ok('duplicate_roster_student_no', 'No duplicate student numbers on the roster.'));
  }

  // Orphaned index records (studentIndex / emailIndex pointing at a missing voter).
  const voterIds = new Set(votersList.map((v) => v.id));
  const orphanStudentIndex = studentIndexList.filter((s) => !voterIds.has(s.data.uid)).map((s) => s.id);
  if (orphanStudentIndex.length > 0) {
    checks.push(warn('orphan_student_index', `${orphanStudentIndex.length} studentIndex record(s) reference a missing voter.`, orphanStudentIndex));
  } else {
    checks.push(ok('orphan_student_index', 'No orphaned student index records.'));
  }

  const orphanEmailIndex = emailIndexList.filter((s) => !voterIds.has(s.data.uid)).map((s) => s.id);
  if (orphanEmailIndex.length > 0) {
    checks.push(warn('orphan_email_index', `${orphanEmailIndex.length} emailIndex record(s) reference a missing voter.`, orphanEmailIndex));
  } else {
    checks.push(ok('orphan_email_index', 'No orphaned email index records.'));
  }

  // Candidate reference integrity.
  const electionIds = new Set(electionsList.map((e) => e.id));
  const positionIds = new Set(positionsList.map((p) => p.id));
  const missingElectionCandidates = candidatesList.filter((c) => !electionIds.has(c.data.electionId)).map((c) => c.id);
  if (missingElectionCandidates.length > 0) {
    checks.push(error('candidate_missing_election', `${missingElectionCandidates.length} candidate(s) reference a missing election.`, missingElectionCandidates));
  } else {
    checks.push(ok('candidate_missing_election', 'All candidates reference an existing election.'));
  }

  const missingPositionCandidates = candidatesList.filter((c) => !positionIds.has(c.data.positionId)).map((c) => c.id);
  if (missingPositionCandidates.length > 0) {
    checks.push(error('candidate_missing_position', `${missingPositionCandidates.length} candidate(s) reference a missing position.`, missingPositionCandidates));
  } else {
    checks.push(ok('candidate_missing_position', 'All candidates reference an existing position.'));
  }

  const unnamedCandidates = candidatesList.filter((c) => !c.data.name || String(c.data.name).trim().length < 2).map((c) => c.id);
  if (unnamedCandidates.length > 0) {
    checks.push(error('candidate_missing_name', `${unnamedCandidates.length} candidate(s) are missing a valid name.`, unnamedCandidates));
  } else {
    checks.push(ok('candidate_missing_name', 'All candidates have a valid name.'));
  }

  // Ballot reference integrity (anonymous ballots still carry refs to validate).
  const candidateById = new Map(candidatesList.map((c) => [c.id, c]));
  const badBallotCandidates = ballotsList.filter((b) => !candidateById.has(b.data.candidateId)).map((b) => b.id);
  if (badBallotCandidates.length > 0) {
    checks.push(error('ballot_missing_candidate', `${badBallotCandidates.length} ballot(s) reference a missing candidate.`, badBallotCandidates));
  } else {
    checks.push(ok('ballot_missing_candidate', 'All ballots reference an existing candidate.'));
  }

  const badBallotPositions = ballotsList.filter((b) => !positionIds.has(b.data.positionId)).map((b) => b.id);
  if (badBallotPositions.length > 0) {
    checks.push(error('ballot_missing_position', `${badBallotPositions.length} ballot(s) reference a missing position.`, badBallotPositions));
  } else {
    checks.push(ok('ballot_missing_position', 'All ballots reference an existing position.'));
  }

  const badBallotElections = ballotsList.filter((b) => !electionIds.has(b.data.electionId)).map((b) => b.id);
  if (badBallotElections.length > 0) {
    checks.push(error('ballot_missing_election', `${badBallotElections.length} ballot(s) reference a missing election.`, badBallotElections));
  } else {
    checks.push(ok('ballot_missing_election', 'All ballots reference an existing election.'));
  }

  // Voter field validity.
  const invalidVoters = votersList.filter((v) => {
    const d = v.data;
    if (!(d.yearLevel === 1 || d.yearLevel === 2 || d.yearLevel === 3 || d.yearLevel === 4)) return true;
    if (typeof d.section !== 'string' || !d.section.trim()) return true;
    if (d.studentNo && typeof d.studentNo === 'string' && !STUDENT_NO_PATTERN.test(d.studentNo)) return true;
    return false;
  }).map((v) => v.id);
  if (invalidVoters.length > 0) {
    checks.push(warn('voter_invalid_fields', `${invalidVoters.length} voter record(s) have invalid year level, section, or student number fields.`, invalidVoters));
  } else {
    checks.push(ok('voter_invalid_fields', 'All voter records have valid identity fields.'));
  }

  // Roster field validity.
  const invalidStudents = studentsList.filter((s) => {
    const d = s.data;
    if (!(d.yearLevel === 1 || d.yearLevel === 2 || d.yearLevel === 3 || d.yearLevel === 4)) return true;
    if (d.status !== 'active' && d.status !== 'inactive') return true;
    if (typeof d.eligible !== 'boolean') return true;
    return false;
  }).map((s) => s.id);
  if (invalidStudents.length > 0) {
    checks.push(warn('student_invalid_fields', `${invalidStudents.length} roster record(s) have invalid year level, status, or eligibility fields.`, invalidStudents));
  } else {
    checks.push(ok('student_invalid_fields', 'All roster records have valid fields.'));
  }

  // Tally consistency (recompute from immutable ballots).
  const tallyByElection = new Map(talliesList.map((t) => [t.id, t]));
  const inconsistentTallies = [];
  for (const election of electionsList) {
    const tally = tallyByElection.get(election.id);
    if (!tally) continue;
    const ballotsFor = ballotsList.filter((b) => b.data.electionId === election.id);
    const perCandidate = {};
    const perPosition = {};
    ballotsFor.forEach((b) => {
      perCandidate[b.data.candidateId] = (perCandidate[b.data.candidateId] || 0) + 1;
      perPosition[b.data.positionId] = (perPosition[b.data.positionId] || 0) + 1;
    });
    if (!sameCountMap(tally.data.perCandidate, perCandidate) || !sameCountMap(tally.data.perPosition, perPosition)) {
      inconsistentTallies.push(election.id);
    }
  }
  if (inconsistentTallies.length > 0) {
    checks.push(error('tally_inconsistent', `${inconsistentTallies.length} tally document(s) do not match the ballots they aggregate.`, inconsistentTallies));
  } else {
    checks.push(ok('tally_inconsistent', 'All tallies are consistent with the ballots.'));
  }

  // Status combinations.
  const unknownStatuses = electionsList.filter((e) => !VALID_STATUSES.includes(e.data.status)).map((e) => e.id);
  if (unknownStatuses.length > 0) {
    checks.push(error('election_invalid_status', `${unknownStatuses.length} election(s) have an unknown status.`, unknownStatuses));
  } else {
    checks.push(ok('election_invalid_status', 'All elections have a valid status.'));
  }

  const resultStatuses = new Set(['published', 'finalized', 'archived']);
  const resultsWithoutTally = electionsList.filter((e) => resultStatuses.has(e.data.status) && !tallyByElection.has(e.id)).map((e) => e.id);
  if (resultsWithoutTally.length > 0) {
    checks.push(error('election_missing_tally', `${resultsWithoutTally.length} election(s) are published/finalized but have no tally document.`, resultsWithoutTally));
  } else {
    checks.push(ok('election_missing_tally', 'Every results-bearing election has a tally document.'));
  }

  const finalizedWithoutTimestamp = electionsList.filter((e) => e.data.status === 'finalized' && !e.data.finalizedAt).map((e) => e.id);
  if (finalizedWithoutTimestamp.length > 0) {
    checks.push(warn('election_finalized_without_timestamp', `${finalizedWithoutTimestamp.length} finalized election(s) are missing a finalization timestamp.`, finalizedWithoutTimestamp));
  } else {
    checks.push(ok('election_finalized_without_timestamp', 'All finalized elections carry a finalization timestamp.'));
  }

  return checks;
}

function buildReport(checks) {
  const hasIssues = checks.some((c) => c.status === 'error' || c.status === 'warn');
  return { status: hasIssues ? 'issues' : 'healthy', checks };
}

/** Safe, confirmed-only repair actions derived from the scan report. */
function repairsFromChecks(checks, defaultElectionId = DEFAULT_ELECTION_ID) {
  const actions = [];
  const find = (code) => checks.find((c) => c.code === code);
  const orphanStudent = find('orphan_student_index');
  if (orphanStudent && orphanStudent.status !== 'ok' && orphanStudent.ids.length > 0) {
    actions.push({
      code: 'delete_orphan_student_index',
      label: `Delete ${orphanStudent.ids.length} orphaned student index record(s)`,
      affected: orphanStudent.ids.length,
      ids: orphanStudent.ids,
      description: 'Removes studentIndex documents that point to a missing voter.',
    });
  }
  const orphanEmail = find('orphan_email_index');
  if (orphanEmail && orphanEmail.status !== 'ok' && orphanEmail.ids.length > 0) {
    actions.push({
      code: 'delete_orphan_email_index',
      label: `Delete ${orphanEmail.ids.length} orphaned email index record(s)`,
      affected: orphanEmail.ids.length,
      ids: orphanEmail.ids,
      description: 'Removes emailIndex documents that point to a missing voter.',
    });
  }
  const inconsistent = find('tally_inconsistent');
  if (inconsistent && inconsistent.status !== 'ok' && inconsistent.ids.length > 0) {
    actions.push({
      code: 'recompute_tally',
      label: `Recompute ${inconsistent.ids.length} tally document(s) from ballots`,
      affected: inconsistent.ids.length,
      ids: inconsistent.ids,
      description: 'Rebuilds the tally for each listed election from its immutable ballots.',
    });
  }
  const missingElection = find('candidate_missing_election');
  if (missingElection && missingElection.status !== 'ok' && missingElection.ids.length > 0) {
    actions.push({
      code: 'set_candidate_election',
      label: `Assign ${missingElection.ids.length} candidate(s) to the current election`,
      affected: missingElection.ids.length,
      ids: missingElection.ids,
      description: `Sets electionId = "${defaultElectionId}" on candidates that reference a missing election.`,
    });
  }
  return actions;
}

module.exports = { runIntegrityChecks, buildReport, repairsFromChecks };
