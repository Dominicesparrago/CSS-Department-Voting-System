'use strict';

/**
 * Election lifecycle state machine (pure logic, no I/O).
 *
 * Authoritative transitions:
 *   draft   -> open                       (admin)
 *   open    -> closed                     (admin)
 *   closed  -> open                       (superadmin force ONLY — audited emergency reopen)
 *
 * Everything else (published/finalized/archived, forward jumps, re-publishing)
 * is out of scope for this callable: published results are produced by
 * publishTally, finalized by finalizeElection, archived/restored by their own
 * audited callables. Direct client writes to the election document are denied
 * by the security rules; this module is the only sanctioned path for open/close.
 */

const SETTABLE_STATUSES = ['open', 'closed'];
const MUTABLE_SOURCE_STATUSES = ['draft', 'open', 'closed'];

/**
 * Resolve whether an election status change is permitted.
 * @returns {{ ok: true }} | {{ ok: false, code: string, message: string }}
 */
function resolveElectionTransition({
  currentStatus,
  nextStatus,
  locked = false,
  isSuperadmin = false,
  force = false,
}) {
  if (!SETTABLE_STATUSES.includes(nextStatus)) {
    return {
      ok: false,
      code: 'invalid-argument',
      message: `Status must be "open" or "closed" (received "${nextStatus}"). Use the dedicated publish/finalize/archive operations instead.`,
    };
  }
  if (!MUTABLE_SOURCE_STATUSES.includes(currentStatus)) {
    return {
      ok: false,
      code: 'failed-precondition',
      message: `A ${currentStatus} election cannot be opened or closed here.`,
    };
  }
  if (locked && !(isSuperadmin && force)) {
    return {
      ok: false,
      code: 'failed-precondition',
      message: 'This election is locked. Only a superadmin emergency override (force) can change its status.',
    };
  }
  if (currentStatus === nextStatus) {
    return { ok: false, code: 'already-exists', message: `The election is already ${currentStatus}.` };
  }
  if (currentStatus === 'draft' && nextStatus !== 'open') {
    return { ok: false, code: 'failed-precondition', message: 'A draft election can only be opened.' };
  }
  if (currentStatus === 'closed' && nextStatus === 'open') {
    if (!isSuperadmin || !force) {
      return {
        ok: false,
        code: 'permission-denied',
        message: 'Reopening a closed election requires superadmin approval (force). The action is audited.',
      };
    }
  }
  // Remaining case: open -> closed (any admin), draft -> open (any admin),
  // closed -> open with superadmin force.
  return { ok: true };
}

module.exports = { resolveElectionTransition, SETTABLE_STATUSES, MUTABLE_SOURCE_STATUSES };
