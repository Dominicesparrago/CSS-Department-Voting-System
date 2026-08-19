import type { AuditEntry, Candidate, Position, Voter } from '../types';
import { candidatesForPosition } from '../election/candidates';
import { formatTimestamp, percent, toMillis } from '../format';

export function byId<T extends { id: string }>(records: T[]): Record<string, T> {
  return Object.fromEntries(records.map((r) => [r.id, r]));
}

/** Per-candidate / per-position counts, computed server-side by the getResults function. */
export interface ResultsCounts {
  perCandidate: Record<string, number>;
  perPosition: Record<string, number>;
}

export interface Aggregate {
  candidatesById: Record<string, Candidate>;
  positionsById: Record<string, Position>;
  votersById: Record<string, Voter>;
  perCandidate: Record<string, number>;
  perPosition: Record<string, number>;
  turnout: { total: number; byYear: Record<string, number> };
  eligible: { total: number; byYear: Record<string, number> };
}

function hasVoted(voter: Voter, electionId: string): boolean {
  return voter.hasVoted?.[electionId] === true;
}

/**
 * Combine anonymous per-candidate/per-position counts (from the trusted
 * getResults function) with turnout and eligibility derived from the voter
 * registry. Ballots themselves are never read by the client, so turnout comes
 * from the participation lock (`hasVoted`), never from ballot documents.
 */
export function buildAggregate(params: {
  results: ResultsCounts;
  candidates: Candidate[];
  positions: Position[];
  voters: Voter[];
  electionId: string;
}): Aggregate {
  const { results, candidates, positions, voters, electionId } = params;

  const turnoutByYear: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0 };
  const eligibleByYear: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0 };
  let turnoutTotal = 0;

  voters.forEach((voter) => {
    const year = Number(voter.yearLevel);
    const inRange = year >= 1 && year <= 4;
    if (voter.eligible && inRange) eligibleByYear[String(year)] += 1;
    if (hasVoted(voter, electionId)) {
      turnoutTotal += 1;
      if (inRange) turnoutByYear[String(year)] += 1;
    }
  });

  return {
    candidatesById: byId(candidates),
    positionsById: byId(positions),
    votersById: byId(voters),
    perCandidate: results.perCandidate,
    perPosition: results.perPosition,
    turnout: { total: turnoutTotal, byYear: turnoutByYear },
    eligible: { total: voters.filter((v) => v.eligible).length, byYear: eligibleByYear },
  };
}

/**
 * Cumulative turnout over time, derived from the participation lock. Each point
 * marks the moment a voter's ballot was recorded (`votedAt`), so the running
 * count equals unique voters so far — with no dependency on ballot contents.
 */
export function cumulativeTurnoutFromVoters(voters: Voter[], electionId: string): { t: number; count: number }[] {
  const stamped = voters
    .filter((voter) => hasVoted(voter, electionId))
    .map((voter) => toMillis(voter.votedAt?.[electionId]))
    .filter((t) => t > 0)
    .sort((a, b) => a - b);
  return stamped.map((t, i) => ({ t, count: i + 1 }));
}

export function rankedCandidatesForPosition(
  candidates: Candidate[],
  aggregate: Aggregate,
  positionId: string,
): (Candidate & { votes: number })[] {
  return candidatesForPosition(candidates, positionId)
    .map((c) => ({ ...c, votes: aggregate.perCandidate[c.id] ?? 0 }))
    .sort((a, b) => b.votes - a.votes || (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
}

export interface PositionVoteRow {
  candidate: Candidate;
  votes: number;
  share: number;
}

export function positionVoteRows(
  candidates: Candidate[],
  aggregate: Aggregate,
  positionId: string,
): { rows: PositionVoteRow[]; total: number } {
  const total = aggregate.perPosition[positionId] ?? 0;
  const rows = rankedCandidatesForPosition(candidates, aggregate, positionId).map((candidate) => ({
    candidate,
    votes: candidate.votes,
    share: percent(candidate.votes, total),
  }));
  return { rows, total };
}

export function currentWinner(rows: PositionVoteRow[]): { kind: 'none' | 'winner' | 'tie'; label: string; leaders: PositionVoteRow[] } {
  if (rows.length === 0) {
    return { kind: 'none', label: 'No candidates available', leaders: [] };
  }

  const topVotes = Math.max(0, ...rows.map((row) => row.votes));
  if (topVotes <= 0) {
    return { kind: 'none', label: 'No votes yet', leaders: [] };
  }

  const leaders = rows.filter((row) => row.votes === topVotes);
  if (leaders.length === 1) {
    return { kind: 'winner', label: leaders[0].candidate.name, leaders };
  }

  return {
    kind: 'tie',
    label: `${leaders.map((row) => row.candidate.name).join(', ')} tied`,
    leaders,
  };
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/** Anonymized results export: candidate vote counts, no per-ballot data. */
export function resultsToCsv(params: {
  results: ResultsCounts;
  candidates: Candidate[];
  positions: Position[];
}): string {
  const { results, candidates, positions } = params;
  const positionsById = byId(positions);
  const header = ['positionId', 'position', 'candidateId', 'candidate', 'votes'];
  const rows = candidates.map((candidate) => [
    candidate.positionId,
    positionsById[candidate.positionId]?.name ?? candidate.positionId,
    candidate.id,
    candidate.name,
    results.perCandidate[candidate.id] ?? 0,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function votersToCsv(voters: Voter[], electionId: string): string {
  const header = ['fullName', 'studentNo', 'email', 'yearLevel', 'section', 'eligible', 'status'];
  const rows = voters.map((voter) => [
    voter.fullName,
    voter.studentNo ?? '',
    voter.email,
    voter.yearLevel,
    voter.section,
    voter.eligible ? 'yes' : 'no',
    hasVoted(voter, electionId) ? 'voted' : 'not yet',
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

/** Audit trail export: every privileged action with actor, target, and details. */
export function auditToCsv(entries: AuditEntry[]): string {
  const header = ['ts', 'actorUid', 'actorRole', 'action', 'target', 'details'];
  const rows = entries.map((entry) => [
    formatTimestamp(entry.ts),
    entry.actorUid,
    entry.actorRole ?? '',
    entry.action,
    entry.target,
    entry.details ? JSON.stringify(entry.details) : '',
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}
