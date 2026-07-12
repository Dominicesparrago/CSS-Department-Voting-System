/**
 * Maps raw Firebase Auth / Firestore errors to messages a student should see.
 * Keep these student-facing: no backend names ("Firebase"), no dev/ops details
 * (emulators, env vars) — the raw error is still thrown and logged for developers.
 */
export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  const message = String((error as { message?: string })?.message ?? '');

  if (code === 'auth/email-already-in-use') return 'This email is already registered. Please sign in instead.';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') return 'Email or password is incorrect.';
  if (code === 'auth/user-not-found') return 'No account was found for this email.';
  if (code === 'auth/weak-password') return 'Password must be at least 6 characters.';
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation')
    return 'One-time voting is unavailable right now. Please register for an account instead, or contact the election committee.';
  if (code === 'auth/network-request-failed' || message.includes('Failed to fetch'))
    return 'Couldn’t connect. Please check your internet connection and try again.';
  if (code === 'unavailable' || message.includes('unavailable'))
    return 'The voting service is temporarily unavailable. Please try again in a moment.';
  if (code === 'permission-denied' || message.includes('PERMISSION_DENIED'))
    return 'We couldn’t complete this. That email or student ID may already have been used to vote, or registration may be closed. Please double-check your details, or sign in if you already have an account.';

  return 'Something went wrong. Please check your details and try again.';
}
