import type { ReactNode } from 'react';

interface AccessDeniedScreenProps {
  /** Small route label above the heading, e.g. "Admin route". */
  eyebrow: string;
  /** Why access was denied — shown as the lede. */
  reason: string;
  /** Terminal-style reference line, e.g. "admin credentials required". */
  refNote: string;
  /** Action buttons; a "Back to sign in" link is always rendered first. */
  actions?: ReactNode;
  titleId?: string;
}

/** Full-screen 403 state for protected routes (admin console, voter dashboard). */
export default function AccessDeniedScreen({ eyebrow, reason, refNote, actions, titleId = 'denied-title' }: AccessDeniedScreenProps) {
  return (
    <main className="route-state-screen">
      <section className="not-found-state" aria-labelledby={titleId}>
        <div className="not-found-code">403</div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 id={titleId}>Access denied</h1>
        <p className="lede">{reason}</p>
        <div className="route-ref">&gt; auth <strong>rejected</strong> - {refNote}</div>
        <div className="action-row centered">
          <a className="btn btn-primary" href="/">Back to sign in</a>
          {actions}
        </div>
      </section>
    </main>
  );
}
