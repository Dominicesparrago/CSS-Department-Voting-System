'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import CustomSelect from '@/components/ui/CustomSelect';
import { hasAdminAccess } from '@/lib/auth/guards-core';
import { loginGuest } from '@/lib/auth/authService';
import { friendlyAuthError } from '@/lib/auth/errors';
import { hasErrors, validateGuest, type FieldErrors } from '@/lib/auth/validation';
import { watchSession } from '@/lib/auth/session';

const EMPTY_VALUES = { studentNo: '', email: '', fullName: '', yearLevel: '', section: '' };
const YEAR_OPTIONS = [
  { value: '1', label: '1st Year' },
  { value: '2', label: '2nd Year' },
  { value: '3', label: '3rd Year' },
  { value: '4', label: '4th Year' },
];
const SECTION_LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));

export interface OneTimeVoteFonts {
  figtree: string;
  jetBrainsMono: string;
}

export default function OneTimeVoteForm({ fonts }: { fonts: OneTimeVoteFonts }) {
  const router = useRouter();
  const redirected = useRef(false);
  const [values, setValues] = useState(EMPTY_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

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
    return SECTION_LETTERS.map((letter) => {
      const section = `BSCS-${values.yearLevel}${letter}`;
      return { value: section, label: section };
    });
  }, [values.yearLevel]);

  useEffect(() => {
    const unsubscribe = watchSession((session) => {
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
      studentNo: values.studentNo.trim(),
      email: values.email.trim().toLowerCase(),
      fullName: values.fullName.trim(),
      yearLevel: Number(values.yearLevel),
      section: values.section.trim(),
    };

    const nextErrors = validateGuest(nextValues);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    setBusy(true);
    setMessage('Preparing your secure voting session...');
    try {
      await loginGuest(nextValues);
      redirected.current = true;
      router.replace('/vote');
    } catch (error) {
      setMessage(friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-panel form-stack" onSubmit={handleSubmit} noValidate aria-label="One-time voter identification form">
        <header className="auth-form-head">
          <p className="eyebrow">Voter access</p>
          <h1>One-Time Voting</h1>
          <p>Enter your student information to continue to the ballot.</p>
        </header>

        <label className="field">
          <span>Full Name</span>
          <input
            name="fullName"
            type="text"
            autoComplete="name"
            required
            value={values.fullName}
            onChange={(event) => setValues((current) => ({ ...current, fullName: event.target.value }))}
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? 'one-time-full-name-error' : undefined}
          />
          {errors.fullName && <span id="one-time-full-name-error" className="field-error">{errors.fullName}</span>}
        </label>

        <label className="field">
          <span>Student Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            value={values.email}
            onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'one-time-email-error' : undefined}
            placeholder="juan.delacruz.scc@gmail.com"
          />
          {errors.email && <span id="one-time-email-error" className="field-error">{errors.email}</span>}
        </label>

        <label className="field">
          <span>Student ID</span>
          <input
            name="studentNo"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            required
            value={values.studentNo}
            onChange={(event) => setValues((current) => ({ ...current, studentNo: event.target.value }))}
            aria-invalid={Boolean(errors.studentNo)}
            aria-describedby={errors.studentNo ? 'one-time-student-id-error' : undefined}
            placeholder="20261234"
          />
          {errors.studentNo && <span id="one-time-student-id-error" className="field-error">{errors.studentNo}</span>}
        </label>

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
