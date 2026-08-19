'use client';

import { TriangleAlert } from 'lucide-react';

interface LiveDataStatusProps {
  loading: boolean;
  error?: string;
}

/** Live election data status: spinner row while loading, alert row on failure. */
export default function LiveDataStatus({ loading, error }: LiveDataStatusProps) {
  if (error) {
    return (
      <div className="live-data-status is-error" role="alert">
        <TriangleAlert size={16} aria-hidden="true" />
        <span>{error}</span>
      </div>
    );
  }
  if (!loading) return null;
  return (
    <div className="live-data-status" role="status" aria-live="polite">
      <span className="live-data-status__spinner" aria-hidden="true" />
      <span>Loading live election data…</span>
    </div>
  );
}