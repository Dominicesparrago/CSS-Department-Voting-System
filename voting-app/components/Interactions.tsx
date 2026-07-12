'use client';

import { useEffect } from 'react';

export default function Interactions() {
  useEffect(() => {
    let ringObserver: MutationObserver | null = null;
    let onScroll: (() => void) | null = null;
    let nav: HTMLElement | null = null;
    const spotCleanups: (() => void)[] = [];

    const timer = window.setTimeout(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

      // drifting background blobs
      if (!reduceMotion && !document.querySelector('.bg-blobs')) {
        const layer = document.createElement('div');
        layer.className = 'bg-blobs';
        layer.setAttribute('aria-hidden', 'true');
        layer.innerHTML = '<span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>';
        document.body.prepend(layer);
      }

      // cursor-follow card spotlight (desktop fine-pointer only)
      if (finePointer) {
        document.querySelectorAll<HTMLElement>('[data-spot]').forEach((card) => {
          const onMove = (event: PointerEvent) => {
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
            card.style.setProperty('--my', `${event.clientY - rect.top}px`);
          };
          card.addEventListener('pointermove', onMove);
          spotCleanups.push(() => card.removeEventListener('pointermove', onMove));
        });
      }

      // nav shrink on scroll
      nav = document.querySelector<HTMLElement>('#site-nav');
      if (nav) {
        onScroll = () => nav?.classList.toggle('shrink', window.scrollY > 24);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
      }

      // ballot progress ring
      const label = document.querySelector<HTMLElement>('#ballot-progress');
      const ring = document.querySelector<HTMLElement>('[data-progress-ring]');
      if (label && ring) {
        const sync = () => {
          const match = /(\d+)\s+of\s+(\d+)/i.exec(label.textContent ?? '');
          if (!match) return;
          const done = Number(match[1]);
          const total = Number(match[2]) || 1;
          const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
          ring.style.setProperty('--p', String(pct));
          const out = ring.querySelector<HTMLElement>('[data-progress-value]');
          if (out) out.textContent = `${pct}%`;
        };
        sync();
        ringObserver = new MutationObserver(sync);
        ringObserver.observe(label, { childList: true, characterData: true, subtree: true });
      }
    }, 75);

    return () => {
      window.clearTimeout(timer);
      spotCleanups.forEach((fn) => fn());
      if (nav && onScroll) window.removeEventListener('scroll', onScroll);
      ringObserver?.disconnect();
      document.querySelector('.bg-blobs')?.remove();
    };
  }, []);

  return null;
}
