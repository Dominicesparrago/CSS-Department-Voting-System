export function byId(records) {
  return Object.fromEntries(records.map((record) => [record.id, record]));
}

export function formatYearLevel(yearLevel) {
  return yearLevel ? `Year ${yearLevel}` : "Department";
}

export function formatTimestamp(value) {
  if (!value) {
    return "";
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  }

  if (value instanceof Date) {
    return value.toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  }

  return String(value);
}

export function aggregateVotes({ votes, candidates, positions, voters }) {
  const candidatesById = byId(candidates);
  const positionsById = byId(positions);
  const votersById = byId(voters);
  const perCandidate = {};
  const perPosition = {};
  const byPositionCandidate = {};
  const voterYears = new Map();

  votes.forEach((vote) => {
    perCandidate[vote.candidateId] = (perCandidate[vote.candidateId] || 0) + 1;
    perPosition[vote.positionId] = (perPosition[vote.positionId] || 0) + 1;
    byPositionCandidate[vote.positionId] ||= {};
    byPositionCandidate[vote.positionId][vote.candidateId] =
      (byPositionCandidate[vote.positionId][vote.candidateId] || 0) + 1;

    if (!voterYears.has(vote.uid)) {
      voterYears.set(vote.uid, Number(vote.yearLevel));
    }
  });

  const turnoutByYear = { "1": 0, "2": 0, "3": 0, "4": 0 };
  for (const yearLevel of voterYears.values()) {
    if (yearLevel >= 1 && yearLevel <= 4) {
      turnoutByYear[String(yearLevel)] += 1;
    }
  }

  const eligibleByYear = { "1": 0, "2": 0, "3": 0, "4": 0 };
  voters.forEach((voter) => {
    if (voter.eligible === true && voter.yearLevel >= 1 && voter.yearLevel <= 4) {
      eligibleByYear[String(voter.yearLevel)] += 1;
    }
  });

  return {
    candidatesById,
    positionsById,
    votersById,
    perCandidate,
    perPosition,
    byPositionCandidate,
    turnout: {
      total: voterYears.size,
      byYear: turnoutByYear
    },
    eligible: {
      total: voters.filter((voter) => voter.eligible === true).length,
      byYear: eligibleByYear
    },
    voteDocTotal: votes.length
  };
}

export function candidatesForPosition(candidates, positionId) {
  return candidates
    .filter((candidate) => candidate.positionId === positionId)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
}

export function rankedCandidatesForPosition(candidates, aggregate, positionId) {
  return candidatesForPosition(candidates, positionId)
    .map((candidate) => ({
      ...candidate,
      votes: aggregate.perCandidate[candidate.id] || 0
    }))
    .sort((a, b) => b.votes - a.votes || (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
}

export function buildTallies(electionId, votes) {
  const perCandidate = {};
  const perPosition = {};
  const voterYears = new Map();

  votes
    .filter((vote) => vote.electionId === electionId)
    .forEach((vote) => {
      perCandidate[vote.candidateId] = (perCandidate[vote.candidateId] || 0) + 1;
      perPosition[vote.positionId] = (perPosition[vote.positionId] || 0) + 1;

      if (!voterYears.has(vote.uid)) {
        voterYears.set(vote.uid, Number(vote.yearLevel));
      }
    });

  const byYear = { "1": 0, "2": 0, "3": 0, "4": 0 };
  for (const yearLevel of voterYears.values()) {
    if (yearLevel >= 1 && yearLevel <= 4) {
      byYear[String(yearLevel)] += 1;
    }
  }

  return {
    perCandidate,
    perPosition,
    turnout: {
      total: voterYears.size,
      byYear
    }
  };
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function votesToCsv({ votes, candidates, positions }) {
  const candidatesById = byId(candidates);
  const positionsById = byId(positions);
  const header = ["electionId", "positionId", "position", "candidateId", "candidate", "yearLevel", "createdAt"];
  const rows = votes.map((vote) => [
    vote.electionId,
    vote.positionId,
    positionsById[vote.positionId]?.name || vote.positionId,
    vote.candidateId,
    candidatesById[vote.candidateId]?.name || vote.candidateId,
    vote.yearLevel,
    formatTimestamp(vote.createdAt)
  ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
