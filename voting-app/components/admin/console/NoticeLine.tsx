'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, TriangleAlert, X } from 'lucide-react';

export type Notice = { text: string; error?: boolean } | null;

const AUTO_DISMISS_MS = 4000;
const EXIT_MS = 260;

/** Toast-style success/error popup. Errors get alert semantics + rose styling. */
export default function NoticeLine({ notice }: { notice: Notice }) {
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!notice) return;
    setShown(true);
    setLeaving(false);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setLeaving(true);
      window.setTimeout(() => setShown(false), EXIT_MS);
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [notice]);

  function dismiss() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setLeaving(true);
    window.setTimeout(() => setShown(false), EXIT_MS);
  }

  if (!notice || !shown) return null;

  return (
    <div
      className={`notice-popup${notice.error ? ' is-error' : ''}${leaving ? ' is-leaving' : ''}`}
      role={notice.error ? 'alert' : 'status'}
      aria-live="polite"
    >
      <span className="notice-popup__icon" aria-hidden="true">
        {notice.error ? <TriangleAlert size={18} /> : <CheckCircle2 size={18} />}
      </span>
      <span className="notice-popup__text">{notice.text}</span>
      <button className="notice-popup__close" type="button" aria-label="Dismiss notification" onClick={dismiss}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}