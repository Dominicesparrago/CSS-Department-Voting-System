'use strict';

/**
 * Reset scope matrix for the Reset Center. This module is pure (no I/O) so the
 * reset behavior can be unit-tested and the UI can reuse the same definitions.
 *
 * Schema mapping notes:
 * - Candidates carry their election + position assignment on the candidate doc,
 *   so "reset assignments" maps to the candidates reset in this schema.
 * - Voter "reset" clears only election-specific participation state
 *   (hasVoted/votedAt for the election) — never the voter account or the roster,
 *   which are persistent identity data.
 */

const SCOPE_DEFINITIONS = {
  candidates: {
    label: 'Reset Candidate Data',
    description:
      'Removes election candidates while preserving Year, Section, Election, positions, the roster, voter accounts, and audit history.',
  },
  voters: {
    label: 'Reset Voter Data',
    description:
      'Clears election voting status (participation locks) while preserving voter accounts and the official roster.',
  },
  ballots: {
    label: 'Reset Ballots / Votes',
    description:
      'Removes election ballots, derived tallies, and participation locks. Voter accounts and the roster are preserved.',
  },
  assignments: {
    label: 'Reset Candidate Assignments',
    description:
      'In this schema candidates carry their position/party assignment, so this maps to the candidates reset.',
  },
  full: {
    label: 'Full Election Data Reset',
    description:
      'Resets candidates, ballots, tallies, and participation locks while explicitly preserving Year, Section, Election, positions, the roster, voter accounts, admin registry, config, and audit history.',
  },
};

function isResetScope(scope) {
  return Object.prototype.hasOwnProperty.call(SCOPE_DEFINITIONS, scope);
}

function scopeDefinition(scope) {
  return SCOPE_DEFINITIONS[scope] || null;
}

/** Data a full reset always preserves (shown in the Reset Center confirmation). */
function preservedDataList() {
  return [
    'Year',
    'Section',
    'Election',
    'Positions (ballot structure)',
    'Official student roster',
    'Student / voter accounts',
    'Admin registry & app config',
    'Audit history',
  ];
}

module.exports = { SCOPE_DEFINITIONS, isResetScope, scopeDefinition, preservedDataList };
