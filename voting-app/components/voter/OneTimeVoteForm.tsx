'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import CustomSelect from '@/components/ui/CustomSelect';
import { hasAdminAccess } from '@/lib/auth/guards-core';
import { loginGuest } from '@/lib/auth/authService';
import { friendlyAuthError } from '@/lib/auth/errors';
import { hasErrors, validateGuest, type FieldErrors } from '@/lib/auth/validation';
import { watchSession } from '@/lib/auth/session';
import { watchAppConfig } from '@/lib/appConfig';
import { sectionLettersForYear } from '@/lib/constants';

const EMPTY_VALUES = { firstName: '', surname: '', yearLevel: '', section: '' };
const YEAR_OPTIONS = [
  { value: '1', label: '1st Year' },
  { value: '2', label: '2nd Year' },
  { value: '3', label: '3rd Year' },
  { value: '4', label: '4th Year' },
];

export interface OneTimeVoteFonts {
  figtree: string;
  jetBrainsMono: string;
}

export default function OneTimeVoteForm({ fonts }: { fonts: OneTimeVoteFonts }) {
  const router = useRouter();
  const redirected = useRef(false);
  // True while loginGuest() is in flight. The session watcher fires the moment
  // signInAnonymously resolves — before the voter/index batch has committed — and
  // the local cache can surface that pending write as an existing voter profile,
  // which would redirect to /vote on a registration that then fails. handleSubmit
  // owns the redirect; it only navigates after loginGuest resolves.
  const submittingRef = useRef(false);
  const [values, setValues] = useState(EMPTY_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    return watchAppConfig(
      (config) => {
        setMaintenanceMode(config.maintenanceMode);
        setConfigReady(true);
      },
      () => setConfigReady(true),
    );
  }, []);

  // The shared --font / --font-body / --font-mono chain in theme.css is computed once
  // at :root, so an inherited --font-figtree override never reaches font-family through
  // it (labels, inputs, selects, and the portaled CustomSelect dropdown all render in
  // the Segoe UI fallback). Apply the loaded families directly to <body> while this form
  // is mounted so every var() in the chain resolves to Figtree / JetBrains Mono; the
  // previous inline values are restored on unmount so other pages stay untouched.
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

  const sectionOptions = useMemo(() => {
    if (!values.yearLevel) return [];
    return sectionLettersForYear(Number(values.yearLevel)).map((letter) => {
      const section = `BSCS-${values.yearLevel}${letter}`;
      return { value: section, label: section };
    });
  }, [values.yearLevel]);

  useEffect(() => {
    const unsubscribe = watchSession((session) => {
      if (submittingRef.current) return;
      if (!session.user || redirected.current) return;
      redirected.current = true;
      if (hasAdminAccess(session)) {
        router.replace('/admin');
        return;
      }
      if (session.voterProfile) {
        router.replace('/vote');
      }
    }, (error) => {
      if (!redirected.current) setMessage(error.message || 'Unable to prepare your voting session. Please try again.');
    });

    return unsubscribe;
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    const nextValues = {
      firstName: values.firstName.trim(),
      surname: values.surname.trim(),
      yearLevel: Number(values.yearLevel),
      section: values.section.trim(),
    };

    const nextErrors = validateGuest(nextValues);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    setBusy(true);
    setMessage('Preparing your secure voting session...');
    submittingRef.current = true;
    try {
      await loginGuest(nextValues);
      redirected.current = true;
      router.replace('/vote');
    } catch (error) {
      setMessage(friendlyAuthError(error));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  if (!configReady || maintenanceMode) {
    return (
      <main className="auth-shell">
        <section className="status-panel" id="landing-route" data-spot>
          <p className="eyebrow">CSS Department Voting</p>
          <h1>{configReady ? 'Down for maintenance' : 'Checking service status'}</h1>
          <p className="lede">
            {configReady
              ? 'The voting platform is temporarily offline while the election committee performs maintenance. Please check back shortly.'
              : 'Please wait while we check whether voting is available.'}
          </p>
          {configReady && <div className="maintenance-banner" role="status"><span className="d" aria-hidden="true" />Voting is temporarily paused.</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <form className="auth-panel form-stack" onSubmit={handleSubmit} noValidate aria-label="One-time voter identification form">
        <header className="auth-form-head">
          <p className="eyebrow">Voter access</p>
          <h1>One-Time Voting</h1>
          <p>Enter your student information to continue to the ballot.</p>
        </header>

        <div className="field">
          <div className="two-col">
            <label className="field">
              <span>Surname</span>
              <input
                name="surname"
                type="text"
                autoComplete="family-name"
                required
                value={values.surname}
                onChange={(event) => setValues((current) => ({ ...current, surname: event.target.value }))}
                aria-invalid={Boolean(errors.surname)}
                aria-describedby={errors.surname ? 'one-time-surname-error' : undefined}
              />
              {errors.surname && <span id="one-time-surname-error" className="field-error">{errors.surname}</span>}
            </label>
            <label className="field">
              <span>First Name</span>
              <input
                name="firstName"
                type="text"
                autoComplete="given-name"
                required
                value={values.firstName}
                onChange={(event) => setValues((current) => ({ ...current, firstName: event.target.value }))}
                aria-invalid={Boolean(errors.firstName)}
                aria-describedby={errors.firstName ? 'one-time-first-name-error' : undefined}
              />
              {errors.firstName && <span id="one-time-first-name-error" className="field-error">{errors.firstName}</span>}
            </label>
          </div>
        </div>

        <div className="field">
          <div className="two-col">
            <CustomSelect
              label="Year level"
              value={values.yearLevel}
              options={YEAR_OPTIONS}
              placeholder="Select year"
              onChange={(yearLevel) => setValues((current) => ({ ...current, yearLevel, section: '' }))}
            />
            <CustomSelect
              label="Section"
              value={values.section}
              options={sectionOptions}
              placeholder={values.yearLevel ? 'Select section' : 'Select year first'}
              disabled={!values.yearLevel}
              onChange={(section) => setValues((current) => ({ ...current, section }))}
            />
          </div>
          {errors.yearLevel && <span id="one-time-year-error" className="field-error">{errors.yearLevel}</span>}
          {errors.section && <span id="one-time-section-error" className="field-error">{errors.section}</span>}
        </div>

        {message && <p className="form-message" role="alert">{message}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Preparing ballot...' : 'Continue'}
        </button>
      </form>
    </main>
  );
}
