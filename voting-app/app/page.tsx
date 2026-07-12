'use client';

import BrandMark from '@/components/BrandMark';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  AtSign,
  BarChart2,
  CalendarDays,
  CheckSquare,
  Clock3,
  EyeOff,
  FileCheck,
  HelpCircle,
  ListChecks,
  Lock,
  Shield,
  UserCheck,
  Users,
  Vote,
} from 'lucide-react';
import AuthCard from '@/components/auth/AuthCard';

export default function LandingPage() {
  const [positionFilter, setPositionFilter] = useState<'all' | 'exec' | 'cmte' | 'year'>('all');
  const positions = useMemo(() => [
    ['01', 'President', 'exec'],
    ['02', 'VP - Internal', 'exec'],
    ['03', 'VP - External', 'exec'],
    ['04', 'Secretary', 'exec'],
    ['05', 'Treasurer', 'exec'],
    ['06', 'Auditor', 'exec'],
    ['07', 'P.R.O', 'exec'],
    ['08', 'Business Manager Cmte', 'cmte'],
    ['09', 'Academic Cmte Chair', 'cmte'],
    ['10', 'Research Cmte Chair', 'cmte'],
    ['11', 'ICT Cmte Chair', 'cmte'],
    ['12', 'Events Cmte Chair', 'cmte'],
    ['13', 'Sports Cmte Chair', 'cmte'],
    ['14', 'Environmental Cmte Chair', 'cmte'],
    ['15', 'Membership Cmte Chair', 'cmte'],
    ['16', 'Community Cmte Chair', 'cmte'],
    ['17', '4th Year Representative', 'year'],
    ['18', '3rd Year Representative', 'year'],
    ['19', '2nd Year Representative', 'year'],
    ['20', '1st Year Representative', 'year'],
  ] as const, []);
  const visiblePositions = positions.filter(([, , group]) => positionFilter === 'all' || group === positionFilter);

  useEffect(() => {
    document.body.classList.add('landing');
    return () => document.body.classList.remove('landing');
  }, []);

  return (
    <>
      <nav className="site-nav console-nav" id="site-nav">
        <div className="wrap nav-in">
          <a className="nav-brand terminal-brand" href="#top">
            <BrandMark />
            <span className="nav-brand-text">
              <strong>CSS Voting</strong>
              <small>St. Clare College of Caloocan</small>
            </span>
          </a>
          <div className="nav-links">
            <a href="#about">About</a>
            <a href="#how">How it works</a>
            <a href="#positions">Positions</a>
            <a href="#eligibility">Eligibility</a>
            <a href="#dates">Dates</a>
            <a href="#faq">FAQ</a>
          </div>
          <a className="btn btn-primary nav-cta" href="#auth">
            Vote now <ArrowRight size={14} className="arr" />
          </a>
        </div>
      </nav>

      <main id="top" className="console-landing">
        <header className="hero">
          <div className="wrap hero-grid">
            <div className="hero-copy" data-reveal>
              <p className="kicker"><span className="dot" /> {'// official student election · A.Y. 2026'}</p>
              <h1>
                Your Voice.<br />
                <span className="grad">Your Department!</span>
              </h1>
              <p className="lead-copy">
                The secure, mobile-first voting platform for the Computer Science Department of St. Clare College of Caloocan.
                Register with your official student details and cast a complete, verified ballot in minutes.
              </p>
              <div className="hero-actions">
                <a className="btn btn-primary" href="#auth">
                  Get started <ArrowRight size={14} className="arr" />
                </a>
                <a className="btn btn-ghost" href="#how">How voting works</a>
              </div>
              <ul className="hero-points">
                <li>Year-scoped ballots</li>
                <li>One verified vote per position</li>
                <li>Results after polls close</li>
              </ul>
            </div>

            <AuthCard />
          </div>
        </header>

        <section className="sec" id="about">
          <div className="wrap sec-grid">
            <aside className="sec-aside">
              <p className="eyebrow">About the election</p>
              <h2>A fair election, run by the department</h2>
              <p>Organized by the CSS Department Election Committee under the Student Council.</p>
            </aside>
            <div>
              <div className="lead-prose">
                <p>
                  Every academic year the Computer Science Department elects its student officers — the people who
                  represent your interests, organize events, manage funds, and lead committees. This platform exists
                  to make that election fast, transparent, and tamper-resistant, so the outcome reflects what students
                  actually chose.
                </p>
              </div>
              <div className="lead-grid about-grid">
                {[
                  { Icon: ListChecks, h: '17 races on your ballot', p: '16 department positions plus the representative for your year level — cast in one verified submission.' },
                  { Icon: UserCheck, h: 'Independent candidates', p: 'No alliances or parties. Each candidate runs as an individual on their own platform.' },
                  { Icon: BarChart2, h: 'Auditable outcomes', p: 'Final tallies are recomputed from immutable records and published after polls close.' },
                  { Icon: EyeOff, h: 'Private by design', p: 'Your ballot is secret. No student — or admin — can trace a vote back to you.' },
                ].map(({ Icon, h, p }) => (
                  <article key={h} className="lead">
                    <span className="ic"><Icon size={22} /></span>
                    <div>
                      <h3>{h}</h3>
                      <p>{p}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>


        <section className="sec" id="how">
          <div className="wrap sec-grid">
            <aside className="sec-aside">
              <p className="eyebrow">The Process</p>
              <h2>Vote in four simple steps</h2>
              <p>Built for phones — fast and unmistakable from sign-up to confirmation. The trail lights up as you go.</p>
            </aside>
            <div className="timeline has-line">
              {[
                { Icon: AtSign, n: '01', h: 'Register', p: 'Sign up with your official .scc@gmail.com email and a unique 7–9 digit student ID. No approval wait.' },
                { Icon: ListChecks, n: '02', h: 'Get your ballot', p: 'See the 16 department positions plus the Representative for your year — 17 races in all, scoped to you.' },
                { Icon: CheckSquare, n: '03', h: 'Review & confirm', p: 'Check every selection on one screen. Submitting is final and is counted exactly once.' },
                { Icon: BarChart2, n: '04', h: 'See results', p: 'Counts stay private during voting; official tallies publish to students after polls close.' },
              ].map(({ Icon, n, h, p }) => (
                <article key={n} className="tl-step lit">
                  <span className="tl-icon"><Icon size={21} /></span>
                  <div>
                    <span className="tl-no">Step {n}</span>
                    <h3>{h}</h3>
                    <p>{p}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="statstrip-sec">
          <div className="wrap">
            <div className="statstrip">
              {[
                { Icon: Vote, n: '20', label: 'Positions' },
                { Icon: ListChecks, n: '17', label: 'Races / Ballot' },
                { Icon: Users, n: '4', label: 'Year levels' },
                { Icon: UserCheck, n: '1×', label: 'Vote, verified' },
              ].map(({ Icon, n, label }) => (
                <div className="statitem" key={label}>
                  <span className="ic"><Icon size={20} /></span>
                  <div>
                    <div className="statnum grad">{n}</div>
                    <div className="statlbl">{label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec" id="positions">
          <div className="wrap">
            <aside className="sec-aside positions-head">
              <p className="eyebrow">On the Ballot</p>
              <h2>20 department positions</h2>
              <p>
                Independent candidates run for each seat. You vote for every department position plus your own year representative.
              </p>
            </aside>
            <div className="filter" role="group" aria-label="Filter positions by group">
              {[
                ['all', 'All'],
                ['exec', 'Executive'],
                ['cmte', 'Committees'],
                ['year', 'Year Reps'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={positionFilter === key ? 'on' : ''}
                  type="button"
                  aria-pressed={positionFilter === key}
                  onClick={() => setPositionFilter(key as typeof positionFilter)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="poslist">
              {visiblePositions.map(([num, name, group]) => (
                <div key={num} className={`posrow${group === 'year' ? ' year' : ''}`} data-g={group}>
                  <span className="n">{num}</span>
                  <span>{name}</span>
                  {group === 'year' && <span className="yr">Year rep</span>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec" id="integrity">
          <div className="wrap sec-grid">
            <aside className="sec-aside">
              <p className="eyebrow">Built-in Integrity</p>
              <h2>Every vote protected</h2>
              <p>Anti-cheating is enforced by the system itself — not by trust.</p>
            </aside>
            <div className="lead-grid cols3">
              {[
                { Icon: Shield, code: 'SEC-01', h: 'One vote per position', p: 'Each ballot record is immutable. Duplicate or after-close votes are rejected at the source.' },
                { Icon: Users, code: 'SEC-02', h: 'Year-scoped ballots', p: 'You can only vote for the Representative of your own year level — no cross-year ballots.' },
                { Icon: FileCheck, code: 'SEC-03', h: 'All-at-once submission', p: 'Your full ballot is cast in a single atomic action — no partial or top-up votes later.' },
                { Icon: AtSign, code: 'SEC-04', h: 'Verified registration', p: 'Strict .scc email format and a unique 7–9 digit student ID keep accounts genuine.' },
                { Icon: EyeOff, code: 'SEC-05', h: 'Secret ballot', p: "No student can read another student's vote. Your choices stay private, always." },
                { Icon: BarChart2, code: 'SEC-06', h: 'Auditable results', p: 'Final tallies are recomputed from immutable records, so outcomes are fully verifiable.' },
              ].map(({ Icon, code, h, p }) => (
                <article key={code} className="lead">
                  <span className="ic"><Icon size={22} strokeWidth={1.8} /></span>
                  <div>
                    <span className="spec">{code}</span>
                    <h3>{h}</h3>
                    <p>{p}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sec" id="eligibility">
          <div className="wrap sec-grid">
            <aside className="sec-aside">
              <p className="eyebrow">Who can vote</p>
              <h2>Eligibility & requirements</h2>
              <p>Check you&apos;re set before polls open. Questions? The committee can help at the registration desk.</p>
            </aside>
            <div className="lead-grid">
              {[
                { Icon: UserCheck, h: 'Enrolled CS student', p: 'You must be a currently enrolled student of the Computer Science Department for A.Y. 2026.' },
                { Icon: AtSign, h: 'Official .scc email', p: 'Register with your institutional .scc@gmail.com account — personal emails are rejected.' },
                { Icon: FileCheck, h: 'Valid student ID', p: 'A unique 7–9 digit student ID number is required and can be used to register only once.' },
                { Icon: Users, h: 'Vote your year', p: 'You may only choose the Year Representative for your own year level.' },
              ].map(({ Icon, h, p }) => (
                <article key={h} className="lead">
                  <span className="ic"><Icon size={22} /></span>
                  <div>
                    <h3>{h}</h3>
                    <p>{p}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sec" id="dates">
          <div className="wrap sec-grid">
            <aside className="sec-aside">
              <p className="eyebrow">Mark your calendar</p>
              <h2>Key dates & deadlines</h2>
              <p>All times in Philippine Standard Time (PST).</p>
            </aside>
            <div className="lead-grid">
              {[
                { Icon: CalendarDays, h: 'Registration opens', p: 'Mon, Sep 1 · 8:00 AM — create your account and verify details.' },
                { Icon: Clock3, h: 'Candidate filing closes', p: 'Fri, Sep 12 · 5:00 PM — final candidate roster locked.' },
                { Icon: Lock, h: 'Voting period', p: 'Mon–Tue, Sep 22–23 · 8:00 AM–6:00 PM — cast your ballot.' },
                { Icon: BarChart2, h: 'Results published', p: 'Wed, Sep 24 · 12:00 NN — official tallies released to students.' },
              ].map(({ Icon, h, p }) => (
                <article key={h} className="lead">
                  <span className="ic"><Icon size={22} /></span>
                  <div>
                    <span className="spec">{h}</span>
                    <p>{p}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sec" id="faq">
          <div className="wrap sec-grid">
            <aside className="sec-aside">
              <p className="eyebrow">Questions</p>
              <h2>Frequently asked</h2>
              <p>Still stuck? Reach the election committee via your year&apos;s group chat.</p>
            </aside>
            <div className="faq-list">
              {[
                ['Can I change my vote after submitting?', 'No. Once submitted, your ballot is final and cannot be reopened.'],
                ["I didn't get a confirmation — did my vote count?", 'If your dashboard shows a recorded ballot, your vote counted exactly once. If it does not, contact the election committee before the voting window closes.'],
                ['Why can I only vote for one year representative?', 'Representative races are year-scoped, so each student votes only for the representative of their own year level.'],
                ['Is my vote anonymous?', 'Yes. Your choices stay private. Admins can verify participation and tallies, but not trace a ballot back to a student.'],
                ['What if I forget my student ID or use the wrong email?', 'Use your official .scc@gmail.com account and verified 7–9 digit student ID. If your details are wrong, ask the committee to verify them before voting.'],
              ].map(([q, a]) => (
                <article className="faq-row" key={q}>
                  <HelpCircle size={18} />
                  <div>
                    <h3>{q}</h3>
                    <p>{a}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="cta-band">
          <div className="wrap">
            <h2>Ready to make it count?</h2>
            <p>Register or sign in to view your ballot. It only takes a minute.</p>
            <div className="cta-actions">
              <a className="btn btn-primary" href="#auth">Go to sign in <ArrowRight size={14} className="arr" /></a>
              <a className="btn btn-ghost" href="#how">See how it works</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap foot-in">
          <a className="nav-brand terminal-brand" href="#top">
            <BrandMark />
            <span className="nav-brand-text">
              <strong>CSS Voting</strong>
              <small>Computer Science Department</small>
            </span>
          </a>
          <p className="foot-note">© 2026 CSS Department Voting System · Official student election platform.</p>
        </div>
      </footer>
    </>
  );
}
