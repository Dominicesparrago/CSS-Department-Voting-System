'use strict';

const { Timestamp } = require('firebase-admin/firestore');
const { FieldValue } = require('firebase-admin/firestore');

/**
 * Shared tally computation helpers (Admin SDK). Ballots are the immutable
 * source of truth for per-candidate/per-position counts; turnout comes from the
 * voter participation lock, never from ballots.
 */

/** Tally counts from an array of ballot docs ({ id, data() }) or plain objects. */
function tallyFromBallotDocs(ballotDocs) {
  const perCandidate = {};
  const perPosition = {};
  ballotDocs.forEach((d) => {
    const b = d && typeof d.data === 'function' ? d.data() : d;
    perCandidate[b.candidateId] = (perCandidate[b.candidateId] || 0) + 1;
    perPosition[b.positionId] = (perPosition[b.positionId] || 0) + 1;
  });
  return { perCandidate, perPosition };
}

/** Recompute the full tally (counts + turnout) for an election from ballots + locks. */
async function recomputeElectionTally(db, electionId) {
  const { readAllDocs, readDocsWhere } = require('./dbHelpers');
  const [ballotDocs, voterDocs] = await Promise.all([
    readDocsWhere(db, 'ballots', 'electionId', electionId),
    readAllDocs(db, 'voters'),
  ]);
  const { perCandidate, perPosition } = tallyFromBallotDocs(ballotDocs);
  const byYear = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let turnoutTotal = 0;
  voterDocs.forEach((d) => {
    const v = d.data();
    if (v.hasVoted && v.hasVoted[electionId] === true) {
      turnoutTotal += 1;
      const yr = Number(v.yearLevel);
      if (yr >= 1 && yr <= 4) byYear[yr] += 1;
    }
  });
  return { perCandidate, perPosition, turnout: { total: turnoutTotal, byYear } };
}

/** Parse a date that may arrive as ISO string, epoch ms, Date, Timestamp-like, or null. */
function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (typeof value === 'number') return Timestamp.fromMillis(value);
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? Timestamp.fromMillis(t) : null;
  }
  if (value && typeof value.seconds === 'number') {
    return new Timestamp(value.seconds, value.nanoseconds || 0);
  }
  return null;
}

module.exports = { tallyFromBallotDocs, recomputeElectionTally, parseDate };
