'use strict';

const { FieldValue } = require('firebase-admin/firestore');
const { assertSuperAdmin, actorRole } = require('./authGuards');
const { writeAudit } = require('./audit');
const { deleteAllDocs, batchDeleteByIds, readAllDocs, readDocsWhere } = require('./dbHelpers');
const { MAX_ROSTER_ROWS } = require('./constants');
const DEFAULT_ELECTION_ID = require('./constants').DEFAULT_ELECTION_ID;

/**
 * Build the Firestore operations for removing voters.
 * Returns an array of objects describing what to do for each voter doc:
 * - For voted voters: { type: 'tombstone', uid, data: {hasVoted, votedAt} }
 * - For non-voted voters: { type: 'delete', uid }
 * Also returns lists of index docs to delete.
 */
function buildVoterRemovalOps(voters, electionId) {
  const ops = [];
  const studentIndexDeletes = [];
  const emailIndexDeletes = [];
  const guestRegistrationDeletes = [];
  
  for (const voterDoc of voters) {
    const voter = voterDoc.data() || {};
    const uid = voterDoc.id;
    
    // Collect index entries to delete (if they exist)
    if (voter.studentNo) {
      studentIndexDeletes.push(voter.studentNo);
    }
    if (voter.email) {
      const email = voter.email.trim().toLowerCase();
      if (email) {
        emailIndexDeletes.push(email);
      }
    }
    
    // Check if voter has voted in this election
    const hasVoted = voter.hasVoted && voter.hasVoted[electionId] === true;
    
    if (hasVoted) {
      // Create tombstone: keep hasVoted and votedAt, strip PII
      ops.push({
        type: 'tombstone',
        uid,
        data: {
          hasVoted: { [electionId]: true },
          votedAt: voter.votedAt ? { [electionId]: voter.votedAt[electionId] } : null,
          tombstonedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }
      });
    } else {
      // Full deletion for non-voted voters
      ops.push({ type: 'delete', uid });
      if (typeof voter._guestRegistrationKey === 'string' && voter._guestRegistrationKey) {
        guestRegistrationDeletes.push(voter._guestRegistrationKey);
      }
    }
  }
  
  return { ops, studentIndexDeletes, emailIndexDeletes, guestRegistrationDeletes };
}

/**
 * Execute voter removals with Firestore writes.
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @param {Array} ops - Operations from buildVoterRemovalOps
 * @param {Array} studentIndexDeletes - Student number index doc IDs to delete
 * @param {Array} emailIndexDeletes - Email index doc IDs to delete
 * @returns {Promise<{removed: number, tombstoned: number}>} Counts
 */
async function executeVoterRemovals(db, ops, studentIndexDeletes, emailIndexDeletes, guestRegistrationDeletes = []) {
  let removedCount = 0;
  let tombstonedCount = 0;
  
  // Process voter operations in batches
  const BATCH_SIZE = 400;
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const batchOps = ops.slice(i, i + BATCH_SIZE);
    
    for (const op of batchOps) {
      if (op.type === 'tombstone') {
        // Write tombstone (overwrite existing doc)
        batch.set(db.doc(`voters/${op.uid}`), op.data, { merge: false });
        tombstonedCount++;
      } else if (op.type === 'delete') {
        // Delete voter doc
        batch.delete(db.doc(`voters/${op.uid}`));
        removedCount++;
      }
    }
    
    await batch.commit();
  }
  
  // Delete student index entries
  if (studentIndexDeletes.length > 0) {
    await batchDeleteByIds(db, 'studentIndex', studentIndexDeletes);
  }
  
  // Delete email index entries
  if (emailIndexDeletes.length > 0) {
    await batchDeleteByIds(db, 'emailIndex', emailIndexDeletes);
  }

  if (guestRegistrationDeletes.length > 0) {
    await batchDeleteByIds(db, 'guestRegistrations', guestRegistrationDeletes);
  }
  
  return { removed: removedCount, tombstoned: tombstonedCount };
}

/**
 * Validate input for deleteVoters callable.
 * @param {Object} data - Request data
 * @throws {HttpsError} If validation fails
 */
function validateDeleteVotersInput(data) {
  const { HttpsError } = require('firebase-functions/v2/https');
  
  if (!data) {
    throw new HttpsError('invalid-argument', 'No data provided.');
  }
  
  const { all, uids, reason } = data;
  
  // Validate reason (required, mirrors resetVoterRegistration)
  if (typeof reason !== 'string' || reason.trim().length < 8) {
    throw new HttpsError('invalid-argument', 'Reason must be at least 8 characters long.');
  }
  
  // Mutually exclusive: all OR uids
  if (all === true && (Array.isArray(uids) && uids.length > 0)) {
    throw new HttpsError('invalid-argument', 'Cannot specify both "all": true and "uids".');
  }
  if (all !== true && (!Array.isArray(uids) || uids.length === 0)) {
    throw new HttpsError('invalid-argument', 'Must specify either "all": true or non-empty "uids" array.');
  }
  
  if (all !== true) {
    // Validate uids array
    if (!Array.isArray(uids)) {
      throw new HttpsError('invalid-argument', '"uids" must be an array.');
    }
    if (uids.length === 0) {
      throw new HttpsError('invalid-argument', '"uids" array cannot be empty.');
    }
    if (uids.length > MAX_ROSTER_ROWS) {
      throw new HttpsError('invalid-argument', `Voter removals are limited to ${MAX_ROSTER_ROWS} entries.`);
    }
    for (const uid of uids) {
      if (typeof uid !== 'string' || uid.length === 0 || uid.length > 64) {
        throw new HttpsError('invalid-argument', 'Each voter ID must be a non-empty string of 64 characters or less.');
      }
    }
  }
}

module.exports = {
  buildVoterRemovalOps,
  executeVoterRemovals,
  validateDeleteVotersInput
};
