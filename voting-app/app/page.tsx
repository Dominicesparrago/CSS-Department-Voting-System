'use client';

import { useEffect } from 'react';
import {
  Shield, Users, CheckSquare, AtSign, Lock, BarChart2, ArrowRight,
} from 'lucide-react';
import AuthCard from '@/components/auth/AuthCard';
import BrandLockup from '@/components/BrandLockup';

export default function LandingPage() {
  useEffect(() => {
    document.body.classList.add('landing');
    return () => document.body.classList.remove('landing');
  }, []);

  return (
    <>
      {/* sticky nav */}
      <nav className="site-nav" id="site-nav">
        <div className="wrap nav-in">
          <a className="nav-brand" href="#top">
            <span className="brand-logo scc">
              <img src="/assets/scc_logo.png" alt="St. Clare College of Caloocan logo" />
            </span>
            <span className="nav-brand-text">
              <strong>CSS Voting</strong>
              <small>St. Clare College of Caloocan</small>
            </span>
          </a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#positions">Positions</a>
            <a href="#integrity">Integrity</a>
          </div>
          <a className="btn btn-primary nav-cta" href="#auth">
            Vote now <ArrowRight size={14} className="arr" />
          </a>
        </div>
      </nav>

      <main id="top">
        {/* hero */}
        <header className="hero">
          <div className="wrap hero-grid">
            <div className="hero-copy" data-reveal>
              <p className="eyebrow">Official Student Election</p>
              <h1>
                Your voice.<br />
                <span className="grad">Your department.</span>
              </h1>
              <p className="lede">
                The secure, mobile-first voting system for the Computer Science Department.
                Register with your official student details and cast a complete, verified ballot in minutes.
              </p>
              <div className="hero-actions">
                <a className="btn btn-primary" href="#auth">
                  Get started <ArrowRight size={14} className="arr" />
                </a>
                <a className="btn btn-ghost" href="#how">How it works</a>
              </div>
              <ul className="hero-points">
                <li><span className="dot" /> Year-scoped ballots</li>
                <li><span className="dot" /> One verified vote per position</li>
                <li><span className="dot" /> Results published after polls close</li>
              </ul>
            </div>

            {/* auth card embedded in hero */}
            <AuthCard />
          </div>
        </header>

        {/* how it works */}
        <section className="sec" id="how">
          <div className="wrap">
            <div className="sec-head" data-reveal>
              <p className="eyebrow">The Process</p>
              <h2>Vote in four simple steps</h2>
              <p className="lede">
                Built for phones, designed to be fast and unmistakable from sign-up to confirmation.
              </p>
            </div>
            <div className="steps" data-reveal>
              {[
                { n: '01', h: 'Register', p: 'Sign up with your official .scc@gmail.com email and unique student ID. No approval wait.' },
                { n: '02', h: 'Get your ballot', p: 'See the 16 department positions plus the Representative for your year level — 17 races in all.' },
                { n: '03', h: 'Review & confirm', p: 'Check every selection on one screen. Submitting is final and is counted exactly once.' },
                { n: '04', h: 'See results', p: 'Live counts stay private during voting; official tallies publish to students after polls close.' },
              ].map(({ n, h, p }) => (
                <article key={n} className="step">
                  <span className="step-no">{n}</span>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* positions */}
        <section className="sec" id="positions">
          <div className="wrap">
            <div className="sec-head" data-reveal>
              <p className="eyebrow">On the Ballot</p>
              <h2>20 department positions</h2>
              <p className="lede">
                Independent candidates run for each seat. You vote for every department position plus your own year representative.
              </p>
            </div>
            <ul className="positions-grid" data-reveal>
              {[
                ['01', 'President'],
                ['02', 'Vice President — Internal'],
                ['03', 'Vice President — External'],
                ['04', 'Secretary'],
                ['05', 'Treasurer'],
                ['06', 'Auditor'],
                ['07', 'P.R.O'],
                ['08', 'Business Manager Committee'],
                ['09', 'Academic Committee Chair'],
                ['10', 'Research Committee Chair'],
                ['11', 'ICT Committee Chair'],
                ['12', 'Events Committee Chair'],
                ['13', 'Sports Committee Chair'],
                ['14', 'Environmental Committee Chair'],
                ['15', 'Membership Committee Chair'],
                ['16', 'Community Committee Chair'],
                ['17', '4th Year Representative', 'year'],
                ['18', '3rd Year Representative', 'year'],
                ['19', '2nd Year Representative', 'year'],
                ['20', '1st Year Representative', 'year'],
              ].map(([num, name, cls]) => (
                <li key={num} className={`pos-chip${cls ? ` ${cls}` : ''}`}>
                  <span>{num}</span> {name}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* integrity */}
        <section className="sec" id="integrity">
          <div className="wrap">
            <div className="sec-head" data-reveal>
              <p className="eyebrow">Built-in Integrity</p>
              <h2>Every vote protected</h2>
              <p className="lede">Anti-cheating is enforced by the system itself — not by trust.</p>
            </div>
            <div className="features" data-reveal>
              {[
                { Icon: Shield, h: 'One vote per position', p: 'Each ballot record is immutable. Duplicate or after-close votes are rejected at the source.' },
                { Icon: Users, h: 'Year-scoped ballots', p: 'You can only vote for the Representative of your own year level — no cross-year ballots.' },
                { Icon: CheckSquare, h: 'All-at-once submission', p: 'Your full ballot is cast in a single atomic action — no partial or top-up votes later.' },
                { Icon: AtSign, h: 'Verified registration', p: 'Strict .scc email format and a unique 7–9 digit student ID keep accounts genuine.' },
                { Icon: Lock, h: 'Secret ballot', p: "No student can read another student's vote. Your choices stay private, always." },
                { Icon: BarChart2, h: 'Auditable results', p: 'Final tallies are recomputed from immutable records, so outcomes are fully verifiable.' },
              ].map(({ Icon, h, p }) => (
                <article key={h} className="feature-card" data-spot>
                  <div className="feature-icon" aria-hidden="true">
                    <Icon size={22} strokeWidth={1.8} />
                  </div>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* stats */}
        <section className="sec stats-sec">
          <div className="wrap">
            <div className="stats" data-reveal>
              <div className="stat"><div className="num">20</div><div className="stat-lbl">Positions</div></div>
              <div className="stat"><div className="num">17</div><div className="stat-lbl">Races per ballot</div></div>
              <div className="stat"><div className="num">4</div><div className="stat-lbl">Year levels</div></div>
              <div className="stat"><div className="num">1×</div><div className="stat-lbl">Vote, verified</div></div>
            </div>
          </div>
        </section>

        {/* closing CTA */}
        <section className="sec cta-sec">
          <div className="wrap">
            <div className="cta" data-reveal data-spot>
              <h2>Ready to make it count?</h2>
              <p>Register or sign in to view your ballot. It only takes a minute.</p>
              <a className="btn btn-primary" href="#auth">
                Go to sign in <ArrowRight size={14} className="arr" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap foot-in">
          <BrandLockup className="foot-brand" />
          <p className="foot-note">© 2026 CSS Department Voting System · Official student election platform.</p>
        </div>
      </footer>
    </>
  );
}
