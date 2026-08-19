'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, SearchX, ShieldCheck, Trash2, Upload, UserCheck, Users, Vote } from 'lucide-react';
import CustomSelect, { type CustomSelectOption } from '@/components/ui/CustomSelect';
import { buildRosterTemplateCsv, normalizeName, parseRosterFile, rosterToCsv } from '@/lib/admin/rosterImport';
import { importRosterRows, removeAllRosterStudents, removeRosterStudents, setEligibleSections } from '@/lib/admin/rosterData';
import { ELECTION_ID } from '@/lib/constants';
import { yearLabel } from '@/lib/format';
import type { Election, RosterImportSummary, RosterStudent, Voter } from '@/lib/types';
import NoticeLine, { type Notice } from './NoticeLine';
import type { ConfirmState } from './ConfirmDialog';
import { downloadFile } from './shared';

const PAGE_SIZE = 50;
const PAGE_STEP = 100;

interface RosterPanelProps {
  active: boolean;
  actorUid: string;
  students: RosterStudent[];
  voters: Voter[];
  election: Election | null;
  loading: boolean;
  onRefreshStudents: () => Promise<void>;
  onRequestConfirm: (state: ConfirmState) => void;
}

type StatusFilter = 'all' | 'active' | 'inactive';

const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

export default function RosterPanel({
  active,
  actorUid,
  students,
  voters,
  election,
  loading,
  onRefreshStudents,
  onRequestConfirm,
}: RosterPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [summary, setSummary] = useState<RosterImportSummary | null>(null);
  const [busy, setBusy] = useState('');
  const [replace, setReplace] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sectionFilter, setSectionFilter] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [sectionsText, setSectionsText] = useState('');
  const [sectionsDirty, setSectionsDirty] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // participation comes from the voter registry (account-level lock), joined
  // by student number, or by section + normalized name for masterlist rows —
  // the roster itself never learns what anyone voted for
  const participatedByKey = useMemo(() => {
    const map = new Map<string, boolean>();
    voters.forEach((voter) => {
      if (voter.hasVoted?.[ELECTION_ID] !== true) return;
      if (voter.studentNo) map.set(`id:${voter.studentNo}`, true);
      if (voter.section && voter.fullName) map.set(`name:${voter.section}|${normalizeName(voter.fullName)}`, true);
    });
    return map;
  }, [voters]);

  const participationKey = (student: RosterStudent) =>
    student.studentNo
      ? `id:${student.studentNo}`
      : `name:${student.section}|${normalizeName(student.fullName)}`;
  const hasParticipated = (student: RosterStudent) => participatedByKey.get(participationKey(student)) === true;

  const sectionOptions = useMemo<CustomSelectOption[]>(() => {
    const sections = Array.from(new Set(students.map((s) => s.section))).sort();
    return sections.map((section) => ({ value: section, label: section }));
  }, [students]);

  // sync the eligible-sections editor with the election unless the admin is mid-edit
  useEffect(() => {
    if (sectionsDirty) return;
    setSectionsText((election?.eligibleSections ?? []).join(', '));
  }, [election?.eligibleSections, sectionsDirty]);

  // drop selections that no longer exist after the roster refreshes
  useEffect(() => {
    const ids = new Set(students.map((s) => s.id));
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (ids.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [students]);

  const activeCount = students.filter((s) => s.status === 'active').length;
  const eligibleCount = students.filter((s) => s.eligible).length;
  const votedCount = students.filter(hasParticipated).length;

  const filteredStudents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students.filter((student) => {
      if (statusFilter === 'active' && student.status !== 'active') return false;
      if (statusFilter === 'inactive' && student.status !== 'inactive') return false;
      if (sectionFilter && student.section !== sectionFilter) return false;
      return `${student.studentNo} ${student.fullName} ${student.section}`.toLowerCase().includes(needle);
    });
  }, [search, statusFilter, sectionFilter, students]);
  const visibleStudents = filteredStudents.slice(0, limit);

  const visibleIds = visibleStudents.map((s) => s.id);
  const allVisibleSelected = visibleStudents.length > 0 && visibleStudents.every((s) => selected.has(s.id));
  const someVisibleSelected = visibleStudents.length > 0 && visibleStudents.some((s) => selected.has(s.id));
  const anyRemovalBusy = busy === 'remove' || busy === 'removeSelected' || busy === 'removeAll';

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected]);

  function resetSelection() {
    setSelected(new Set());
  }

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
    setSectionFilter('');
    setLimit(PAGE_SIZE);
    resetSelection();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function showMore() {
    const el = scrollRef.current;
    setLimit((current) => current + PAGE_STEP);
    // reveal the newly loaded rows inside the contained scroller
    requestAnimationFrame(() => {
      if (!el) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
    });
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('import');
    setNotice(null);
    setSummary(null);
    resetSelection();
    try {
      const { rows } = await parseRosterFile(file);
      if (rows.length === 0) throw new Error('The file has no data rows to import.');
      const result = await importRosterRows({ rows, replace });
      setSummary(result);
      setNotice({
        text: `Imported ${result.inserted + result.updated} of ${result.total} rows.${result.rejected > 0 ? ` ${result.rejected} rejected.` : ''}`,
        error: result.rejected > 0,
      });
      await onRefreshStudents();
    } catch (error) {
      setNotice({ text: (error as Error).message || 'Unable to import the roster.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function saveEligibleSections() {
    if (!actorUid) return;
    setBusy('sections');
    setNotice(null);
    try {
      const sections = sectionsText.split(',').map((section) => section.trim()).filter(Boolean);
      await setEligibleSections(sections, actorUid);
      setSectionsDirty(false);
      setNotice({ text: sections.length ? `Voting is now limited to ${sections.length} section${sections.length === 1 ? '' : 's'}.` : 'All active roster students are eligible again.' });
    } catch (error) {
      setNotice({ text: (error as Error).message || 'Unable to save eligible sections.', error: true });
    } finally {
      setBusy('');
    }
  }

  function exportCsv() {
    downloadFile(`css-roster-${ELECTION_ID}.csv`, rosterToCsv(filteredStudents, hasParticipated), 'text/csv;charset=utf-8');
  }

  function requestRemove(student: RosterStudent) {
    const label = student.studentNo ? `${student.fullName} (${student.studentNo})` : `${student.fullName} (${student.section})`;
    onRequestConfirm({
      title: `Remove ${label}?`,
      body: 'This student will no longer be able to vote. Removal is permanent.',
      confirmLabel: 'Remove student',
      danger: true,
      action: () => void removeStudent(student),
    });
  }

  async function removeStudent(student: RosterStudent) {
    setBusy('remove');
    setNotice(null);
    try {
      const deleted = await removeRosterStudents([student.id]);
      setSelected((prev) => {
        if (!prev.has(student.id)) return prev;
        const next = new Set(prev);
        next.delete(student.id);
        return next;
      });
      setNotice({ text: `Removed ${deleted} student${deleted === 1 ? '' : 's'} from the roster.` });
      await onRefreshStudents();
    } catch (error) {
      setNotice({ text: (error as Error).message || 'Unable to remove this student.', error: true });
    } finally {
      setBusy('');
    }
  }

  function requestRemoveSelected() {
    const count = selected.size;
    if (count === 0) return;
    onRequestConfirm({
      title: `Remove ${count} selected student${count === 1 ? '' : 's'}?`,
      body: 'Each selected student will no longer be able to vote. Removal is permanent.',
      confirmLabel: `Remove ${count} student${count === 1 ? '' : 's'}`,
      danger: true,
      action: () => void removeSelected(),
    });
  }

  async function removeSelected() {
    setBusy('removeSelected');
    setNotice(null);
    try {
      const deleted = await removeRosterStudents(Array.from(selected));
      resetSelection();
      setNotice({ text: `Removed ${deleted} student${deleted === 1 ? '' : 's'} from the roster.` });
      await onRefreshStudents();
    } catch (error) {
      setNotice({ text: (error as Error).message || 'Unable to remove the selected students.', error: true });
    } finally {
      setBusy('');
    }
  }

  function requestRemoveAll() {
    const count = students.length;
    if (count === 0) return;
    onRequestConfirm({
      title: `Remove all ${count} students?`,
      body: 'This cannot be undone — every student will no longer be able to vote.',
      confirmLabel: 'Remove all students',
      danger: true,
      action: () => void removeAll(),
    });
  }

  async function removeAll() {
    setBusy('removeAll');
    setNotice(null);
    try {
      const deleted = await removeAllRosterStudents();
      resetSelection();
      setNotice({ text: `Removed all ${deleted} students from the roster.` });
      await onRefreshStudents();
    } catch (error) {
      setNotice({ text: (error as Error).message || 'Unable to remove the roster.', error: true });
    } finally {
      setBusy('');
    }
  }

  const importSummaryFacts: Array<[string, number]> = [
    ['Imported', summary ? summary.inserted + summary.updated : 0],
    ['New', summary?.inserted ?? 0],
    ['Updated', summary?.updated ?? 0],
    ['Duplicates', summary?.duplicates ?? 0],
    ['Invalid', summary?.invalid ?? 0],
    ['Missing fields', summary?.missingRequired ?? 0],
    ['Rejected', summary?.rejected ?? 0],
    ['Deactivated', summary?.deactivated ?? 0],
  ];

  return (
    <section className={`panel${active ? ' on' : ''}`} data-p="roster">
      <div className="head">
        <div>
          <span className="eyebrow">Official roster</span>
          <h1>Roster</h1>
          <p>{students.length} on file · {activeCount} active · {eligibleCount} eligible · {votedCount} participated.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-ghost btn-sm" type="button" disabled={filteredStudents.length === 0} onClick={exportCsv}>
            Export CSV
          </button>
          <button className="btn btn-danger btn-sm" type="button" disabled={students.length === 0 || busy === 'removeAll'} onClick={requestRemoveAll}>
            <Trash2 size={14} aria-hidden="true" />
            {busy === 'removeAll' ? 'Removing…' : 'Remove all'}
          </button>
          <button className="btn btn-primary btn-sm" type="button" disabled={busy === 'import'} onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} aria-hidden="true" />
            {busy === 'import' ? 'Importing…' : 'Import roster'}
          </button>
        </div>
      </div>

      <div className="metrics" aria-label="Roster summary">
        <div className="metric"><span className="ic"><Users size={24} aria-hidden="true" /></span><div><div className="num grad">{students.length}</div><div className="lbl">On file</div></div></div>
        <div className="metric"><span className="ic"><UserCheck size={24} aria-hidden="true" /></span><div><div className="num grad">{activeCount}</div><div className="lbl">Active</div></div></div>
        <div className="metric"><span className="ic"><ShieldCheck size={24} aria-hidden="true" /></span><div><div className="num grad">{eligibleCount}</div><div className="lbl">Eligible</div></div></div>
        <div className="metric"><span className="ic"><Vote size={24} aria-hidden="true" /></span><div><div className="num grad">{votedCount}</div><div className="lbl">Participated</div></div></div>
      </div>

      <div className="roster-grid">
        <div>
          <div className="roster-block">
            <div className="block-label"><h2>Import roster</h2><small>The official file is the source of truth for eligibility</small></div>
            <form className="form" onSubmit={(event) => event.preventDefault()}>
              <NoticeLine notice={notice} />
              <label className={`drop-zone${busy === 'import' ? ' disabled' : ''}`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={busy === 'import'}
                  onChange={handleImport}
                />
                <span className="dz-ic" aria-hidden="true"><Upload size={18} /></span>
                <span className="dz-t">
                  <b>{busy === 'import' ? 'Importing…' : 'Choose a roster file'}</b>
                  <small>Excel (.xlsx/.xls) or CSV with a Student ID, Full Name and Section column.</small>
                  <span className="dz-btn">{busy === 'import' ? 'Parsing…' : 'Browse files'}</span>
                </span>
              </label>
              <label className="check-row">
                <input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />
                Mark students missing from the file as inactive
              </label>
              <div className="head-actions">
                <button className="btn btn-ghost" type="button" onClick={() => downloadFile('css-roster-template.csv', buildRosterTemplateCsv(), 'text/csv;charset=utf-8')}>
                  <Download size={16} aria-hidden="true" />
                  Download template
                </button>
              </div>
            </form>

            {summary && (
              <div className="import-summary">
                <div className="block-label"><h2>Import results</h2><small>{summary.total} rows processed by the server</small></div>
                <div className="facts">
                  {importSummaryFacts.map(([label, value]) => (
                    <div className="fact" key={label}>
                      <span className={`num${label === 'Rejected' && value > 0 ? ' warn' : ''}${label === 'Imported' ? ' grad' : ''}`}>{value}</span>
                      <span className="lbl">{label}</span>
                    </div>
                  ))}
                </div>
                {summary.errors.length > 0 && (
                  <details className="rej-details">
                    <summary className="rej-toggle">Show {summary.errors.length} rejected row{summary.errors.length === 1 ? '' : 's'}</summary>
                    <div className="twrap" style={{ marginTop: 8 }}>
                      <table>
                        <thead><tr><th scope="col">Row</th><th scope="col">Student ID</th><th scope="col">Reason</th></tr></thead>
                        <tbody>
                          {summary.errors.map((error) => (
                            <tr key={`${error.row}-${error.reason}`}>
                              <td>{error.row}</td>
                              <td>{error.studentNo || '—'}</td>
                              <td>{error.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>

          <div className="roster-block">
            <div className="block-label"><h2>Eligible sections</h2><small>Leave empty to allow every active student</small></div>
            <form className="form" onSubmit={(event) => { event.preventDefault(); void saveEligibleSections(); }}>
              <label>Voting is limited to these sections<input placeholder="BSCS-3A, BSCS-3B, BSCS-3C" value={sectionsText} onChange={(event) => { setSectionsText(event.target.value); setSectionsDirty(true); }} /></label>
              <div className="head-actions">
                <button className="btn btn-primary" type="submit" disabled={busy === 'sections'}>
                  {busy === 'sections' ? 'Saving…' : 'Save sections'}
                </button>
                {sectionsDirty && (
                  <button className="btn btn-ghost" type="button" onClick={() => { setSectionsDirty(false); setSectionsText((election?.eligibleSections ?? []).join(', ')); }}>
                    Revert
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        <div className="roster-browse">
          <div className="block-label"><h2>Students</h2><small>{filteredStudents.length} of {students.length} shown</small></div>
          <div className="roster-toolbar">
            <input className="search" aria-label="Search students by ID or name" placeholder="Search ID or name…" value={search} onChange={(event) => { setSearch(event.target.value); setLimit(PAGE_SIZE); resetSelection(); }} />
            <div className="sort-select">
              <CustomSelect
                label="Section"
                hideLabel
                value={sectionFilter}
                options={sectionOptions}
                placeholder="All sections"
                onChange={(section) => { setSectionFilter(section); setLimit(PAGE_SIZE); resetSelection(); }}
              />
            </div>
            <div className="pos-switch" role="group" aria-label="Filter students by status">
              {STATUS_TABS.map(({ key, label }) => (
                <button key={key} className={statusFilter === key ? 'on' : ''} type="button" aria-pressed={statusFilter === key} onClick={() => { setStatusFilter(key); setLimit(PAGE_SIZE); resetSelection(); }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {selected.size > 0 && (
            <div className="roster-bulkbar">
              <span aria-live="polite"><b>{selected.size}</b> selected</span>
              <div className="head-actions">
                <button className="btn btn-ghost btn-sm" type="button" disabled={busy === 'removeSelected'} onClick={resetSelection}>Clear</button>
                <button className="btn btn-danger btn-sm" type="button" disabled={busy === 'removeSelected'} onClick={requestRemoveSelected}>
                  {busy === 'removeSelected' ? 'Removing…' : `Remove selected (${selected.size})`}
                </button>
              </div>
            </div>
          )}

          <div className="roster-scroll" ref={scrollRef}>
            <div className="twrap"><table>
            <thead><tr>
              <th scope="col" className="cell-check">
                <input ref={selectAllRef} type="checkbox" aria-label="Select all visible students" checked={allVisibleSelected} onChange={toggleSelectAll} />
              </th>
              <th scope="col">Student</th>
              <th scope="col">ID</th>
              <th scope="col">Section</th>
              <th scope="col">Status</th>
              <th scope="col">Eligible</th>
              <th scope="col">Participated</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {loading && students.length === 0 ? (
                <tr><td colSpan={8}><div className="state-block"><span className="spinner" aria-hidden="true" /><strong>Loading roster…</strong><small>Fetching the official student list.</small></div></td></tr>
              ) : filteredStudents.length === 0 ? (
                <tr><td colSpan={8}><div className="state-block">
                  <SearchX size={26} className="state-ic" aria-hidden="true" />
                  {students.length === 0 ? (
                    <>
                      <strong>No students on the roster yet</strong>
                      <small>Import the official file to build the list that controls voting eligibility.</small>
                      <button className="btn btn-primary btn-sm" type="button" onClick={() => fileInputRef.current?.click()}>Import roster</button>
                    </>
                  ) : (
                    <>
                      <strong>No students match your filters</strong>
                      <small>Try different search terms or filters.</small>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={clearFilters}>Clear filters</button>
                    </>
                  )}
                </div></td></tr>
              ) : visibleStudents.map((student) => (
                <tr key={student.id} className={selected.has(student.id) ? 'is-sel' : ''}>
                  <td className="cell-check">
                    <input type="checkbox" aria-label={`Select ${student.fullName}`} checked={selected.has(student.id)} onChange={() => toggleSelect(student.id)} />
                  </td>
                  <td><div className="rname"><b>{student.fullName}</b>{student.email && <small>{student.email}</small>}</div></td>
                  <td><span className="mono-id">{student.studentNo || '—'}</span></td>
                  <td><div className="rsec">{student.section}<small>{yearLabel(student.yearLevel)}</small></div></td>
                  <td>{student.status === 'active' ? <span className="tag-win">Active</span> : <span className="tag-warn">Inactive</span>}</td>
                  <td>{student.eligible ? <span className="tag-win">Eligible</span> : <span className="tag-muted">No</span>}</td>
                  <td>{hasParticipated(student) ? <span className="tag-win">Voted</span> : <span className="tag-muted">Not yet</span>}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm row-act"
                      type="button"
                      title={`Remove ${student.fullName} from the roster`}
                      aria-label={`Remove ${student.fullName} from the roster`}
                      disabled={anyRemovalBusy}
                      onClick={() => requestRemove(student)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          </div>

          {filteredStudents.length > limit && (
            <div className="roster-more">
              <button className="btn btn-ghost btn-sm" type="button" onClick={showMore}>
                Show more ({filteredStudents.length - limit} remaining)
              </button>
              <small>Showing {Math.min(limit, filteredStudents.length)} of {filteredStudents.length} matched students</small>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}