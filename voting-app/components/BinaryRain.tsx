'use client';

import { useEffect, useRef } from 'react';

export default function BinaryRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
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

    function resize() {
      const scale = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.floor(width * scale);
      canvas!.height = Math.floor(height * scale);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(scale, 0, 0, scale, 0, 0);
      columns = Array.from({ length: Math.ceil(width / fontSize) }, () => Math.random() * height);
    }

    function draw() {
      ctx!.fillStyle = 'rgba(10, 14, 15, 0.14)';
      ctx!.fillRect(0, 0, width, height);
      ctx!.font = `${fontSize}px "JetBrains Mono", ui-monospace, monospace`;

      columns.forEach((y, i) => {
        const x = i * fontSize;
        const glyph = glyphs[(Math.random() * glyphs.length) | 0];
        const roll = Math.random();
        ctx!.fillStyle = roll > 0.93 ? '#3bd6b0' : roll > 0.78 ? '#1cabb8' : '#22b8a0';
        ctx!.fillText(glyph, x, y);
        columns[i] = y > height + Math.random() * 900 ? 0 : y + fontSize;
      });

      rafId = window.requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="binary-rain"
      aria-hidden="true"
    />
  );
}
