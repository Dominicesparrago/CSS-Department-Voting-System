'use client';

import { useRef, useState } from 'react';
import { FileUp, Upload, X } from 'lucide-react';
import NoticeLine, { type Notice } from '@/components/admin/console/NoticeLine';
import { importCandidates, parseCandidateCsv } from '@/lib/admin/candidateImport';

type ImportSummary = {
  total: number;
  inserted: number;
  updated: number;
  duplicates: number;
  invalid: number;
  rejected: number;
  errors: Array<{ row: number; reason: string }>;
};

export default function CandidateImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);

  function applyParsed(parsed: { rows: Record<string, string>[]; headerErrors: string[] }) {
    setRows(parsed.rows);
    setHeaderErrors(parsed.headerErrors);
    setSummary(null);
    setNotice(parsed.rows.length > 0
      ? { text: `Parsed ${parsed.rows.length} candidate rows. Review and import.` }
      : { text: 'No data rows found.', error: true });
  }

  function handleFile(file: File | undefined | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyParsed(parseCandidateCsv(String(reader.result ?? '')));
    reader.readAsText(file);
  }

  function handlePaste(value: string) {
    setPasteText(value);
    setSummary(null);
    setNotice(null);
    if (value.trim().length > 0) applyParsed(parseCandidateCsv(value));
  }

  async function runImport() {
    if (busy || rows.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await importCandidates({ rows });
      setSummary(result.summary);
      setNotice({ text: `Import finished: ${result.summary.inserted} inserted, ${result.summary.updated} updated.` });
    } catch (error) {
      setNotice({ text: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  function clearAll() {
    setRows([]);
    setPasteText('');
    setSummary(null);
    setNotice(null);
    setHeaderErrors([]);
  }

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Bulk upload</span>
          <h1>Import candidates</h1>
          <p>Upload a CSV/TSV (position, name, section, year level — plus optional platform, party, order, active). Rows matching an existing position + name + section update instead of duplicating.</p>
        </div>
      </header>
      <NoticeLine notice={notice} />

      <div className="two-col">
        <div className="state-block">
          <strong>Upload a file</strong>
          <small>CSV or TSV with a header row. Position ids must match positions on this election&apos;s ballot.</small>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" type="button" onClick={() => fileRef.current?.click()}>
              <FileUp size={14} style={{ marginRight: 6 }} />
              Choose CSV file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt"
              style={{ display: 'none' }}
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
          </div>
        </div>
        <div className="state-block">
          <strong>Paste rows</strong>
          <small>Paste CSV/TSV text directly (header + rows).</small>
          <textarea
            style={{ marginTop: 8, width: '100%', minHeight: 90 }}
            placeholder={'position,name,section,yearLevel,platform\npresident,Juan Dela Cruz,BSCS-3A,3,Platform text'}
            value={pasteText}
            onChange={(event) => handlePaste(event.target.value)}
          />
        </div>
      </div>

      {headerErrors.length > 0 && (
        <div className="form-message is-error" role="alert">
          {headerErrors.join(' ')}
        </div>
      )}
      {rows.length > 0 && !summary && (
        <div className="state-block">
          <strong>{rows.length} data row{rows.length === 1 ? '' : 's'} ready</strong>
          <small>Import will re-validate every row server-side and reject duplicates.</small>
        </div>
      )}

      {summary && (
        <div className="superadmin-list" aria-label="Import summary">
          <div className="block-label">
            <h2>Import summary</h2>
            <small>{summary.total} rows processed</small>
          </div>
          <div className="superadmin-row">
            <span className="tag active">{summary.inserted} inserted</span>
            <span className="tag">{summary.updated} updated</span>
            <span className="tag">{summary.duplicates} duplicate</span>
            <span className="tag warn">{summary.rejected} rejected</span>
          </div>
          {summary.errors.length > 0 && (
            <div className="superadmin-list" aria-label="Import errors">
              {summary.errors.slice(0, 20).map((error) => (
                <div className="superadmin-row" key={`${error.row}-${error.reason}`}>
                  <div>
                    <strong>Row {error.row}</strong>
                    <p>{error.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <button className="btn btn-primary" type="button" disabled={busy || rows.length === 0} onClick={() => void runImport()}>
          <Upload size={14} style={{ marginRight: 6 }} />
          {busy ? 'Importing…' : 'Import candidates'}
        </button>
        {(rows.length > 0 || pasteText) && (
          <button className="btn btn-ghost btn-sm" type="button" style={{ marginLeft: 8 }} onClick={clearAll}>
            <X size={14} style={{ marginRight: 6 }} />
            Clear
          </button>
        )}
      </div>
    </>
  );
}