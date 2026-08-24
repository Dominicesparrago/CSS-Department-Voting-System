'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, Download, Trophy } from 'lucide-react';
import CustomSelect, { type CustomSelectOption } from '@/components/ui/CustomSelect';
import { buildAggregate, currentWinner, positionVoteRows, type PositionVoteRow } from '@/lib/admin/adminCore';
import type { Candidate, Position } from '@/lib/types';

const COLORS = ['#22b8a0', '#8cb4ff', '#f4b860', '#f58d9e', '#7fd3ff', '#c7a3ff', '#9ad36f', '#ffb26b'];

interface ResultRow extends PositionVoteRow {
  color: string;
}

interface WinnerGraphRow {
  id: string;
  candidateName: string;
  positionName: string;
  votes: number;
  color: string;
}

interface PositionResult {
  position: Position;
  winner: ReturnType<typeof currentWinner>;
}

function formatVotePercent(value: number, total: number): string {
  return `${total > 0 ? ((value / total) * 100).toFixed(2) : '0.00'}%`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-PH');
}

function buildWinnerGraphRows(positionResults: PositionResult[]): WinnerGraphRow[] {
  let colorIndex = 0;
  return positionResults.flatMap((result) => {
    if (result.winner.kind === 'none') return [];
    return result.winner.leaders.map((leader) => ({
      id: `${result.position.id}:${leader.candidate.id}`,
      candidateName: leader.candidate.name,
      positionName: result.position.name,
      votes: leader.votes,
      color: COLORS[colorIndex++ % COLORS.length],
    }));
  });
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve();
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve();
      }, 500);
    }, 'image/png');
  });
}

function drawCanvasDoughnut(
  context: CanvasRenderingContext2D,
  rows: WinnerGraphRow[],
  total: number,
  centerX: number,
  centerY: number,
  radius: number,
) {
  context.lineWidth = 34;
  context.strokeStyle = 'rgba(120, 200, 190, .14)';
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  if (total <= 0) return;

  let cursor = -Math.PI / 2;
  rows.forEach((row) => {
    const sweep = (row.votes / total) * Math.PI * 2;
    context.strokeStyle = row.color;
    context.beginPath();
    context.arc(centerX, centerY, radius, cursor, cursor + sweep);
    context.stroke();
    cursor += sweep;
  });
}

async function drawDoughnutGraphic(params: {
  kicker: string;
  headline: string;
  meta: string;
  summary: { label: string; value: string; detail: string };
  rows: WinnerGraphRow[];
  total: number;
  centerLabel: string;
  combinedLegend?: boolean;
  transparent: boolean;
}): Promise<HTMLCanvasElement | null> {
  const { kicker, headline, meta, summary, rows, total, centerLabel, combinedLegend = false, transparent } = params;
  if (document.fonts) await document.fonts.ready;
  const bodyFont = getComputedStyle(document.body).getPropertyValue('--font-figtree').trim() || 'Figtree, sans-serif';
  const monoFont = getComputedStyle(document.body).getPropertyValue('--font-jetbrains-mono').trim() || '"JetBrains Mono", monospace';
  const canvas = document.createElement('canvas');
  canvas.width = 1800;
  // Layout geometry: the ring's outer edge reaches graphY ± 143, so the canvas
  // reserves enough height that neither the doughnut nor its legend clips.
  const graphY = 500;
  canvas.height = Math.max(690, 497 + rows.length * 52);
  const context = canvas.getContext('2d');
  if (!context) return null;

  if (!transparent) {
    const background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    background.addColorStop(0, '#0d2426');
    background.addColorStop(0.55, '#0a0e0f');
    background.addColorStop(1, '#07191b');
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const text = transparent ? '#102321' : '#f4fcfb';
  const muted = transparent ? 'rgba(16, 35, 33, .64)' : 'rgba(234, 250, 247, .66)';
  const accent = transparent ? '#087c6e' : '#22b8a0';
  context.textAlign = 'left';
  context.fillStyle = accent;
  context.font = `600 18px ${monoFont}`;
  context.fillText(kicker.toUpperCase(), 90, 76);
  context.fillStyle = text;
  context.font = `800 52px ${bodyFont}`;
  context.fillText(headline, 90, 138);
  context.fillStyle = muted;
  context.font = `400 19px ${monoFont}`;
  context.fillText(meta, 90, 178);

  // Summary block ends at y=329; the doughnut's top edge (graphY - 143 = 357)
  // stays clear of it.
  context.fillStyle = muted;
  context.font = `500 17px ${monoFont}`;
  context.fillText(summary.label, 90, 250);
  context.fillStyle = text;
  context.font = `700 34px ${bodyFont}`;
  context.fillText(summary.value, 90, 294);
  context.fillStyle = muted;
  context.font = `400 19px ${monoFont}`;
  context.fillText(summary.detail, 90, 329);

  drawCanvasDoughnut(context, rows, total, 300, graphY, 126);
  context.textAlign = 'center';
  context.fillStyle = text;
  context.font = `800 34px ${bodyFont}`;
  context.fillText(formatNumber(total), 300, graphY + 8);
  context.fillStyle = muted;
  context.font = `500 15px ${monoFont}`;
  context.fillText(centerLabel, 300, graphY + 38);
  context.textAlign = 'left';
  context.font = `600 21px ${bodyFont}`;
  rows.forEach((row, index) => {
    const y = graphY - 100 + index * 52;
    context.fillStyle = row.color;
    context.fillRect(540, y - 15, 15, 15);
    context.fillStyle = text;
    context.fillText(combinedLegend ? `${row.positionName} · ${row.candidateName}` : row.candidateName, 570, y);
    context.fillStyle = muted;
    context.font = `400 17px ${monoFont}`;
    context.fillText(`${formatNumber(row.votes)} votes · ${formatVotePercent(row.votes, total)}`, 570, y + 25);
    context.font = `600 21px ${bodyFont}`;
  });

  return canvas;
}

function positionSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'position';
}

function Doughnut({ rows, total }: { rows: WinnerGraphRow[]; total: number }) {
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = rows.map((row) => {
    const length = total > 0 ? (row.votes / total) * circumference : 0;
    const segment = { ...row, length, offset };
    offset += length;
    return segment;
  });

  return (
    <div className="design-doughnut-wrap">
      <svg className="design-doughnut" viewBox="0 0 220 220" role="img" aria-label={`Winners distribution for ${formatNumber(total)} votes`}>
        <circle className="design-doughnut-track" cx="110" cy="110" r={radius} />
        {segments.map((segment) => (
          <circle
            className="design-doughnut-segment"
            key={segment.id}
            cx="110"
            cy="110"
            r={radius}
            stroke={segment.color}
            strokeDasharray={`${segment.length} ${circumference - segment.length}`}
            strokeDashoffset={-segment.offset}
          />
        ))}
        <text className="design-doughnut-total" x="110" y="106" textAnchor="middle">{formatNumber(total)}</text>
        <text className="design-doughnut-label" x="110" y="129" textAnchor="middle">WINNER VOTES</text>
      </svg>
    </div>
  );
}

export function ExportPreviewModal({
  heading,
  filename,
  transparent,
  canvas,
  onClose,
}: {
  heading: string;
  filename: string;
  transparent: boolean;
  canvas: HTMLCanvasElement | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef<HTMLButtonElement>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const host = bodyRef.current;
    if (!host || !canvas) return;
    host.replaceChildren(canvas);
  }, [canvas]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    downloadRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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
  }, [onClose]);

  async function handleDownload() {
    if (!canvas || downloading) return;
    setDownloading(true);
    try {
      await downloadCanvas(canvas, filename);
      onClose();
    } finally {
      setDownloading(false);
    }
  }

  return createPortal(
    <div className="export-preview-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !downloading) onClose(); }}>
      <div ref={panelRef} className="export-preview" role="dialog" aria-modal="true" aria-labelledby="export-preview-title">
        <header className="export-preview-head">
          <div>
            <span className="design-kicker">Export preview</span>
            <h2 id="export-preview-title">{heading}</h2>
          </div>
          <button className="btn btn-ghost btn-sm" type="button" disabled={downloading} onClick={onClose}>Cancel</button>
        </header>

        <div
          className="export-preview-body"
          data-transparent={transparent || undefined}
          data-empty={!canvas || undefined}
        >
          {!canvas && (
            <div className="export-preview-loading">
              <span className="spinner" aria-hidden="true" />
              <strong>Rendering preview…</strong>
            </div>
          )}
          <div ref={bodyRef} />
        </div>

        <footer className="export-preview-foot">
          <span className="export-preview-meta">
            {filename}
            {canvas ? ` · ${canvas.width} × ${canvas.height}px` : ''}
            {transparent ? ' · checkerboard = transparency' : ''}
          </span>
          <div className="dlg-actions">
            <button ref={downloadRef} className="btn btn-primary btn-sm" type="button" disabled={!canvas || downloading} onClick={() => void handleDownload()}>
              <Download size={14} aria-hidden="true" /> {downloading ? 'Downloading…' : 'Download PNG'}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export default function SuperAdminResultsFeature({
  aggregate,
  candidates,
  positions,
  positionOptions,
  electionTitle,
}: {
  aggregate: ReturnType<typeof buildAggregate>;
  candidates: Candidate[];
  positions: Position[];
  positionOptions: CustomSelectOption[];
  electionTitle: string;
}) {
  const [positionId, setPositionId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<{
    heading: string;
    filename: string;
    transparent: boolean;
    canvas: HTMLCanvasElement | null;
  } | null>(null);

  useEffect(() => {
    setPositionId((current) => positions.some((position) => position.id === current)
      ? current
      : positions[0]?.id ?? '');
  }, [positions]);

  const selectedPosition = positions.find((position) => position.id === positionId);
  const rawRows = useMemo(
    () => positionVoteRows(candidates, aggregate, positionId).rows,
    [aggregate, candidates, positionId],
  );
  const rows = useMemo<ResultRow[]>(() => rawRows.map((row, index) => ({
    ...row,
    color: COLORS[index % COLORS.length],
  })), [rawRows]);
  const total = useMemo(() => rows.reduce((sum, row) => sum + row.votes, 0), [rows]);
  const winner = useMemo(() => currentWinner(rawRows), [rawRows]);
  const positionResults = useMemo<PositionResult[]>(() => positions.map((position) => ({
    position,
    winner: currentWinner(positionVoteRows(candidates, aggregate, position.id).rows),
  })), [aggregate, candidates, positions]);
  const winnerGraphRows = useMemo(() => buildWinnerGraphRows(positionResults), [positionResults]);
  const winnerGraphTotal = useMemo(() => winnerGraphRows.reduce((sum, row) => sum + row.votes, 0), [winnerGraphRows]);
  const winnerName = winner.kind === 'winner'
    ? winner.leaders[0].candidate.name
    : winner.kind === 'tie'
      ? 'Tie in this race'
      : 'No votes yet';
  const winnerVotes = winner.leaders[0]?.votes ?? 0;

  async function openExportPreview(kind: 'position' | 'winners', transparent: boolean) {
    if (exporting) return;

    let spec: { heading: string; filename: string; transparent: boolean };
    if (kind === 'position') {
      if (!selectedPosition) return;
      const winnerLabel = winner.kind === 'winner'
        ? winner.leaders[0].candidate.name
        : winner.kind === 'tie'
          ? winner.leaders.map((leader) => leader.candidate.name).join(' / ')
          : 'No votes yet';
      spec = {
        heading: `${selectedPosition.name} — ${transparent ? 'transparent graph' : 'result'}`,
        filename: `css-voting-${positionSlug(selectedPosition.name)}-result${transparent ? '-transparent' : ''}.png`,
        transparent,
      };
      setPreview({ ...spec, canvas: null });
      setExporting(true);
      try {
        const canvas = await drawDoughnutGraphic({
          kicker: selectedPosition.name,
          headline: 'Vote distribution',
          meta: `${electionTitle} · ${new Date().toLocaleString('en-PH')}`,
          summary: {
            label: winner.kind === 'tie' ? 'TIED LEAD' : 'CURRENT WINNER',
            value: winnerLabel,
            detail: `${formatNumber(winnerVotes)} votes · ${formatVotePercent(winnerVotes, total)} of race`,
          },
          rows: rows.map((row) => ({
            id: row.candidate.id,
            candidateName: row.candidate.name,
            positionName: selectedPosition.name,
            votes: row.votes,
            color: row.color,
          })),
          total,
          centerLabel: 'TOTAL VOTES',
          transparent,
        });
        setPreview((current) => (current && current.filename === spec.filename ? { ...current, canvas } : current));
      } finally {
        setExporting(false);
      }
      return;
    }

    spec = {
      heading: `Combined winners — ${transparent ? 'transparent graph' : 'all positions'}`,
      filename: `css-voting-winners-by-position${transparent ? '-transparent' : ''}.png`,
      transparent,
    };
    setPreview({ ...spec, canvas: null });
    setExporting(true);
    try {
      const canvas = await drawDoughnutGraphic({
        kicker: electionTitle,
        headline: 'Winners by Position',
        meta: `${positions.length} department positions · ${new Date().toLocaleString('en-PH')}`,
        summary: {
          label: 'COMBINED WINNER VOTES',
          value: formatNumber(winnerGraphTotal),
          detail: `${winnerGraphRows.length} winning candidates · ties shown separately`,
        },
        rows: winnerGraphRows,
        total: winnerGraphTotal,
        centerLabel: 'WINNER VOTES',
        combinedLegend: true,
        transparent,
      });
      setPreview((current) => (current && current.filename === spec.filename ? { ...current, canvas } : current));
    } finally {
      setExporting(false);
    }
  }

  function closeExportPreview() {
    if (exporting) return;
    setPreview(null);
  }

  return (
    <div className="superadmin-results-feature">
      <section className="design-result-hero" aria-labelledby="superadmin-result-title">
        <div className="design-hero-toolbar">
          <div>
            <span className="design-kicker">{electionTitle}</span>
            <h2 id="superadmin-result-title">Winner, at a glance.</h2>
            <p className="superadmin-results-subtitle">Live result hero from the current election tally.</p>
          </div>
          <div className="design-toolbar-actions">
            <CustomSelect
              label="Position"
              value={positionId}
              options={positionOptions}
              placeholder="Select position"
              disabled={positionOptions.length === 0}
              onChange={setPositionId}
            />
            <button className="btn btn-primary design-export-btn" type="button" disabled={!selectedPosition || exporting} onClick={() => void openExportPreview('position', false)}>
              <Download size={16} aria-hidden="true" /> {exporting ? 'Preparing…' : 'Export PNG'}
            </button>
            <button className="btn btn-ghost design-export-transparent" type="button" disabled={!selectedPosition || exporting} onClick={() => void openExportPreview('position', true)}>
              <BarChart3 size={16} aria-hidden="true" /> PNG — Transparent
            </button>
          </div>
        </div>

        {!selectedPosition ? (
          <div className="design-empty-state">
            <BarChart3 size={30} aria-hidden="true" />
            <strong>No positions available</strong>
            <span>Add an election position to begin showing results.</span>
          </div>
        ) : (
<div className="design-result-grid">
              <article className={`design-winner-card${winner.kind === 'tie' ? ' is-tie' : ''}`}>
                <div className="design-winner-header">
                  <span className="design-winner-status-label">RACE STATUS</span>
                </div>
                <div className="design-winner-main">
                  <div className="design-winner-icon-row">
                    <div className="design-winner-icon"><Trophy size={25} aria-hidden="true" /></div>
                    <h2>{winner.kind === 'none' ? 'No votes yet' : winnerName}</h2>
                  </div>
                  <p className="design-winner-copy">
                    {winner.kind === 'none'
                      ? 'No votes yet. The current winner will appear here as ballots are recorded.'
                      : winner.kind === 'tie'
                        ? 'The highest vote count is shared. No single winner is declared.'
                        : 'Leading this position with the highest recorded vote count.'}
                  </p>
                </div>
                <div className="design-winner-stats">
                  <div><strong>{formatNumber(winnerVotes)}</strong><span>Votes</span></div>
                  <div><strong>{formatVotePercent(winnerVotes, total)}</strong><span>Of race</span></div>
                  <div><strong>{formatNumber(total)}</strong><span>Total votes</span></div>
                </div>
              </article>

            <div className="superadmin-candidate-graph">
              <div className="design-card-heading">
                <div><span className="design-kicker">Distribution</span><h3>How the race stands</h3></div>
                <span className="design-graph-meta">{rows.length} candidates</span>
              </div>
              <div className="design-graph-layout">
                <Doughnut rows={rows.map((row) => ({
                  id: row.candidate.id,
                  candidateName: row.candidate.name,
                  positionName: selectedPosition.name,
                  votes: row.votes,
                  color: row.color,
                }))} total={total} />
                <div className="design-legend" aria-label="Candidate vote distribution">
                  {rows.length === 0 ? (
                    <div className="design-legend-empty">No candidates available for this position.</div>
                  ) : rows.map((row) => (
                    <div className="design-legend-row" key={row.candidate.id}>
                      <span className="design-swatch" style={{ background: row.color }} />
                      <span className="design-legend-name"><b>{row.candidate.name}</b><small>{formatNumber(row.votes)} votes</small></span>
                      <span className="design-legend-percent">{formatVotePercent(row.votes, total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        <footer className="design-result-footer">
          <span><span className="d" /> Counts update automatically as votes are recorded.</span>
          <span>Live election tally</span>
        </footer>
      </section>

      <section className="design-position-section superadmin-winners-section" aria-labelledby="superadmin-winners-title">
        <div className="design-section-heading">
          <div><span className="design-kicker">All department positions</span><h2 id="superadmin-winners-title">Winners by Position</h2></div>
          <span className="design-section-note">One combined graph · {positions.length} positions</span>
          <div className="design-toolbar-actions">
            <button className="btn btn-primary design-export-btn" type="button" disabled={exporting} onClick={() => void openExportPreview('winners', false)}>
              <Download size={16} aria-hidden="true" /> {exporting ? 'Preparing…' : 'Export Winners PNG'}
            </button>
            <button className="btn btn-ghost design-export-transparent" type="button" disabled={exporting} onClick={() => void openExportPreview('winners', true)}>
              <BarChart3 size={16} aria-hidden="true" /> PNG — Transparent
            </button>
          </div>
        </div>
        <article className="design-winner-position-graph">
          <div className="design-card-heading">
            <div><span className="design-kicker">Combined winner distribution</span><h3>All position winners in one graph</h3></div>
            <span className="design-graph-meta">{formatNumber(winnerGraphTotal)} winner votes</span>
          </div>
          <p className="design-card-copy">Each slice represents a winning candidate from a department position. Ties appear as separate slices.</p>
          <div className="design-winner-position-graph-layout">
            <Doughnut rows={winnerGraphRows} total={winnerGraphTotal} />
            <div className="design-winner-position-legend" aria-label="All position winner distribution">
              {winnerGraphRows.length === 0 ? (
                <div className="design-legend-empty">No votes yet. Position winners will appear here as votes are recorded.</div>
              ) : winnerGraphRows.map((row) => (
                <div className="design-winner-position-legend-row" key={row.id}>
                  <span className="design-swatch" style={{ background: row.color }} />
                  <span><b>{row.positionName}</b><small>{row.candidateName}</small></span>
                  <strong>{formatNumber(row.votes)} · {formatVotePercent(row.votes, winnerGraphTotal)}</strong>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      {preview && (
        <ExportPreviewModal
          heading={preview.heading}
          filename={preview.filename}
          transparent={preview.transparent}
          canvas={preview.canvas}
          onClose={closeExportPreview}
        />
      )}
    </div>
  );
}
