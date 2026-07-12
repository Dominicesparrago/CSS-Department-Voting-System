'use client';

import { useEffect, useRef } from 'react';

export interface ConfirmState {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  action: () => void;
}

/** Accessible confirmation dialog for destructive / high-impact admin actions. */
export default function ConfirmDialog({ state, onCancel }: { state: ConfirmState | null; onCancel: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!state) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button') ?? []);
      if (focusable.length === 0) return;
      const direction = event.shiftKey ? -1 : 1;
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      focusable[(currentIndex + direction + focusable.length) % focusable.length]?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [state, onCancel]);

  if (!state) return null;

  return (
    <div className="dlg-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div ref={panelRef} className="dlg" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body">
        <h2 id="confirm-title">{state.title}</h2>
        <p id="confirm-body">{state.body}</p>
        <div className="dlg-actions">
          <button ref={cancelRef} className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>Cancel</button>
          <button
            className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'} btn-sm`}
            type="button"
            onClick={() => { const run = state.action; onCancel(); run(); }}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
