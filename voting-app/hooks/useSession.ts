'use client';

import { useEffect, useState } from 'react';
import { watchSession } from '@/lib/auth/session';
import type { Session } from '@/lib/types';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = watchSession((s) => {
      setSession(s);
      setError(null);
      setLoading(false);
    }, (err) => {
      setSession({ user: null, voterProfile: null, claims: null });
      setError(err);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { session, loading, error };
}
