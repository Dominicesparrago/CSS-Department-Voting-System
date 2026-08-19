'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomSelect from '@/components/ui/CustomSelect';
import { loginGuest, loginStudent, registerStudent } from '@/lib/auth/authService';
import { friendlyAuthError } from '@/lib/auth/errors';
import { hasErrors, validateGuest, validateLogin, validateRegistration, type FieldErrors } from '@/lib/auth/validation';
import { watchSession } from '@/lib/auth/session';
import { hasAdminAccess } from '@/lib/auth/guards-core';
import { watchAppConfig } from '@/lib/appConfig';
import { sectionLettersForYear } from '@/lib/constants';

type Tab = 'login' | 'register' | 'guest';

const EMPTY_REG = { email: '', password: '', studentNo: '', fullName: '', yearLevel: '', section: '' };
const EMPTY_GUEST = { studentNo: '', email: '', fullName: '', yearLevel: '', section: '' };
const YEAR_OPTIONS = [
  { value: '1', label: '1st Year' },
  { value: '2', label: '2nd Year' },
  { value: '3', label: '3rd Year' },
  { value: '4', label: '4th Year' },
];

export default function AuthCard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('login');
  // Guest voting is an explicitly enabled policy. If config cannot be read,
  // keep the anonymous path hidden rather than failing open.
  const [guestVotingEnabled, setGuestVotingEnabled] = useState(false);

  // superadmin can disable one-time (guest) voting; the tab disappears live
  useEffect(() => {
    const unsubscribe = watchAppConfig((config) => {
      setGuestVotingEnabled(config.allowGuestVoters);
      if (!config.allowGuestVoters) setTab((current) => (current === 'guest' ? 'login' : current));
    });
    return unsubscribe;
  }, []);

  // login form state
  const [loginValues, setLoginValues] = useState({ email: '', password: '' });
  const [loginErrors, setLoginErrors] = useState<FieldErrors>({});
  const [loginMessage, setLoginMessage] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  // register form state
  const [regValues, setRegValues] = useState(EMPTY_REG);
  const [regErrors, setRegErrors] = useState<FieldErrors>({});
  const [regMessage, setRegMessage] = useState('');
  const [regBusy, setRegBusy] = useState(false);

  // one-time (guest) form state
  const [guestValues, setGuestValues] = useState(EMPTY_GUEST);
  const [guestErrors, setGuestErrors] = useState<FieldErrors>({});
  const [guestMessage, setGuestMessage] = useState('');
  const [guestBusy, setGuestBusy] = useState(false);
  // canonical section format app-wide: BSCS-<year><letter> (e.g. BSCS-3A)
  const guestSectionOptions = guestValues.yearLevel
    ? sectionLettersForYear(Number(guestValues.yearLevel)).map((letter) => ({
        value: `BSCS-${guestValues.yearLevel}${letter}`,
        label: `BSCS-${guestValues.yearLevel}${letter}`,
      }))
    : [];
  const regSectionOptions = regValues.yearLevel
    ? sectionLettersForYear(Number(regValues.yearLevel)).map((letter) => ({
        value: `BSCS-${regValues.yearLevel}${letter}`,
        label: `BSCS-${regValues.yearLevel}${letter}`,
      }))
    : [];

  const tabDefs: Array<[Tab, string, string]> = [
    ['login', 'Sign in', 'login-form'],
    ['register', 'Register', 'register-form'],
    ...(guestVotingEnabled ? [['guest', 'One-time', 'guest-form'] as [Tab, string, string]] : []),
  ];
  const tabOrder = tabDefs.map(([key]) => key);
  const tabIndex = Math.max(0, tabOrder.indexOf(tab));

  // watch session for redirect (same logic as indexPage.js)
  const redirected = useRef(false);
  useEffect(() => {
    const unsubscribe = watchSession((session) => {
      if (!session.user || redirected.current) return;
      redirected.current = true;
      if (hasAdminAccess(session)) {
        router.replace('/admin');
        return;
      }
      if (session.voterProfile) {
        router.replace(session.voterProfile.guest ? '/vote' : '/dashboard');
        return;
      }
      setLoginMessage('No voter profile was found for this account.');
      redirected.current = false;
    }, (error) => {
      setLoginMessage(error.message || 'Unable to verify your session.');
      redirected.current = false;
    });
    return unsubscribe;
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginMessage('');
    const values = { email: loginValues.email.trim().toLowerCase(), password: loginValues.password };
    const errors = validateLogin(values);
    setLoginErrors(errors);
    if (hasErrors(errors)) return;
    setLoginBusy(true);
    try {
      await loginStudent(values.email, values.password);
      setLoginMessage('Signed in. Redirecting...');
    } catch (err) {
      setLoginMessage(friendlyAuthError(err));
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegMessage('');
    const values = {
      email: regValues.email.trim().toLowerCase(),
      password: regValues.password,
      studentNo: regValues.studentNo.trim(),
      fullName: regValues.fullName.trim(),
      yearLevel: Number(regValues.yearLevel),
      section: regValues.section.trim(),
    };
    const errors = validateRegistration(values);
    setRegErrors(errors);
    if (hasErrors(errors)) return;
    setRegBusy(true);
    try {
      await registerStudent(values);
      setRegMessage('Account created. Redirecting...');
    } catch (err) {
      setRegMessage(friendlyAuthError(err));
    } finally {
      setRegBusy(false);
    }
  }

  async function handleGuest(e: React.FormEvent) {
    e.preventDefault();
    setGuestMessage('');
    const values = {
      studentNo: guestValues.studentNo.trim(),
      email: guestValues.email.trim().toLowerCase(),
      fullName: guestValues.fullName.trim(),
      yearLevel: Number(guestValues.yearLevel),
      section: guestValues.section.trim(),
    };
    const errors = validateGuest(values);
    setGuestErrors(errors);
    if (hasErrors(errors)) return;
    setGuestBusy(true);
    try {
      await loginGuest(values);
      setGuestMessage('Signed in. Redirecting...');
    } catch (err) {
      setGuestMessage(friendlyAuthError(err));
    } finally {
      setGuestBusy(false);
    }
  }

  return (
    <div className="auth-col" id="auth">
      <section className="auth-card" data-reveal data-spot suppressHydrationWarning aria-label="Sign in or register">
        <h3>Access your ballot</h3>
        <p className="sub">Choose how you&apos;d like to continue.</p>

        <div
          className={`switch${tabDefs.length === 2 ? ' two' : ''}`}
          role="tablist"
          aria-label="Authentication mode"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const delta = event.key === 'ArrowRight' ? 1 : -1;
            const next = tabOrder[(tabOrder.indexOf(tab) + delta + tabOrder.length) % tabOrder.length];
            setTab(next);
            (event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[tabOrder.indexOf(next)])?.focus();
          }}
        >
          <span className="ind" style={{ transform: `translateX(${tabIndex * 100}%)` }} />
          {tabDefs.map(([key, label, panelId]) => (
            <button
              key={key}
              id={`auth-tab-${key}`}
              className={tab === key ? 'on' : ''}
              role="tab"
              aria-selected={tab === key}
              aria-controls={panelId}
              tabIndex={tab === key ? 0 : -1}
              type="button"
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <form
          className={`pane${tab === 'login' ? ' show' : ''}`}
          id="login-form"
          role="tabpanel"
          aria-labelledby="auth-tab-login"
          hidden={tab !== 'login'}
          noValidate
          autoComplete="on"
          onSubmit={handleLogin}
        >
          <label className="field">
            <span>Student email</span>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              suppressHydrationWarning
              placeholder="juan.delacruz.scc@gmail.com"
              required
              aria-invalid={Boolean(loginErrors.email)}
              aria-describedby={loginErrors.email ? 'login-email-error' : undefined}
              value={loginValues.email}
              onChange={(e) => setLoginValues((v) => ({ ...v, email: e.target.value }))}
            />
            {loginErrors.email && <span id="login-email-error" className="field-error">{loginErrors.email}</span>}
          </label>
          <label className="field">
            <span>Password</span>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              suppressHydrationWarning
              required
              aria-invalid={Boolean(loginErrors.password)}
              aria-describedby={loginErrors.password ? 'login-password-error' : undefined}
              value={loginValues.password}
              onChange={(e) => setLoginValues((v) => ({ ...v, password: e.target.value }))}
            />
            {loginErrors.password && <span id="login-password-error" className="field-error">{loginErrors.password}</span>}
          </label>
          {loginMessage && <p className="form-message" role="alert">{loginMessage}</p>}
          <button className="btn btn-primary" type="submit" disabled={loginBusy}>
            {loginBusy ? 'Signing in...' : 'Sign in →'}
          </button>
          <p className="auth-note">Use your official <code>.scc@gmail.com</code> email and account password.</p>
        </form>

        <form
          className={`pane${tab === 'register' ? ' show' : ''}`}
          id="register-form"
          role="tabpanel"
          aria-labelledby="auth-tab-register"
          hidden={tab !== 'register'}
          noValidate
          autoComplete="on"
          onSubmit={handleRegister}
        >
          <label className="field">
            <span>Full name</span>
            <input
              id="register-full-name"
              name="fullName"
              autoComplete="name"
              suppressHydrationWarning
              placeholder="Juan Dela Cruz"
              required
              aria-invalid={Boolean(regErrors.fullName)}
              aria-describedby={regErrors.fullName ? 'register-full-name-error' : undefined}
              value={regValues.fullName}
              onChange={(e) => setRegValues((v) => ({ ...v, fullName: e.target.value }))}
            />
            {regErrors.fullName && <span id="register-full-name-error" className="field-error">{regErrors.fullName}</span>}
          </label>
          <label className="field">
            <span>Student email</span>
            <input
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              suppressHydrationWarning
              placeholder="juan.delacruz.scc@gmail.com"
              required
              aria-invalid={Boolean(regErrors.email)}
              aria-describedby={regErrors.email ? 'register-email-error' : undefined}
              value={regValues.email}
              onChange={(e) => setRegValues((v) => ({ ...v, email: e.target.value }))}
            />
            {regErrors.email && <span id="register-email-error" className="field-error">{regErrors.email}</span>}
          </label>
          <label className="field">
            <span>Student ID</span>
            <input
              id="register-student-number"
              name="studentNo"
              inputMode="numeric"
              autoComplete="off"
              suppressHydrationWarning
              placeholder="7–9 digit ID"
              required
              aria-invalid={Boolean(regErrors.studentNo)}
              aria-describedby={regErrors.studentNo ? 'register-student-number-error' : undefined}
              value={regValues.studentNo}
              onChange={(e) => setRegValues((v) => ({ ...v, studentNo: e.target.value }))}
            />
            {regErrors.studentNo && <span id="register-student-number-error" className="field-error">{regErrors.studentNo}</span>}
          </label>
          <label className="field">
            <span>Password</span>
            <input
              id="register-password"
              name="password"
              type="password"
              autoComplete="new-password"
              suppressHydrationWarning
              minLength={6}
              required
              aria-invalid={Boolean(regErrors.password)}
              aria-describedby={regErrors.password ? 'register-password-error' : undefined}
              value={regValues.password}
              onChange={(e) => setRegValues((v) => ({ ...v, password: e.target.value }))}
            />
            {regErrors.password && <span id="register-password-error" className="field-error">{regErrors.password}</span>}
          </label>
          <div className="two-col">
            <CustomSelect
              label="Year level"
              value={regValues.yearLevel}
              options={YEAR_OPTIONS}
              placeholder="Select year"
              onChange={(yearLevel) => setRegValues((v) => ({ ...v, yearLevel, section: '' }))}
            />
            <CustomSelect
              label="Section"
              value={regValues.section}
              options={regSectionOptions}
              placeholder={regValues.yearLevel ? 'Select section' : 'Select year first'}
              disabled={!regValues.yearLevel}
              onChange={(section) => setRegValues((v) => ({ ...v, section }))}
            />
          </div>
          {regErrors.yearLevel && <span className="field-error">{regErrors.yearLevel}</span>}
          {regErrors.section && <span className="field-error">{regErrors.section}</span>}
          {regMessage && <p className="form-message" role="alert">{regMessage}</p>}
          <button className="btn btn-primary" type="submit" disabled={regBusy}>
            {regBusy ? 'Creating account...' : 'Create account →'}
          </button>
          <p className="auth-note">No approval wait — verify and head straight to your ballot.</p>
        </form>

        {guestVotingEnabled && (
        <form
          className={`pane${tab === 'guest' ? ' show' : ''}`}
          id="guest-form"
          role="tabpanel"
          aria-labelledby="auth-tab-guest"
          hidden={tab !== 'guest'}
          noValidate
          autoComplete="on"
          onSubmit={handleGuest}
        >
          <label className="field">
            <span>One-time Vote</span>
            <input
              id="guest-full-name"
              name="fullName"
              autoComplete="name"
              suppressHydrationWarning
              placeholder="Full name"
              required
              aria-invalid={Boolean(guestErrors.fullName)}
              aria-describedby={guestErrors.fullName ? 'guest-full-name-error' : undefined}
              value={guestValues.fullName}
              onChange={(e) => setGuestValues((v) => ({ ...v, fullName: e.target.value }))}
            />
            {guestErrors.fullName && <span id="guest-full-name-error" className="field-error">{guestErrors.fullName}</span>}
          </label>
          <label className="field">
            <span>Email</span>
            <input
              id="guest-email"
              name="email"
              type="email"
              autoComplete="email"
              suppressHydrationWarning
              placeholder="e.g. juan.delacruz.scc@gmail.com"
              required
              aria-invalid={Boolean(guestErrors.email)}
              aria-describedby={guestErrors.email ? 'guest-email-error' : undefined}
              value={guestValues.email}
              onChange={(e) => setGuestValues((v) => ({ ...v, email: e.target.value }))}
            />
            {guestErrors.email && <span id="guest-email-error" className="field-error">{guestErrors.email}</span>}
          </label>
          <CustomSelect
            label="Year level"
            value={guestValues.yearLevel}
            options={YEAR_OPTIONS}
            placeholder="Select year"
            onChange={(yearLevel) => setGuestValues((v) => ({ ...v, yearLevel, section: '' }))}
          />
          {guestErrors.yearLevel && <span className="field-error">{guestErrors.yearLevel}</span>}
          <CustomSelect
            label="Section"
            value={guestValues.section}
            options={guestSectionOptions}
            placeholder={guestValues.yearLevel ? 'Select section' : 'Select year first'}
            disabled={!guestValues.yearLevel}
            onChange={(section) => setGuestValues((v) => ({ ...v, section }))}
          />
          {guestErrors.section && <span className="field-error">{guestErrors.section}</span>}
          {guestMessage && <p className="form-message" role="alert">{guestMessage}</p>}
          <button className="btn btn-primary" type="submit" disabled={guestBusy}>
            {guestBusy ? 'Signing in...' : 'Verify & vote →'}
          </button>
          <p className="auth-note">Fast one-time access for students who need to go straight to the ballot.</p>
        </form>
        )}
      </section>
    </div>
  );
}
