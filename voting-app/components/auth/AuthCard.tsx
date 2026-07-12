'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomSelect from '@/components/ui/CustomSelect';
import { loginGuest, loginStudent, registerStudent } from '@/lib/auth/authService';
import { friendlyAuthError } from '@/lib/auth/errors';
import { hasErrors, validateGuest, validateLogin, validateRegistration, type FieldErrors } from '@/lib/auth/validation';
import { watchSession } from '@/lib/auth/session';
import { hasAdminClaim } from '@/lib/auth/guards-core';

type Tab = 'login' | 'register' | 'guest';

const EMPTY_REG = { email: '', password: '', studentNo: '', fullName: '', yearLevel: '', section: '' };
const EMPTY_GUEST = { email: '', fullName: '', yearLevel: '', section: '' };
const YEAR_OPTIONS = [
  { value: '1', label: '1st Year' },
  { value: '2', label: '2nd Year' },
  { value: '3', label: '3rd Year' },
  { value: '4', label: '4th Year' },
];
const SECTION_LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)); // A–Z

export default function AuthCard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('login');

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
  const guestSectionOptions = guestValues.yearLevel
    ? SECTION_LETTERS.map((letter) => ({
        value: `BSCS ${guestValues.yearLevel}-${letter}`,
        label: `BSCS ${guestValues.yearLevel}-${letter}`,
      }))
    : [];
  const regSectionOptions = regValues.yearLevel
    ? SECTION_LETTERS.map((letter) => ({
        value: `BSCS ${regValues.yearLevel}-${letter}`,
        label: `BSCS ${regValues.yearLevel}-${letter}`,
      }))
    : [];

  const tabIndex = tab === 'login' ? 0 : tab === 'register' ? 1 : 2;

  // watch session for redirect (same logic as indexPage.js)
  const redirected = useRef(false);
  useEffect(() => {
    const unsubscribe = watchSession((session) => {
      if (!session.user || redirected.current) return;
      redirected.current = true;
      if (hasAdminClaim(session.claims)) {
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
          className="switch"
          role="tablist"
          aria-label="Authentication mode"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const order: Tab[] = ['login', 'register', 'guest'];
            const delta = event.key === 'ArrowRight' ? 1 : -1;
            const next = order[(order.indexOf(tab) + delta + order.length) % order.length];
            setTab(next);
            (event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[order.indexOf(next)])?.focus();
          }}
        >
          <span className="ind" style={{ transform: `translateX(${tabIndex * 100}%)` }} />
          {([['login', 'Sign in', 'login-form'], ['register', 'Register', 'register-form'], ['guest', 'One-time', 'guest-form']] as const).map(([key, label, panelId]) => (
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
          autoComplete="off"
          onSubmit={handleLogin}
        >
          <label className="field">
            <span>Student email</span>
            <input
              name="email"
              type="email"
              autoComplete="off"
              suppressHydrationWarning
              placeholder="juan.delacruz.scc@gmail.com"
              required
              value={loginValues.email}
              onChange={(e) => setLoginValues((v) => ({ ...v, email: e.target.value }))}
            />
            {loginErrors.email && <span className="field-error">{loginErrors.email}</span>}
          </label>
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="off"
              suppressHydrationWarning
              required
              value={loginValues.password}
              onChange={(e) => setLoginValues((v) => ({ ...v, password: e.target.value }))}
            />
            {loginErrors.password && <span className="field-error">{loginErrors.password}</span>}
          </label>
          {loginMessage && <p className="form-message" role="status">{loginMessage}</p>}
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
          autoComplete="off"
          onSubmit={handleRegister}
        >
          <label className="field">
            <span>Full name</span>
            <input
              name="fullName"
              autoComplete="off"
              suppressHydrationWarning
              placeholder="Juan Dela Cruz"
              required
              value={regValues.fullName}
              onChange={(e) => setRegValues((v) => ({ ...v, fullName: e.target.value }))}
            />
            {regErrors.fullName && <span className="field-error">{regErrors.fullName}</span>}
          </label>
          <label className="field">
            <span>Student email</span>
            <input
              name="email"
              type="email"
              autoComplete="off"
              suppressHydrationWarning
              placeholder="juan.delacruz.scc@gmail.com"
              required
              value={regValues.email}
              onChange={(e) => setRegValues((v) => ({ ...v, email: e.target.value }))}
            />
            {regErrors.email && <span className="field-error">{regErrors.email}</span>}
          </label>
          <label className="field">
            <span>Student ID</span>
            <input
              name="studentNo"
              inputMode="numeric"
              autoComplete="off"
              suppressHydrationWarning
              placeholder="7–9 digit ID"
              required
              value={regValues.studentNo}
              onChange={(e) => setRegValues((v) => ({ ...v, studentNo: e.target.value }))}
            />
            {regErrors.studentNo && <span className="field-error">{regErrors.studentNo}</span>}
          </label>
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="off"
              suppressHydrationWarning
              minLength={6}
              required
              value={regValues.password}
              onChange={(e) => setRegValues((v) => ({ ...v, password: e.target.value }))}
            />
            {regErrors.password && <span className="field-error">{regErrors.password}</span>}
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
          {regMessage && <p className="form-message" role="status">{regMessage}</p>}
          <button className="btn btn-primary" type="submit" disabled={regBusy}>
            {regBusy ? 'Creating account...' : 'Create account →'}
          </button>
          <p className="auth-note">No approval wait — verify and head straight to your ballot.</p>
        </form>

        <form
          className={`pane${tab === 'guest' ? ' show' : ''}`}
          id="guest-form"
          role="tabpanel"
          aria-labelledby="auth-tab-guest"
          hidden={tab !== 'guest'}
          noValidate
          autoComplete="off"
          onSubmit={handleGuest}
        >
          <label className="field">
            <span>One-time Vote</span>
            <input
              name="fullName"
              autoComplete="off"
              suppressHydrationWarning
              placeholder="Full name"
              required
              value={guestValues.fullName}
              onChange={(e) => setGuestValues((v) => ({ ...v, fullName: e.target.value }))}
            />
            {guestErrors.fullName && <span className="field-error">{guestErrors.fullName}</span>}
          </label>
          <label className="field">
            <span>Email</span>
            <input
              name="email"
              type="email"
              autoComplete="off"
              suppressHydrationWarning
              placeholder="e.g. juan.delacruz.scc@gmail.com"
              required
              value={guestValues.email}
              onChange={(e) => setGuestValues((v) => ({ ...v, email: e.target.value }))}
            />
            {guestErrors.email && <span className="field-error">{guestErrors.email}</span>}
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
          {guestMessage && <p className="form-message" role="status">{guestMessage}</p>}
          <button className="btn btn-primary" type="submit" disabled={guestBusy}>
            {guestBusy ? 'Signing in...' : 'Verify & vote →'}
          </button>
          <p className="auth-note">Fast one-time access for students who need to go straight to the ballot.</p>
        </form>
      </section>
    </div>
  );
}
