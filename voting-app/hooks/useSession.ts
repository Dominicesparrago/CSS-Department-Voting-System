'use client';

import { useEffect, useState } from 'react';
import { watchSession } from '@/lib/auth/session';
import type { Session } from '@/lib/types';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = watchSession((s) => {
      setSession(s);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { session, loading };
}
