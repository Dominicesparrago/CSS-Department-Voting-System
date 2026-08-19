'use strict';

const { HttpsError } = require('firebase-functions/v2/https');
const { DEFAULT_ELECTION_ID } = require('./constants');

/**
 * Shared auth guards for the trusted Cloud Functions. Mirrors the Firestore
 * rules: admin = custom claim OR admins/{email} registry; superadmin = custom
 * claim only. All privileged/destructive callables must call these server-side
 * before doing anything — never rely on the frontend.
 */

/** Best-effort display role for audit entries. */
function actorRole(auth) {
  const token = (auth && auth.token) || {};
  if (token.superadmin === true || token.role === 'superadmin') return 'superadmin';
  return 'admin';
}

function isSuperAdminAuth(auth) {
  const token = (auth && auth.token) || {};
  return token.superadmin === true || token.role === 'superadmin';
}

async function assertAdmin(db, auth) {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const token = auth.token || {};
  if (token.admin === true || token.superadmin === true || token.role === 'admin' || token.role === 'superadmin') {
    return;
  }
  const email = typeof token.email === 'string' ? token.email.toLowerCase() : '';
  if (email) {
    const snap = await db.doc(`admins/${email}`).get();
    if (snap.exists) return;
  }
  throw new HttpsError('permission-denied', 'Admin access required.');
}

function assertSuperAdmin(auth) {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const token = auth.token || {};
  if (token.superadmin === true || token.role === 'superadmin') return;
  throw new HttpsError('permission-denied', 'Super admin access required.');
}

/**
 * Blocks ordinary admin writes to election config/data while the election is
 * locked or finalized, unless superadmin (audited emergency override). Per
 * election for candidate operations; current election for global data
 * (positions, voters, roster). This mirrors the Firestore rules lock/finalize
 * guards, but must be re-checked here because Admin SDK writes bypass rules.
 */
async function assertElectionConfigWritable(db, auth, electionId) {
  await assertAdmin(db, auth);
  if (isSuperAdminAuth(auth)) return;
  const id = electionId || DEFAULT_ELECTION_ID;
  const snap = await db.doc(`elections/${id}`).get();
  if (!snap.exists) return;
  const d = snap.data();
  if (d.locked === true) throw new HttpsError('failed-precondition', 'Election data is locked.');
  if (d.status === 'finalized') throw new HttpsError('failed-precondition', 'Election results are finalized.');
}

module.exports = { assertAdmin, assertSuperAdmin, assertElectionConfigWritable, actorRole, isSuperAdminAuth };

