'use client';

import { getFunctionsErrorMessage } from '@/lib/firebase/functionsError';
import { useEffect, useMemo, useRef, useState } from 'react';
import CustomSelect, { type CustomSelectOption } from '@/components/ui/CustomSelect';
import { deleteCandidate, saveCandidate, validateCandidatePhoto } from '@/lib/admin/adminData';
import { candidatesForPosition } from '@/lib/election/candidates';
import { toMillis, yearLabel } from '@/lib/format';
import { initials } from '@/lib/initials';
import { sectionLettersForYear } from '@/lib/constants';
import type { Candidate, Position } from '@/lib/types';
import NoticeLine, { type Notice } from './NoticeLine';
import { scrollToTop, YEAR_LEVEL_OPTIONS } from './shared';
import type { ConfirmState } from './ConfirmDialog';

const CANDIDATE_SORT_OPTIONS = [
  { value: 'ballot', label: 'Ballot order' },
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
  { value: 'year', label: 'Year level' },
  { value: 'newest', label: 'Recently added' },
];

interface CandidateFormState {
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

function emptyCandidateForm(positionId = ''): CandidateFormState {
  return {
    id: '',
    name: '',
    positionId,
    section: '',
    yearLevel: '1',
    platform: '',
    goals: '',
    bio: '',
    party: '',
    order: '',
    active: true,
    photoPreviewUrl: '',
  };
}

interface CandidatesPanelProps {
  active: boolean;
  actorUid: string;
  candidates: Candidate[];
  positions: Position[];
  candidateProfileEditingUnlocked: boolean;
  positionOptions: CustomSelectOption[];
  onRefreshCandidates: () => Promise<void>;
  onRequestConfirm: (state: ConfirmState) => void;
}

export default function CandidatesPanel({
  active,
  actorUid,
  candidates,
  positions,
  candidateProfileEditingUnlocked,
  positionOptions,
  onRefreshCandidates,
  onRequestConfirm,
}: CandidatesPanelProps) {
  const [form, setForm] = useState<CandidateFormState>(emptyCandidateForm());
  const [photo, setPhoto] = useState<File | null>(null);
  const [message, setMessage] = useState<Notice>(null);
  const [busy, setBusy] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('ballot');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrlRef = useRef('');

  // default the position picker to the first ballot position once positions load
  useEffect(() => {
    if (positions.length > 0) {
      setForm((current) => current.positionId ? current : { ...current, positionId: positions[0].id });
    }
  }, [positions]);

  useEffect(() => () => {
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
  }, []);

  const sectionOptions = useMemo(() => {
    const year = Number(form.yearLevel || '1');
    const base = sectionLettersForYear(year).map((letter) => ({ value: `BSCS-${year}${letter}`, label: `BSCS-${year}${letter}` }));
    // keep unconventional existing sections selectable when editing older records
    if (form.section && !base.some((option) => option.value === form.section)) {
      base.unshift({ value: form.section, label: `${form.section} (current)` });
    }
    return base;
  }, [form.yearLevel, form.section]);

  const filteredCandidates = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = positions.flatMap((position) =>
      candidatesForPosition(candidates, position.id)
        .filter((candidate) => `${candidate.name} ${candidate.section} ${position.name}`.toLowerCase().includes(needle))
        .map((candidate) => ({ candidate, position })),
    );
    switch (sort) {
      case 'name-asc':
        list.sort((a, b) => a.candidate.name.localeCompare(b.candidate.name));
        break;
      case 'name-desc':
        list.sort((a, b) => b.candidate.name.localeCompare(a.candidate.name));
        break;
      case 'year':
        list.sort((a, b) => a.candidate.yearLevel - b.candidate.yearLevel || a.candidate.name.localeCompare(b.candidate.name));
        break;
      case 'newest':
        list.sort((a, b) => toMillis(b.candidate.createdAt) - toMillis(a.candidate.createdAt));
        break;
      default:
        break; // 'ballot' — flatMap already yields position order, then candidate order
    }
    return list;
  }, [search, sort, candidates, positions]);

  function resetForm() {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = '';
    }
    setForm(emptyCandidateForm(positions[0]?.id ?? ''));
    setPhoto(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function editCandidate(candidate: Candidate) {
    resetForm();
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
    setMessage(null);
    scrollToTop();
  }

  function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const validationError = validateCandidatePhoto(file);
    if (validationError) {
      setMessage({ text: validationError, error: true });
      setPhoto(null);
      return;
    }
    if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
    previewObjectUrlRef.current = file ? URL.createObjectURL(file) : '';
    setPhoto(file);
    setForm((current) => ({
      ...current,
      photoPreviewUrl: previewObjectUrlRef.current || current.photoPreviewUrl,
    }));
    setMessage(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actorUid) return;
    if (!form.positionId) {
      setMessage({ text: 'Choose a position first.', error: true });
      return;
    }
    if (!form.section) {
      setMessage({ text: 'Choose a section first.', error: true });
      return;
    }
    setBusy('save');
    setMessage(null);
    try {
      await saveCandidate({
        actorUid,
        photoFile: photo,
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
          order: form.order
            ? Number(form.order)
            : candidatesForPosition(candidates, form.positionId).length + 1,
          active: form.active,
        },
      });
      setMessage({ text: form.id ? 'Candidate updated.' : 'Candidate added.' });
      resetForm();
      await onRefreshCandidates();
    } catch (error) {
      setMessage({ text: getFunctionsErrorMessage(error), error: true });
    } finally {
      setBusy('');
    }
  }

  function requestRemove(candidate: Candidate) {
    onRequestConfirm({
      title: `Remove ${candidate.name}?`,
      body: 'This permanently deletes the candidate record and their photo. Votes already cast are not affected.',
      confirmLabel: 'Remove candidate',
      danger: true,
      action: () => void remove(candidate),
    });
  }

  async function remove(candidate: Candidate) {
    if (!actorUid) return;
    setBusy(candidate.id);
    setMessage(null);
    try {
      await deleteCandidate(candidate.id, actorUid);
      if (form.id === candidate.id) resetForm();
      setMessage({ text: 'Candidate removed.' });
      await onRefreshCandidates();
    } catch (error) {
      setMessage({ text: getFunctionsErrorMessage(error), error: true });
    } finally {
      setBusy('');
    }
  }

  return (
    <section className={`panel${active ? ' on' : ''}`} data-p="candidates">
      <div className="head">
        <div><span className="eyebrow">Manage</span><h1>Candidates</h1><p>Add and edit candidates using the live election roster.</p></div>
      </div>
      <div className="formgrid">
        <div>
          <div className="block-label"><h2>{form.id ? 'Edit candidate' : 'Add a candidate'}</h2></div>
          <form className="form" onSubmit={submit}>
            <NoticeLine notice={message} />
            <div className="two">
              <label>Full name<input required placeholder="Andrea Santos" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <CustomSelect
                label="Position"
                value={form.positionId}
                options={positionOptions}
                placeholder="Select position"
                disabled={positionOptions.length === 0 || (Boolean(form.id) && candidateProfileEditingUnlocked)}
                onChange={(positionId) => setForm((current) => ({ ...current, positionId }))}
              />
            </div>
            <div className="two">
              <CustomSelect
                label="Year level"
                value={form.yearLevel}
                options={YEAR_LEVEL_OPTIONS}
                placeholder="Select year level"
                disabled={Boolean(form.id) && candidateProfileEditingUnlocked}
                onChange={(yearLevel) => setForm((current) => {
                  // keep the section letter, retarget it to the new year (BSCS-3B → BSCS-4B)
                  const letter = /^BSCS-\d([A-Z])$/.exec(current.section)?.[1];
                  return { ...current, yearLevel, section: letter ? `BSCS-${yearLevel}${letter}` : '' };
                })}
              />
              <CustomSelect
                label="Section"
                value={form.section}
                options={sectionOptions}
                placeholder="Select section"
                disabled={Boolean(form.id) && candidateProfileEditingUnlocked}
                onChange={(section) => setForm((current) => ({ ...current, section }))}
              />
            </div>
            <label>Platform <span className="optional-label">(optional)</span><textarea placeholder="Goals and priorities…" value={form.platform} onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value }))} /></label>
            <div className="photo">
              <div className="prev">
                {form.photoPreviewUrl
                  ? <img src={form.photoPreviewUrl} alt="Candidate preview" />
                  : 'PHOTO'}
              </div>
              <label style={{ flex: 1 }}>Candidate photo<input ref={fileInputRef} type="file" accept="image/*" style={{ minHeight: 'auto', padding: '10px 12px' }} onChange={handlePhoto} /></label>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={form.active}
                disabled={Boolean(form.id) && candidateProfileEditingUnlocked}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
              />
              Active — shown on the ballot
            </label>
            <div className="head-actions">
              <button className="btn btn-primary" type="submit" disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save candidate'}</button>
              {form.id && <button className="btn btn-ghost" type="button" onClick={resetForm}>Cancel edit</button>}
            </div>
          </form>
        </div>
        <div>
          <div className="block-label"><h2>Roster</h2><small>{filteredCandidates.length} of {candidates.length} shown</small></div>
          <div className="roster-tools">
            <input className="search" aria-label="Search candidates" placeholder="Search candidates…" value={search} onChange={(event) => setSearch(event.target.value)} />
            <div className="sort-select">
              <CustomSelect
                label="Sort by"
                hideLabel
                value={sort}
                options={CANDIDATE_SORT_OPTIONS}
                placeholder="Sort by"
                onChange={setSort}
              />
            </div>
          </div>
          <div className="recs">
            {filteredCandidates.length === 0 ? (
              <div className="state-block"><strong>No candidates found</strong><small>{candidates.length ? 'Try another search.' : 'Use the form to add the first candidate.'}</small></div>
            ) : filteredCandidates.map(({ candidate, position }) => (
              <div className="rec" key={candidate.id}>
                <span className="av">{candidate.photoURL ? <img src={candidate.photoURL} alt={`${candidate.name} portrait`} style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }} /> : initials(candidate.name)}</span>
                <div>
                  <b>{candidate.name}{!candidate.active && <span className="status-pill is-draft" style={{ marginLeft: 8 }}>Hidden</span>}</b>
                  <div className="meta">{candidate.section} · {yearLabel(candidate.yearLevel)}</div>
                  <div className="party">{position.name} · {candidate.party || 'Independent'}</div>
                </div>
                <div className="acts">
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => editCandidate(candidate)}>Edit</button>
                  <button className="btn btn-danger btn-sm" type="button" disabled={busy === candidate.id} onClick={() => requestRemove(candidate)}>{busy === candidate.id ? 'Removing…' : 'Remove'}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
