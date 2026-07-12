'use client';

import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 420;

export default function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      prevValue.current = value;
      return;
    }

    const from = prevValue.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      setDisplay(Math.floor(from + (to - from) * progress));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevValue.current = to;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return <>{display}</>;
}
