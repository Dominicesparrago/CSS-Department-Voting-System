'use strict';

const { FieldValue } = require('firebase-admin/firestore');

/**
 * Server-side audit writer used by the trusted functions. Written via the
 * Admin SDK so it bypasses rules; failures are swallowed so audit logging never
 * breaks the primary operation (the operation is already the source of truth).
 */
async function writeAudit(db, { actorUid, actorRole, action, target, details = {}, electionId }) {
  try {
    await db.collection('audit').add({
      ts: FieldValue.serverTimestamp(),
      actorUid,
      actorRole: actorRole || 'admin',
      action,
      target,
      ...(electionId ? { electionId } : {}),
      details,
    });
  } catch {
    // audit must never fail the primary operation
  }
}

module.exports = { writeAudit };
