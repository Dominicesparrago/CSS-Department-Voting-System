'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { hasSuperAdminClaim } from '@/lib/auth/guards-core';
import { friendlyAuthError } from '@/lib/auth/errors';
import { loginStudent } from '@/lib/auth/authService';
import { watchSession } from '@/lib/auth/session';

export interface AdminAuthFonts {
  figtree: string;
  jetBrainsMono: string;
}

export default function AdminAuthForm({ fonts }: { fonts: AdminAuthFonts }) {
  const router = useRouter();
  const redirected = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const body = document.body;
    const figtreeStack = `${fonts.figtree}, "Figtree", "Segoe UI", Arial, sans-serif`;
    const monoStack = `${fonts.jetBrainsMono}, "JetBrains Mono", ui-monospace, monospace`;
    const overrides: Record<string, string> = {
      '--font-figtree': fonts.figtree,
      '--font-jetbrains-mono': fonts.jetBrainsMono,
      '--font': figtreeStack,
      '--font-body': figtreeStack,
      '--font-display': figtreeStack,
      '--mono': monoStack,
      '--font-mono': monoStack,
    };
    const previous = new Map<string, string>();
    for (const [prop, value] of Object.entries(overrides)) {
      previous.set(prop, body.style.getPropertyValue(prop));
      body.style.setProperty(prop, value);
    }
    return () => {
      for (const [prop, value] of previous) {
        if (value) body.style.setProperty(prop, value);
        else body.style.removeProperty(prop);
      }
    };
  }, [fonts.figtree, fonts.jetBrainsMono]);

  useEffect(() => {
    const unsubscribe = watchSession((session) => {
      if (!session.user || redirected.current) return;
      if (session.claims && (session.claims.admin === true || session.claims.role === 'admin' || session.adminViaRegistry === true || hasSuperAdminClaim(session.claims))) {
        redirected.current = true;
        router.replace(hasSuperAdminClaim(session.claims) ? '/superadmin' : '/admin');
      }
    });

    return unsubscribe;
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!email.trim() || !password) {
      setMessage('Email and password are required.');
      return;
    }

    setBusy(true);
    try {
      await loginStudent(email.trim().toLowerCase(), password);
      setMessage('Signing in...');
    } catch (error) {
      setMessage(friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-panel form-stack" onSubmit={handleSubmit} noValidate aria-label="Admin login form">
        <header className="auth-form-head">
          <p className="eyebrow">Administrator access</p>
          <h1>Admin Login</h1>
          <p>Sign in with your administrator credentials to continue to the console.</p>
        </header>

        <label className="field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@domain.com"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {message && <p className="form-message" role="alert">{message}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in...' : 'Login'}
        </button>
      </form>
    </main>
  );
}
