'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from './useSession';
import { signOut } from '@/lib/auth/session';
import type { Session } from '@/lib/types';

export type GuardDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'redirect'; to: string };

export type GuardStatus = 'loading' | 'denied' | 'ready';

/**
 * Session gate shared by every protected route. `evaluate` runs once the session
 * resolves and decides whether to render, show the denied screen, or redirect.
 * Session errors surface as a denial with `errorFallback` when they carry no message.
 */
export function useGuardedSession(
  evaluate: (session: Session) => GuardDecision,
  errorFallback = 'Unable to verify your session.',
) {
  const router = useRouter();
  const { session, loading, error } = useSession();
  const [status, setStatus] = useState<GuardStatus>('loading');
  const [deniedReason, setDeniedReason] = useState('');
  const evaluateRef = useRef(evaluate);
  evaluateRef.current = evaluate;

  useEffect(() => {
    if (loading || !session) return;

    if (error) {
      setDeniedReason(error.message || errorFallback);
      setStatus('denied');
      return;
    }

    const decision = evaluateRef.current(session);
    if (decision.kind === 'redirect') {
      // Hold the page on its loading state (not its content or a 403) while the
      // client-side navigation runs. On sign-out the session goes null and we
      // redirect home — without this the page would flash "access denied" or
      // render its content against a null session before the route changes.
      setStatus('loading');
      router.replace(decision.to);
      return;
    }
    if (decision.kind === 'deny') {
      setDeniedReason(decision.reason);
      setStatus('denied');
      return;
    }
    setStatus('ready');
  }, [session, loading, error, router, errorFallback]);

  async function signOutToHome() {
    await signOut();
    router.replace('/');
  }

  return { session, status, deniedReason, signOutToHome };
}
