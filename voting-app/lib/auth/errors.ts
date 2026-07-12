export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  const message = String((error as { message?: string })?.message ?? '');

  if (code === 'auth/email-already-in-use') return 'This email is already registered. Please sign in.';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') return 'Email or password is incorrect.';
  if (code === 'auth/user-not-found') return 'No account was found for this email.';
  if (code === 'auth/weak-password') return 'Password must be at least 6 characters.';
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation')
    return 'One-time voting needs Anonymous sign-in enabled in Firebase Authentication.';
  if (code === 'auth/network-request-failed' || message.includes('Failed to fetch'))
    return 'Unable to reach Firebase. Check your internet connection or emulator settings.';
  if (code === 'unavailable' || message.includes('unavailable'))
    return 'Firebase is unreachable. If you are running locally, start the emulators or set NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false.';
  if (code === 'permission-denied' || message.includes('PERMISSION_DENIED'))
    return 'Firebase rejected this request. Check whether this email was already used or whether one-time voting is allowed.';

  return 'Something went wrong. Please check your details and try again.';
}
