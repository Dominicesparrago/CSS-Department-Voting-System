'use client';

import { useEffect } from 'react';

export default function Interactions() {
  useEffect(() => {
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

    // scroll reveal
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-revealed'));
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-revealed');
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
      );
      targets.forEach((el) => observer.observe(el));
    }

    // cursor-follow card spotlight (desktop fine-pointer only)
    const spotCleanups: (() => void)[] = [];
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
    const nav = document.querySelector<HTMLElement>('#site-nav');
    let onScroll: (() => void) | null = null;
    if (nav) {
      onScroll = () => nav.classList.toggle('shrink', window.scrollY > 24);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // ballot progress ring
    const label = document.querySelector<HTMLElement>('#ballot-progress');
    const ring = document.querySelector<HTMLElement>('[data-progress-ring]');
    let ringObserver: MutationObserver | null = null;
    if (label && ring) {
      const sync = () => {
        const match = /(\d+)\s+of\s+(\d+)/i.exec(label.textContent ?? '');
        if (!match) return;
        const done = Number(match[1]);
        const total = Number(match[2]) || 1;
        const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
        ring!.style.setProperty('--p', String(pct));
        const out = ring!.querySelector<HTMLElement>('[data-progress-value]');
        if (out) out.textContent = `${pct}%`;
      };
      sync();
      ringObserver = new MutationObserver(sync);
      ringObserver.observe(label, { childList: true, characterData: true, subtree: true });
    }

    return () => {
      spotCleanups.forEach((fn) => fn());
      if (nav && onScroll) window.removeEventListener('scroll', onScroll);
      ringObserver?.disconnect();
      document.querySelector('.bg-blobs')?.remove();
    };
  }, []);

  return null;
}
