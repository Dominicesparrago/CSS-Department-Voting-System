'use client';

import { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { saveCandidate, setCandidateActive, validateCandidatePhoto } from '@/lib/admin/adminData';
import { candidatesForPosition, formatYearLevel } from '@/lib/admin/adminCore';
import type { Candidate, Position } from '@/lib/types';

interface Props {
  positions: Position[];
  candidates: Candidate[];
  actorUid: string;
  onRefresh: () => Promise<void>;
}

interface FormState {
  id: string;
  name: string;
  positionId: string;
  section: string;
  yearLevel: string;
  platform: string;
  goals: string;
  bio: string;
  party: string;
  order: string;
  active: boolean;
  photoPreviewUrl: string;
}

function emptyForm(defaultPositionId = ''): FormState {
  return { id: '', name: '', positionId: defaultPositionId, section: '', yearLevel: '1', platform: '', goals: '', bio: '', party: '', order: '1', active: true, photoPreviewUrl: '' };
}

export default function CandidatesTab({ positions, candidates, actorUid, onRefresh }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm(positions[0]?.id ?? ''));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function set(field: keyof FormState, value: FormState[keyof FormState]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function reset() {
    setForm(emptyForm(positions[0]?.id ?? ''));
    setPhotoFile(null);
    setPhotoError('');
    setMessage('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function fillEdit(candidate: Candidate) {
    setForm({
      id: candidate.id,
      name: candidate.name,
      positionId: candidate.positionId,
      section: candidate.section,
      yearLevel: String(candidate.yearLevel),
      platform: candidate.platform,
      goals: candidate.goals ?? '',
      bio: candidate.bio ?? '',
      party: candidate.party ?? '',
      order: String(candidate.order ?? 1),
      active: candidate.active,
      photoPreviewUrl: candidate.photoURL ?? '',
    });
    setPhotoFile(null);
    setPhotoError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    const err = validateCandidatePhoto(file);
    setPhotoError(err);
    if (file && !err) {
      setForm((prev) => ({ ...prev, photoPreviewUrl: URL.createObjectURL(file) }));
      setPhotoFile(file);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateCandidatePhoto(photoFile);
    if (err) { setPhotoError(err); return; }
    setBusy('save');
    setMessage('');
    try {
      await saveCandidate({
        actorUid,
        photoFile,
        candidate: {
          id: form.id || undefined,
          positionId: form.positionId,
          name: form.name,
          section: form.section,
          yearLevel: Number(form.yearLevel),
          platform: form.platform,
          goals: form.goals,
          bio: form.bio,
          party: form.party,
          order: Number(form.order),
          active: form.active,
        },
      });
      setMessage('Candidate saved.');
      reset();
      await onRefresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function handleToggle(candidate: Candidate) {
    setBusy(candidate.id);
    try {
      await setCandidateActive(candidate.id, !candidate.active, actorUid);
      await onRefresh();
    } finally {
      setBusy('');
    }
  }

  const grouped = positions.flatMap((position) =>
    candidatesForPosition(candidates, position.id).map((candidate) => ({ candidate, position })),
  );

  return (
    <section className="admin-section is-active" data-admin-panel="candidates">
      <div className="admin-grid">
        <form id="candidate-form" className="admin-card form-stack" onSubmit={handleSubmit}>
          <div>
            <h2 id="candidate-form-title">{form.id ? 'Edit candidate' : 'Add candidate'}</h2>
            {message && <p className="form-message" id="candidate-message">{message}</p>}
          </div>

          <label>Name <input required autoComplete="off" value={form.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label>
            Position
            <select required value={form.positionId} onChange={(e) => set('positionId', e.target.value)}>
              {positions.map((p) => <option key={p.id} value={p.id}>{p.order}. {p.name}</option>)}
            </select>
          </label>

          <div className="two-col">
            <label>Section <input required autoComplete="off" value={form.section} onChange={(e) => set('section', e.target.value)} /></label>
            <label>
              Year level
              <select required value={form.yearLevel} onChange={(e) => set('yearLevel', e.target.value)}>
                {['1','2','3','4'].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>

          <label>Platform <textarea required rows={4} value={form.platform} onChange={(e) => set('platform', e.target.value)} /></label>
          <label>Goals <textarea rows={3} placeholder="Optional — campaign goals" value={form.goals} onChange={(e) => set('goals', e.target.value)} /></label>
          <label>Biography <textarea rows={3} placeholder="Optional — short biography" value={form.bio} onChange={(e) => set('bio', e.target.value)} /></label>
          <label>Party <input autoComplete="off" placeholder="Optional" value={form.party} onChange={(e) => set('party', e.target.value)} /></label>

          <div className="two-col">
            <label>Display order <input type="number" min={1} required value={form.order} onChange={(e) => set('order', e.target.value)} /></label>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
              Active
            </label>
          </div>

          <label>
            Candidate photo
            <div className="photo-field">
              {form.photoPreviewUrl ? (
                <img id="candidate-photo-preview" className="image-preview" src={form.photoPreviewUrl} alt="" />
              ) : (
                <span className="image-preview is-empty" data-empty-text="No image"><ImagePlus size={28} opacity={0.4} /></span>
              )}
              <input ref={fileRef} id="candidate-photo" type="file" accept="image/*" onChange={handlePhotoChange} />
            </div>
            {photoError && <span className="field-error" id="candidate-photo-error">{photoError}</span>}
          </label>

          <div className="action-row">
            <button className="btn btn-primary" id="candidate-save-button" type="submit" disabled={busy === 'save'}>
              {busy === 'save' ? 'Saving...' : 'Save candidate'}
            </button>
            <button className="btn btn-ghost" id="candidate-reset-button" type="button" onClick={reset}>Clear</button>
          </div>
        </form>

        <article className="admin-card">
          <div className="section-title-row">
            <h2>Candidates</h2>
            <span id="candidate-list-count" className="table-note">{candidates.length} records</span>
          </div>
          <div id="candidate-list" className="record-list">
            {grouped.length === 0 ? (
              <div className="state-block">
                <strong>No candidates yet</strong>
                <small>Use the form to add your first candidate.</small>
              </div>
            ) : (
              grouped.map(({ candidate, position }) => (
                <article key={candidate.id} className="candidate-admin-card">
                  {candidate.photoURL
                    ? <img src={candidate.photoURL} alt="" />
                    : <span className="avatar-placeholder" aria-hidden="true">{candidate.name.slice(0,1).toUpperCase()}</span>
                  }
                  <div>
                    <strong>{candidate.name}</strong>
                    <span>{position.name} · {candidate.section} · {formatYearLevel(candidate.yearLevel)}</span>
                    <p>{candidate.platform}</p>
                    {candidate.party && <small>{candidate.party}</small>}
                  </div>
                  <div className="mini-actions">
                    <button className="btn btn-ghost" type="button" onClick={() => fillEdit(candidate)}>Edit</button>
                    <button className="btn btn-ghost" type="button" disabled={busy === candidate.id} onClick={() => handleToggle(candidate)}>
                      {busy === candidate.id ? 'Working...' : candidate.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
