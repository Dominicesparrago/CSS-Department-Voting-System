/** Convert callable/backend failures into useful admin-facing feedback. */
export function friendlyAdminError(error: unknown, fallback: string): string {
  const value = error as { code?: string; message?: string } | null;
  const code = value?.code ?? '';
  const message = value?.message ?? '';
  const normalized = message.toLowerCase();

  if (code === 'unauthenticated') return 'Your admin session expired. Sign in again and retry.';
  if (code === 'permission-denied') return 'You do not have permission to perform this admin action.';
  if (code === 'failed-precondition') return message || 'This action is not available in the current election state.';
  if (code === 'unavailable' || normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'The election service is temporarily unavailable. Check the local backend and retry.';
  }
  if (code === 'internal' || normalized === 'internal' || normalized.includes('does not exist')) {
    return 'The election backend is unavailable. Restart the Functions service, then retry.';
  }
  return message || fallback;
}
