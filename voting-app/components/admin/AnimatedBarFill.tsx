'use client';

import { useEffect, useState } from 'react';

export default function AnimatedBarFill({ width }: { width: number }) {
  const [visibleWidth, setVisibleWidth] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisibleWidth(width);
      return;
    }

    setVisibleWidth(0);
    const frame = window.requestAnimationFrame(() => setVisibleWidth(width));
    return () => window.cancelAnimationFrame(frame);
  }, [width]);

  return <div className="fill" data-w={width} style={{ width: `${visibleWidth}%` }} />;
}
