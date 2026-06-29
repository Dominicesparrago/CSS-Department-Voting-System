'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginStudent, registerStudent } from '@/lib/auth/authService';
import { friendlyAuthError } from '@/lib/auth/errors';
import { hasErrors, validateLogin, validateRegistration, type FieldErrors } from '@/lib/auth/validation';
import { watchSession } from '@/lib/auth/session';
import { hasAdminClaim } from '@/lib/auth/guards-core';

type Tab = 'login' | 'register';

const EMPTY_REG = { email: '', password: '', studentNo: '', fullName: '', yearLevel: '', section: '' };

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
        router.replace('/vote');
        return;
      }
      setLoginMessage('No voter profile was found for this account.');
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

  return (
    <div className="auth-col">
      <p className="eyebrow">Official Student Election</p>
      <section className="auth-card" id="auth" data-reveal data-spot aria-label="Sign in or register">
      <div className="brand-lockup">
        <div className="brand-logos">
          <span className="brand-logo scc">
            <img src="/assets/scc_logo.png" alt="St. Clare College of Caloocan logo" />
          </span>
          <span className="brand-logo dept">
            <img src="/assets/department_logo.png" alt="Computer Science Department logo" />
          </span>
        </div>
        <div className="brand-text">
          <p className="brand-inst">St. Clare College of Caloocan</p>
          <p className="brand-sub">Computer Science Department</p>
        </div>
      </div>

      <div className="section-divider" aria-hidden="true" />

      <div className="tabs" role="group" aria-label="Authentication mode">
        <button
          className={`tab-button${tab === 'login' ? ' is-active' : ''}`}
          type="button"
          onClick={() => setTab('login')}
        >
          Login
        </button>
        <button
          className={`tab-button${tab === 'register' ? ' is-active' : ''}`}
          type="button"
          onClick={() => setTab('register')}
        >
          Register
        </button>
      </div>

      {/* login form */}
      <form
        className={`form-stack${tab !== 'login' ? ' is-hidden' : ''}`}
        id="login-form"
        noValidate
        autoComplete="off"
        onSubmit={handleLogin}
      >
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="off"
            required
            value={loginValues.email}
            onChange={(e) => setLoginValues((v) => ({ ...v, email: e.target.value }))}
          />
          {loginErrors.email && <span className="field-error">{loginErrors.email}</span>}
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="off"
            required
            value={loginValues.password}
            onChange={(e) => setLoginValues((v) => ({ ...v, password: e.target.value }))}
          />
          {loginErrors.password && <span className="field-error">{loginErrors.password}</span>}
        </label>
        {loginMessage && <p className="form-message" role="status">{loginMessage}</p>}
        <button className="btn btn-primary" type="submit" disabled={loginBusy}>
          {loginBusy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      {/* register form */}
      <form
        className={`form-stack${tab !== 'register' ? ' is-hidden' : ''}`}
        id="register-form"
        noValidate
        autoComplete="off"
        onSubmit={handleRegister}
      >
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="off"
            placeholder="juan.delacruz.scc@gmail.com"
            required
            value={regValues.email}
            onChange={(e) => setRegValues((v) => ({ ...v, email: e.target.value }))}
          />
          {regErrors.email && <span className="field-error">{regErrors.email}</span>}
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="off"
            minLength={6}
            required
            value={regValues.password}
            onChange={(e) => setRegValues((v) => ({ ...v, password: e.target.value }))}
          />
          {regErrors.password && <span className="field-error">{regErrors.password}</span>}
        </label>
        <label>
          Student ID
          <input
            name="studentNo"
            inputMode="numeric"
            autoComplete="off"
            required
            value={regValues.studentNo}
            onChange={(e) => setRegValues((v) => ({ ...v, studentNo: e.target.value }))}
          />
          {regErrors.studentNo && <span className="field-error">{regErrors.studentNo}</span>}
        </label>
        <label>
          Full name
          <input
            name="fullName"
            autoComplete="off"
            required
            value={regValues.fullName}
            onChange={(e) => setRegValues((v) => ({ ...v, fullName: e.target.value }))}
          />
          {regErrors.fullName && <span className="field-error">{regErrors.fullName}</span>}
        </label>
        <div className="two-col">
          <label>
            Year level
            <select
              name="yearLevel"
              required
              value={regValues.yearLevel}
              onChange={(e) => setRegValues((v) => ({ ...v, yearLevel: e.target.value }))}
            >
              <option value="">Select year</option>
              <option value="1">1st Year</option>
              <option value="2">2nd Year</option>
              <option value="3">3rd Year</option>
              <option value="4">4th Year</option>
            </select>
            {regErrors.yearLevel && <span className="field-error">{regErrors.yearLevel}</span>}
          </label>
          <label>
            Section
            <input
              name="section"
              placeholder="BSCS 2-A"
              required
              value={regValues.section}
              onChange={(e) => setRegValues((v) => ({ ...v, section: e.target.value }))}
            />
            {regErrors.section && <span className="field-error">{regErrors.section}</span>}
          </label>
        </div>
        {regMessage && <p className="form-message" role="status">{regMessage}</p>}
        <button className="btn btn-primary" type="submit" disabled={regBusy}>
          {regBusy ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="auth-note">
        Use your official <code>name.scc@gmail.com</code> email and 7–9 digit student ID.
      </p>
    </section>
    </div>
  );
}
