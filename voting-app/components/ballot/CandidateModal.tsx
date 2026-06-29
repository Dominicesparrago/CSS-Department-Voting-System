'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Candidate, Position } from '@/lib/types';

interface Props {
  position: Position | null;
  candidate: Candidate | null;
  onClose: () => void;
}

function placeholderAvatar(name: string): string {
  const initial = encodeURIComponent((name || '?').slice(0, 1).toUpperCase());
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='24' fill='%231c2b2d'/%3E%3Ctext x='50%25' y='54%25' text-anchor='middle' dominant-baseline='middle' font-family='Figtree, Arial' font-size='72' font-weight='800' fill='%2322b8a0'%3E${initial}%3C/text%3E%3C/svg%3E`;
}

export default function CandidateModal({ position, candidate, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(candidate);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!candidate || !position) return null;

  return (
    <div
      className="modal-backdrop"
      id="candidate-modal"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="candidate-modal-name">
        <button
          ref={closeRef}
          className="modal-close"
          type="button"
          id="candidate-modal-close"
          aria-label="Close candidate information"
          onClick={onClose}
        >
          <X size={18} />
        </button>

        <div className="candidate-modal-hero">
          <img
            id="candidate-modal-photo"
            src={candidate.photoURL || placeholderAvatar(candidate.name)}
            alt={`${candidate.name} profile photo`}
          />
          <div>
            <h2 id="candidate-modal-name">{candidate.name}</h2>
            <p className="candidate-modal-pos" id="candidate-modal-position">{position.name}</p>
          </div>
          <div className="candidate-modal-chips" id="candidate-modal-chips">
            {candidate.section && <span className="chip">Section {candidate.section}</span>}
            {candidate.yearLevel && <span className="chip">Year {candidate.yearLevel}</span>}
            {candidate.party && <span className="chip party">{candidate.party}</span>}
          </div>
        </div>

        <div className="candidate-modal-body">
          <div className="modal-field">
            <h3>Platform</h3>
            <p id="candidate-modal-platform" className={!candidate.platform ? 'muted' : ''}>
              {candidate.platform || 'Not provided.'}
            </p>
          </div>
          <div className="modal-field">
            <h3>Goals</h3>
            <p id="candidate-modal-goals" className={!candidate.goals ? 'muted' : ''}>
              {candidate.goals || 'Not provided.'}
            </p>
          </div>
          <div className="modal-field">
            <h3>Biography</h3>
            <p id="candidate-modal-bio" className={!candidate.bio ? 'muted' : ''}>
              {candidate.bio || 'Not provided.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
