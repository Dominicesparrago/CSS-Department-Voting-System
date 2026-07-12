import Image from 'next/image';

export default function NotFound() {
  return (
    <main className="route-state-screen not-found-screen">
      <section className="not-found-state" aria-labelledby="not-found-title">
        <a className="terminal-mark not-found-mark has-logo" href="/" aria-label="CSS Voting home">
          <Image src="/assets/department_logo.png" alt="" width={36} height={36} />
        </a>
        <div className="not-found-code">404</div>
        <p className="eyebrow">Page not found</p>
        <h1 id="not-found-title">This ballot box doesn&apos;t exist.</h1>
        <p className="lede">The page you&apos;re looking for was moved, removed, or never existed. Let&apos;s get you back to somewhere that counts.</p>
        <div className="route-ref">&gt; route <strong>not found</strong> - returning to a safe page</div>
        <div className="action-row">
          <a className="btn btn-primary" href="/dashboard">Go to dashboard</a>
          <a className="btn btn-ghost" href="/">Back to sign in</a>
        </div>
      </section>
    </main>
  );
}
