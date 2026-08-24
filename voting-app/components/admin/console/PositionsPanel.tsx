'use client';

import { getFunctionsErrorMessage } from '@/lib/firebase/functionsError';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import NoticeLine, { type Notice } from '@/components/admin/console/NoticeLine';
import { deletePosition, savePosition } from '@/lib/superadmin/positions';
import { yearLabel } from '@/lib/format';
import type { Position } from '@/lib/types';

export default function PositionsPanel({ positions }: { positions: Position[] }) {
  const [name, setName] = useState('');
  const [maxSelections, setMaxSelections] = useState(1);
  const [order, setOrder] = useState(positions.length + 1);
  const [scope, setScope] = useState<'department' | 'year'>('department');
  const [yearLevel, setYearLevel] = useState(1);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice>(null);

  const nameReady = name.trim().length >= 2;

  async function create() {
    if (!nameReady || busy) return;
    setBusy('create');
    setNotice(null);
    try {
      const result = await savePosition({ name: name.trim(), maxSelections, order, scope, yearLevel });
      setNotice({ text: `Position created (${result.id}).` });
      setName('');
      setMaxSelections(1);
      setOrder(positions.length + 2);
    } catch (error) {
      setNotice({ text: getFunctionsErrorMessage(error), error: true });
    } finally {
      setBusy('');
    }
  }

  async function toggleActive(position: Position) {
    if (busy) return;
    setBusy(`active-${position.id}`);
    setNotice(null);
    try {
      await savePosition({ id: position.id, name: position.name, maxSelections: position.maxSelections ?? 1, order: position.order, active: !position.active });
      setNotice({ text: `Position ${position.active ? 'deactivated' : 'activated'}.` });
    } catch (error) {
      setNotice({ text: getFunctionsErrorMessage(error), error: true });
    } finally {
      setBusy('');
    }
  }

  async function remove(position: Position) {
    if (busy) return;
    const confirmed = window.confirm(`Delete position "${position.name}"? Refused if candidates or ballots reference it.`);
    if (!confirmed) return;
    setBusy(`delete-${position.id}`);
    setNotice(null);
    try {
      await deletePosition({ id: position.id });
      setNotice({ text: `Position deleted.` });
    } catch (error) {
      setNotice({ text: getFunctionsErrorMessage(error), error: true });
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Ballot structure</span>
          <h1>Positions</h1>
          <p>{positions.length} positions on the ballot. Deactivate a position to remove it from voting without losing its history; delete only works while nothing references it.</p>
        </div>
      </header>
      <NoticeLine notice={notice} />

      <div className="block-label">
        <h2>New position</h2>
        <small>slug id is derived from the name (edit the doc to rename)</small>
      </div>
      <form
        className="two-col"
        onSubmit={(event) => { event.preventDefault(); void create(); }}
      >
        <label className="field">
          <span>Name</span>
          <input value={name} placeholder="e.g. CSS President" onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="two-col">
          <label className="field">
            <span>Scope</span>
            <select value={scope} onChange={(event) => setScope(event.target.value as 'department' | 'year')}>
              <option value="department">Department-wide</option>
              <option value="year">Year representative</option>
            </select>
          </label>
          {scope === 'year' && (
            <label className="field">
              <span>Year level</span>
              <select value={yearLevel} onChange={(event) => setYearLevel(Number(event.target.value))}>
                {[1, 2, 3, 4].map((year) => <option key={year} value={year}>{yearLabel(year)}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="two-col">
          <label className="field">
            <span>Max selections</span>
            <input
              type="number"
              min={1}
              max={10}
              value={maxSelections}
              onChange={(event) => setMaxSelections(Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span>Ballot order</span>
            <input type="number" min={1} value={order} onChange={(event) => setOrder(Number(event.target.value))} />
          </label>
        </div>
        <div className="field">
          <span aria-hidden="true">&nbsp;</span>
          <button className="btn btn-primary" type="submit" disabled={!nameReady || busy === 'create'}>
            <Plus size={14} style={{ marginRight: 6 }} />
            {busy === 'create' ? 'Creating…' : 'Create position'}
          </button>
        </div>
      </form>

      <div className="superadmin-list" aria-label="Positions">
        <div className="block-label">
          <h2>All positions</h2>
          <small>{positions.length} total</small>
        </div>
        {positions.length === 0 ? (
          <div className="state-block">
            <strong>No positions yet</strong>
            <small>Create the first position above.</small>
          </div>
        ) : (
          [...positions].sort((a, b) => a.order - b.order).map((position) => (
            <div className="superadmin-row" key={position.id}>
              <div>
                <strong>{position.order}. {position.name}</strong>
                <p>{position.id} · max {position.maxSelections ?? 1} · {position.scope}{position.scope === 'year' && position.yearLevel ? ` ${position.yearLevel}` : ''}</p>
              </div>
              <div className="superadmin-actions">
                <span className={`tag${position.active === false ? '' : ' active'}`}>{position.active === false ? 'inactive' : 'active'}</span>
                <button className="btn btn-ghost btn-sm" type="button" disabled={busy === `active-${position.id}`} onClick={() => void toggleActive(position)}>
                  {position.active === false ? 'Activate' : 'Deactivate'}
                </button>
                <button className="btn btn-danger btn-sm" type="button" disabled={busy === `delete-${position.id}`} onClick={() => void remove(position)}>
                  <Trash2 size={14} style={{ marginRight: 6 }} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}