'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export default function BinaryRain({ id }: { id?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    // pages that render their own #rain instance (admin, dashboard) take precedence;
    // the layout instance stands down — re-checked on every route change
    if (!id && document.getElementById('rain')) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let width = 0;
    let height = 0;
    let columns: number[] = [];
    const fontSize = 15;
    const glyphs = ['0', '1'];
    let rafId = 0;
    let last = 0;
    const styles = window.getComputedStyle(document.documentElement);
    const brand = styles.getPropertyValue('--brand').trim();
    const sparkle = styles.getPropertyValue('--tint-400').trim();
    const mono = styles.getPropertyValue('--font-jetbrains-mono').trim();

    // dimmed brand glyphs read as background texture, not content (mockup parity)
    const hexMatch = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(brand);
    const brandDim = hexMatch
      ? `rgba(${parseInt(hexMatch[1], 16)}, ${parseInt(hexMatch[2], 16)}, ${parseInt(hexMatch[3], 16)}, 0.5)`
      : 'rgba(34, 184, 160, 0.5)';

    function resize() {
      const scale = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.floor(width * scale);
      canvas!.height = Math.floor(height * scale);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(scale, 0, 0, scale, 0, 0);
      // drops start above the viewport and fall in, instead of popping mid-screen
      columns = Array.from({ length: Math.ceil(width / fontSize) }, () => Math.random() * -height);
    }

    function draw(time: number) {
      if (time - last > 64) {
        last = time;
        // translucent fill instead of clearRect: previous glyphs decay into fading trails
        ctx!.fillStyle = 'rgba(10, 14, 15, 0.2)';
        ctx!.fillRect(0, 0, width, height);
        ctx!.font = `${fontSize}px ${mono || 'ui-monospace'}, monospace`;

        columns.forEach((y, i) => {
          const x = i * fontSize;
          const glyph = glyphs[(Math.random() * glyphs.length) | 0];
          ctx!.fillStyle = Math.random() < 0.04 ? sparkle : brandDim;
          ctx!.fillText(glyph, x, y);
          // probabilistic reset staggers the columns so restarts never sync up
          columns[i] = y > height && Math.random() > 0.975 ? 0 : y + fontSize;
        });
      }

      rafId = window.requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    rafId = window.requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(rafId);
    };
  }, [id, pathname]);

  return (
    <canvas
      id={id}
      ref={canvasRef}
      className="binary-rain"
      aria-hidden="true"
    />
  );
}
