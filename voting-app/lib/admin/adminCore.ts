import type { Candidate, Position, Vote, Voter } from '../types';
import { candidatesForPosition } from '../election/candidates';
import { formatTimestamp, toMillis } from '../format';

export function byId<T extends { id: string }>(records: T[]): Record<string, T> {
  return Object.fromEntries(records.map((r) => [r.id, r]));
}

export interface Aggregate {
  candidatesById: Record<string, Candidate>;
  positionsById: Record<string, Position>;
  votersById: Record<string, Voter>;
  perCandidate: Record<string, number>;
  perPosition: Record<string, number>;
  byPositionCandidate: Record<string, Record<string, number>>;
  turnout: { total: number; byYear: Record<string, number> };
  eligible: { total: number; byYear: Record<string, number> };
  voteDocTotal: number;
}

export function aggregateVotes(params: {
  votes: Vote[];
  candidates: Candidate[];
  positions: Position[];
  voters: Voter[];
}): Aggregate {
  const { votes, candidates, positions, voters } = params;
  const candidatesById = byId(candidates);
  const positionsById = byId(positions);
  const votersById = byId(voters);
  const perCandidate: Record<string, number> = {};
  const perPosition: Record<string, number> = {};
  const byPositionCandidate: Record<string, Record<string, number>> = {};
  const voterYears = new Map<string, number>();

  votes.forEach((vote) => {
    perCandidate[vote.candidateId] = (perCandidate[vote.candidateId] ?? 0) + 1;
    perPosition[vote.positionId] = (perPosition[vote.positionId] ?? 0) + 1;
    byPositionCandidate[vote.positionId] ??= {};
    byPositionCandidate[vote.positionId][vote.candidateId] =
      (byPositionCandidate[vote.positionId][vote.candidateId] ?? 0) + 1;
    if (!voterYears.has(vote.uid)) voterYears.set(vote.uid, Number(vote.yearLevel));
  });

  const turnoutByYear: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0 };
  for (const yr of voterYears.values()) {
    if (yr >= 1 && yr <= 4) turnoutByYear[String(yr)] += 1;
  }

  const eligibleByYear: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0 };
  voters.forEach((voter) => {
    if (voter.eligible && voter.yearLevel >= 1 && voter.yearLevel <= 4)
      eligibleByYear[String(voter.yearLevel)] += 1;
  });

  return {
    candidatesById,
    positionsById,
    votersById,
    perCandidate,
    perPosition,
    byPositionCandidate,
    turnout: { total: voterYears.size, byYear: turnoutByYear },
    eligible: { total: voters.filter((v) => v.eligible).length, byYear: eligibleByYear },
    voteDocTotal: votes.length,
  };
}

/**
 * Cumulative unique-voter turnout over time. Each point marks the moment a new
 * voter cast their first ballot, so the running count === ballots cast so far.
 * Votes arrive ordered by createdAt, but we sort defensively for safety.
 */
export function cumulativeTurnout(votes: Vote[]): { t: number; count: number }[] {
  const ordered = [...votes].sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
  const seen = new Set<string>();
  const points: { t: number; count: number }[] = [];
  for (const vote of ordered) {
    if (seen.has(vote.uid)) continue;
    seen.add(vote.uid);
    points.push({ t: toMillis(vote.createdAt), count: seen.size });
  }
  return points;
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

export function buildTallies(electionId: string, votes: Vote[]) {
  const perCandidate: Record<string, number> = {};
  const perPosition: Record<string, number> = {};
  const voterYears = new Map<string, number>();

  votes
    .filter((v) => v.electionId === electionId)
    .forEach((vote) => {
      perCandidate[vote.candidateId] = (perCandidate[vote.candidateId] ?? 0) + 1;
      perPosition[vote.positionId] = (perPosition[vote.positionId] ?? 0) + 1;
      if (!voterYears.has(vote.uid)) voterYears.set(vote.uid, Number(vote.yearLevel));
    });

  const byYear: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0 };
  for (const yr of voterYears.values()) {
    if (yr >= 1 && yr <= 4) byYear[String(yr)] += 1;
  }

  return { perCandidate, perPosition, turnout: { total: voterYears.size, byYear } };
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function votesToCsv(params: {
  votes: Vote[];
  candidates: Candidate[];
  positions: Position[];
}): string {
  const { votes, candidates, positions } = params;
  const candidatesById = byId(candidates);
  const positionsById = byId(positions);
  const header = ['electionId', 'positionId', 'position', 'candidateId', 'candidate', 'yearLevel', 'createdAt'];
  const rows = votes.map((vote) => [
    vote.electionId,
    vote.positionId,
    positionsById[vote.positionId]?.name ?? vote.positionId,
    vote.candidateId,
    candidatesById[vote.candidateId]?.name ?? vote.candidateId,
    vote.yearLevel,
    formatTimestamp(vote.createdAt),
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
    voter.hasVoted?.[electionId] === true ? 'voted' : 'not yet',
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}
