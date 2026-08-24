/**
 * Firebase callable error parser.
 * Firebase SDK wraps HttpsError as FirebaseError { code: 'functions/<httpsCode>', message: '<httpsMessage>', details? }.
 * Plain Error fallback handles network/CORS or emulator unavailable.
 */
export function getFunctionsErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string; details?: unknown; customData?: { httpErrorCode?: { canonicalName?: string } } };
  const codeRaw = typeof e?.code === 'string' ? e.code : '';
  const messageRaw = typeof e?.message === 'string' ? e.message : '';
  // Firebase Functions error codes are prefixed with 'functions/'
  const code = codeRaw.startsWith('functions/') ? codeRaw.slice('functions/'.length) : codeRaw;

  // Prefer server-provided message when available
  if (messageRaw && messageRaw !== 'internal' && messageRaw !== code) {
    // Strip generic prefix like 'internal: ' if backend already included label
    return messageRaw;
  }

  // Generic internal with no message – give actionable hint
  if (code === 'internal' || codeRaw === 'internal') {
    return messageRaw && messageRaw !== 'internal'
      ? messageRaw
      : 'Internal server error — check Firebase Functions logs (firebase functions:log) for the stack trace. Common causes: Storage bucket not configured, Auth permission missing, or Firestore index required (firebase deploy --only firestore).';
  }
  if (code === 'not-found' || code === 'unimplemented') {
    return messageRaw || 'Function not found on the server. Run `firebase deploy --only functions` and wait for rollout.';
  }
  if (code === 'permission-denied') {
    return messageRaw || 'Super admin access required. Refresh the ID token: sign out/in after running set-superadmin.mjs, then retry.';
  }
  if (code === 'unauthenticated') {
    return messageRaw || 'Sign in again — session expired or not authenticated.';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return messageRaw || 'Functions unavailable — emulator not running or network/CORS blocked. Check NEXT_PUBLIC_USE_FIREBASE_EMULATORS and emulator host (localhost vs 127.0.0.1).';
  }
  if (code === 'failed-precondition') {
    return messageRaw || 'Precondition failed — election state or backup requirement not met.';
  }
  if (code === 'already-exists') return messageRaw || 'Already exists.';
  if (code === 'invalid-argument') return messageRaw || 'Invalid input.';
  if (code === 'data-loss') return messageRaw || 'Data corruption detected (checksum mismatch).';

  return messageRaw || codeRaw || 'Unexpected error.';
}

export function getFirestoreErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.code && e?.message) {
    if (e.code === 'permission-denied') {
      return `${e.message} — check Firestore rules and that your account has superadmin claim (sign out/in).`;
    }
    if (e.code === 'failed-precondition' && e.message.includes('index')) {
      return `${e.message} — deploy indexes: firebase deploy --only firestore.`;
    }
    return e.message;
  }
  return (error as Error)?.message || 'Unexpected Firestore error.';
}
