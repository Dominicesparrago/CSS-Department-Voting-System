'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useSession';
import { hasAdminClaim } from '@/lib/auth/guards-core';
import { signOut } from '@/lib/auth/session';
import AdminDashboard from '@/components/admin/AdminDashboard';

type PageState = 'loading' | 'denied' | 'ready';

export default function AdminPage() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [deniedReason, setDeniedReason] = useState('');

  useEffect(() => {
    if (loading) return;

    if (!session?.user) {
      setDeniedReason('Please sign in with an admin account.');
      setPageState('denied');
      return;
    }

    if (!hasAdminClaim(session.claims)) {
      setDeniedReason('This account does not have admin access.');
      setPageState('denied');
      return;
    }

    setPageState('ready');
  }, [session, loading]);

  async function handleSignOut() {
    await signOut();
    router.replace('/');
  }

  if (loading || pageState === 'loading') {
    return (
      <main className="page-shell admin-page">
        <section id="admin-denied" className="status-panel">
          <p className="eyebrow">Admin Route</p>
          <h1>Loading...</h1>
          <p className="lede">Verifying admin credentials.</p>
        </section>
      </main>
    );
  }

  if (pageState === 'denied') {
    return (
      <main className="page-shell admin-page">
        <section id="admin-denied" className="status-panel">
          <p className="eyebrow">Admin Route</p>
          <h1>Access denied</h1>
          <p id="admin-denied-message" className="lede">{deniedReason}</p>
          <div className="action-row">
            <a className="btn btn-ghost" href="/">Back</a>
            <button className="btn btn-ghost" id="admin-denied-sign-out" type="button" onClick={handleSignOut}>Sign out</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell admin-page">
      <AdminDashboard actorUid={session!.user!.uid} onSignOut={handleSignOut} />
    </main>
  );
}
