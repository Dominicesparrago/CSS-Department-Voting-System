export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  const message = String((error as { message?: string })?.message ?? '');

  if (code === 'auth/email-already-in-use') return 'This email is already registered. Please sign in.';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') return 'Email or password is incorrect.';
  if (code === 'auth/user-not-found') return 'No account was found for this email.';
  if (code === 'auth/weak-password') return 'Password must be at least 6 characters.';
  if (code === 'permission-denied' || message.includes('PERMISSION_DENIED'))
    return 'This student ID is already registered or the student details are invalid.';

  return 'Something went wrong. Please check your details and try again.';
}
