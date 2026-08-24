'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Radio,
  Settings,
  ShieldCheck,
  Users,
  Vote,
  Trophy,
} from 'lucide-react';
import AccessDeniedScreen from '@/components/AccessDeniedScreen';
import BrandMark from '@/components/BrandMark';
import RouteLoading from '@/components/RouteLoading';
import CustomSelect, { type CustomSelectOption } from '@/components/ui/CustomSelect';
import { useGuardedSession } from '@/hooks/useGuardedSession';
import { buildAggregate, currentWinner, positionVoteRows, type PositionVoteRow } from '@/lib/admin/adminCore';
import { hasSuperAdminClaim } from '@/lib/auth/guards-core';
import { ELECTION_ID } from '@/lib/constants';
import { positionGroup } from '@/lib/election/candidates';
import { formatTimestamp, percent, yearLabel } from '@/lib/format';
import { DEFAULT_APP_CONFIG, watchAppConfig } from '@/lib/appConfig';
import { watchAdmins, watchAllElections, updateElectionTitle, createAdminAccount, grantAdmin, revokeAdmin, saveAppConfig } from '@/lib/superadmin/superadminData';
import { AUDIT_ACTION_LABELS, auditDetail } from '@/lib/admin/auditPresentation';
import { watchAudit } from '@/lib/admin/adminData';
import { useAdminElectionData } from './console/useAdminElectionData';
import { MOCK_AGGREGATE, MOCK_CANDIDATES, MOCK_ELECTION, MOCK_POSITIONS } from '@/lib/designTest/mockData';
import type { AdminEntry, AppConfig, AuditEntry, Candidate, Election, Position } from '@/lib/types';

const COLORS = ['#22b8a0', '#8cb4ff', '#f4b860', '#f58d9e', '#7fd3ff', '#c7a3ff', '#9ad36f', '#ffb26b'];

export interface DesignTestFonts {
  figtree: string;
  jetBrainsMono: string;
}

interface DesignResultRow extends PositionVoteRow {
  color: string;
}

interface WinnerGraphRow {
  id: string;
  label: string;
  positionName: string;
  votes: number;
  color: string;
}

type DoughnutRow = DesignResultRow | WinnerGraphRow;

interface PositionResult {
  position: Position;
  rows: DesignResultRow[];
  total: number;
  winner: ReturnType<typeof currentWinner>;
}

function formatPercent(value: number, total: number): string {
  return `${total > 0 ? ((value / total) * 100).toFixed(2) : '0.00'}%`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-PH');
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function safeText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function DesignLabel({ code, name }: { code: string; name: string }) {
  return <span className="design-choice-label" data-design-id={code}>{code} · {name}</span>;
}

function buildPositionResult(position: Position, candidates: Candidate[], aggregate: ReturnType<typeof buildAggregate>): PositionResult {
  const rawRows = positionVoteRows(candidates, aggregate, position.id).rows;
  const total = rawRows.reduce((sum, row) => sum + row.votes, 0);
  const rows = rawRows.map((row, index) => ({ ...row, color: COLORS[index % COLORS.length] }));
  return { position, rows, total, winner: currentWinner(rawRows) };
}

function buildWinnerGraphRows(positionResults: PositionResult[]): WinnerGraphRow[] {
  let colorIndex = 0;
  return positionResults.flatMap((result) => {
    if (result.winner.kind === 'none') return [];
    return result.winner.leaders.map((leader) => ({
      id: `${result.position.id}:${leader.candidate.id}`,
      label: leader.candidate.name,
      positionName: result.position.name,
      votes: leader.votes,
      color: COLORS[colorIndex++ % COLORS.length],
    }));
  });
}

function setCanvasFont(context: CanvasRenderingContext2D, weight: number, size: number, family: string) {
  context.font = `${weight} ${size}px ${family}`;
}

function drawFittedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  weight: number,
  size: number,
  family: string,
) {
  let nextSize = size;
  setCanvasFont(context, weight, nextSize, family);
  while (nextSize > 20 && context.measureText(text).width > maxWidth) {
    nextSize -= 2;
    setCanvasFont(context, weight, nextSize, family);
  }
  context.fillText(text, x, y);
}

function useDesignFonts(fonts: DesignTestFonts) {
  useEffect(() => {
    const body = document.body;
    const figtreeStack = `${fonts.figtree}, "Figtree", "Segoe UI", Arial, sans-serif`;
    const monoStack = `${fonts.jetBrainsMono}, "JetBrains Mono", ui-monospace, monospace`;
    const overrides: Record<string, string> = {
      '--font-figtree': fonts.figtree,
      '--font-jetbrains-mono': fonts.jetBrainsMono,
      '--font': figtreeStack,
      '--font-body': figtreeStack,
      '--font-display': figtreeStack,
      '--mono': monoStack,
      '--font-mono': monoStack,
    };
    const previous = new Map<string, string>();
    Object.entries(overrides).forEach(([property, value]) => {
      previous.set(property, body.style.getPropertyValue(property));
      body.style.setProperty(property, value);
    });
    return () => previous.forEach((value, property) => {
      if (value) body.style.setProperty(property, value);
      else body.style.removeProperty(property);
    });
  }, [fonts.figtree, fonts.jetBrainsMono]);
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
      }, 1000);
    }, 'image/png');
  });
}

function exportPositionCardHeight(result: PositionResult): number {
  return 118 + Math.max(1, result.rows.length) * 30;
}

function exportPositionGridHeight(positionResults: PositionResult[]): number {
  let height = 0;
  for (let index = 0; index < positionResults.length; index += 2) {
    height += Math.max(
      exportPositionCardHeight(positionResults[index]),
      positionResults[index + 1] ? exportPositionCardHeight(positionResults[index + 1]) : 0,
    ) + 24;
  }
  return height;
}

async function drawExportGraphic(params: {
  title: string;
  positionName: string;
  rows: DesignResultRow[];
  total: number;
  winner: ReturnType<typeof currentWinner>;
  positionResults: PositionResult[];
  winnerGraphRows: WinnerGraphRow[];
  winnerGraphTotal: number;
  fonts: DesignTestFonts;
}) {
  const { title, positionName, rows, total, winner, positionResults, winnerGraphRows, winnerGraphTotal, fonts } = params;
  if (document.fonts) {
    await Promise.all([
      document.fonts.ready,
      document.fonts.load(`800 52px ${fonts.figtree}`),
      document.fonts.load(`600 20px ${fonts.jetBrainsMono}`),
    ]);
  }
  const bodyFont = fonts.figtree || 'Figtree, sans-serif';
  const monoFont = fonts.jetBrainsMono || '"JetBrains Mono", monospace';
  const canvas = document.createElement('canvas');
  canvas.width = 1800;
  // The winners-by-position legend grows with the number of winners (38px per
  // row), so its block height must be derived — a fixed 340px budget leaves the
  // legend overlapping the position cards below when many positions have a winner.
  const winnerBlockHeight = winnerGraphRows.length > 0 ? 115 + winnerGraphRows.length * 38 + 30 : 0;
  const positionSectionHeight = positionResults.length > 0
    ? (winnerGraphRows.length > 0 ? winnerBlockHeight : 92) + exportPositionGridHeight(positionResults)
    : 0;
  canvas.height = Math.max(1100, positionResults.length > 0 ? 1000 + positionSectionHeight + 90 : 460 + rows.length * 62 + 180);
  const context = canvas.getContext('2d');
  if (!context) return;

  const background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, '#0d2426');
  background.addColorStop(0.5, '#0a0e0f');
  background.addColorStop(1, '#07191b');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = 'rgba(120, 200, 190, .08)';
  context.lineWidth = 1;
  for (let x = 40; x < canvas.width; x += 80) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let y = 40; y < canvas.height; y += 80) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  context.fillStyle = '#a0ede2';
  setCanvasFont(context, 600, 24, monoFont);
  context.fillText('CSS VOTING  /  LIVE RESULT', 96, 92);
  context.fillStyle = '#f4fcfb';
  drawFittedText(context, safeText(title, 64), 96, 172, 1540, 800, 58, bodyFont);
  context.fillStyle = 'rgba(234, 250, 247, .62)';
  setCanvasFont(context, 400, 25, bodyFont);
  context.fillText(`${positionName}  ·  Current vote distribution`, 96, 218);

  context.fillStyle = 'rgba(18, 30, 32, .86)';
  context.strokeStyle = 'rgba(120, 200, 190, .22)';
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(72, 280, 660, 620, 28);
  context.fill();
  context.stroke();

  const winnerName = winner.kind === 'winner'
    ? winner.leaders[0].candidate.name
    : winner.kind === 'tie'
      ? 'Tie in this race'
      : winner.label;
  const winnerVotes = winner.leaders[0]?.votes ?? 0;
  const winnerPercentage = formatPercent(winnerVotes, total);
  context.fillStyle = '#22b8a0';
  setCanvasFont(context, 600, 22, monoFont);
  context.fillText(winner.kind === 'winner' ? 'CURRENT WINNER' : winner.kind === 'tie' ? 'TIED LEAD' : 'RACE STATUS', 116, 354);
  context.fillStyle = '#f4fcfb';
  drawFittedText(context, winnerName, 116, 432, 570, 800, 52, bodyFont);
  context.fillStyle = 'rgba(234, 250, 247, .62)';
  setCanvasFont(context, 400, 24, bodyFont);
  const leaderNames = winner.kind === 'tie' ? winner.leaders.map((row) => row.candidate.name).join('  ·  ') : '';
  if (leaderNames) drawFittedText(context, leaderNames, 116, 478, 570, 400, 24, bodyFont);
  context.fillStyle = '#a0ede2';
  setCanvasFont(context, 800, 52, bodyFont);
  context.fillText(formatNumber(winnerVotes), 116, 590);
  context.fillStyle = 'rgba(234, 250, 247, .62)';
  setCanvasFont(context, 400, 22, bodyFont);
  context.fillText('votes', 116, 624);
  context.fillStyle = '#f4b860';
  setCanvasFont(context, 800, 42, bodyFont);
  context.fillText(winnerPercentage, 330, 590);
  context.fillStyle = 'rgba(234, 250, 247, .62)';
  setCanvasFont(context, 400, 22, bodyFont);
  context.fillText('of votes in this race', 330, 624);
  context.fillStyle = 'rgba(234, 250, 247, .45)';
  setCanvasFont(context, 400, 20, bodyFont);
  context.fillText(`${formatNumber(total)} total votes`, 116, 760);
  context.fillText('No winner is declared until votes are recorded.', 116, 810);

  const centerX = 1040;
  const centerY = 555;
  const radius = 205;
  const lineWidth = 62;
  context.lineWidth = lineWidth;
  context.lineCap = 'butt';
  context.strokeStyle = 'rgba(120, 200, 190, .12)';
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  if (total > 0) {
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
  context.fillStyle = '#f4fcfb';
  setCanvasFont(context, 800, 54, bodyFont);
  context.textAlign = 'center';
  context.fillText(formatNumber(total), centerX, centerY + 8);
  context.fillStyle = 'rgba(234, 250, 247, .62)';
  setCanvasFont(context, 400, 20, bodyFont);
  context.fillText('TOTAL VOTES', centerX, centerY + 45);
  context.textAlign = 'left';

  const legendX = 1320;
  const legendStart = 360;
  setCanvasFont(context, 600, 20, bodyFont);
  rows.forEach((row, index) => {
    const y = legendStart + index * 62;
    context.fillStyle = row.color;
    context.beginPath();
    context.roundRect(legendX, y - 17, 16, 16, 4);
    context.fill();
    context.fillStyle = '#f4fcfb';
    drawFittedText(context, row.candidate.name, legendX + 30, y - 2, 390, 600, 20, bodyFont);
    context.fillStyle = 'rgba(234, 250, 247, .62)';
    setCanvasFont(context, 400, 18, monoFont);
    context.fillText(`${formatNumber(row.votes)}  ·  ${formatPercent(row.votes, total)}`, legendX + 30, y + 24);
    setCanvasFont(context, 600, 20, bodyFont);
  });

  if (positionResults.length > 0) {
    const sectionY = 960;
    context.fillStyle = '#a0ede2';
    setCanvasFont(context, 600, 22, monoFont);
    context.fillText('WINNERS BY POSITION', 96, sectionY);
    context.fillStyle = 'rgba(234, 250, 247, .56)';
    setCanvasFont(context, 400, 19, bodyFont);
    context.fillText('Independent winner calculations and candidate distribution', 96, sectionY + 32);

    let cardTop = sectionY + 70;
    if (winnerGraphRows.length > 0) {
      const graphCenterX = 220;
      const graphCenterY = sectionY + 185;
      const graphRadius = 104;
      context.lineWidth = 34;
      context.lineCap = 'butt';
      context.strokeStyle = 'rgba(120, 200, 190, .12)';
      context.beginPath();
      context.arc(graphCenterX, graphCenterY, graphRadius, 0, Math.PI * 2);
      context.stroke();
      let cursor = -Math.PI / 2;
      winnerGraphRows.forEach((row) => {
        const sweep = (row.votes / winnerGraphTotal) * Math.PI * 2;
        context.strokeStyle = row.color;
        context.beginPath();
        context.arc(graphCenterX, graphCenterY, graphRadius, cursor, cursor + sweep);
        context.stroke();
        cursor += sweep;
      });
      context.textAlign = 'center';
      context.fillStyle = '#f4fcfb';
      setCanvasFont(context, 700, 28, bodyFont);
      context.fillText(formatNumber(winnerGraphTotal), graphCenterX, graphCenterY + 6);
      context.fillStyle = 'rgba(234, 250, 247, .58)';
      setCanvasFont(context, 400, 12, monoFont);
      context.fillText('WINNER VOTES', graphCenterX, graphCenterY + 27);
      context.textAlign = 'left';

      const winnerLegendX = 400;
      winnerGraphRows.forEach((row, index) => {
        const y = sectionY + 115 + index * 38;
        context.fillStyle = row.color;
        context.beginPath();
        context.roundRect(winnerLegendX, y - 12, 10, 10, 3);
        context.fill();
        context.fillStyle = '#f4fcfb';
        drawFittedText(context, `${row.positionName}: ${row.label}`, winnerLegendX + 22, y - 1, 470, 500, 16, bodyFont);
        context.fillStyle = 'rgba(234, 250, 247, .62)';
        setCanvasFont(context, 400, 14, monoFont);
        context.fillText(`${formatNumber(row.votes)} · ${formatPercent(row.votes, winnerGraphTotal)}`, winnerLegendX + 22, y + 18);
      });
      cardTop = sectionY + winnerBlockHeight;
    }

    const cardWidth = 820;
    positionResults.forEach((result, index) => {
      const column = index % 2;
      const rowIndex = Math.floor(index / 2);
      const previousRowsHeight = positionResults
        .slice(0, rowIndex * 2)
        .reduce((sum, _, previousIndex) => {
          if (previousIndex % 2 !== 0) return sum;
          return sum + Math.max(
            exportPositionCardHeight(positionResults[previousIndex]),
            positionResults[previousIndex + 1] ? exportPositionCardHeight(positionResults[previousIndex + 1]) : 0,
          ) + 24;
        }, 0);
      const x = column === 0 ? 72 : 908;
      const y = cardTop + previousRowsHeight;
      const cardHeight = exportPositionCardHeight(result);
      context.fillStyle = 'rgba(18, 30, 32, .86)';
      context.strokeStyle = 'rgba(120, 200, 190, .2)';
      context.lineWidth = 2;
      context.beginPath();
      context.roundRect(x, y, cardWidth, cardHeight, 22);
      context.fill();
      context.stroke();

      context.fillStyle = '#22b8a0';
      setCanvasFont(context, 600, 18, monoFont);
      context.fillText(`${String(result.position.order).padStart(2, '0')}  ${result.position.name}`, x + 24, y + 35);
      const exportWinner = result.winner.kind === 'winner'
        ? result.winner.leaders[0].candidate.name
        : result.winner.kind === 'tie'
          ? `Tie: ${result.winner.leaders.map((row) => row.candidate.name).join(' · ')}`
          : result.rows.length === 0 ? 'No candidates' : 'No votes yet';
      context.fillStyle = '#f4fcfb';
      drawFittedText(context, exportWinner, x + 24, y + 67, 620, 700, 23, bodyFont);
      context.fillStyle = 'rgba(234, 250, 247, .56)';
      setCanvasFont(context, 400, 17, monoFont);
      context.fillText(`${formatNumber(result.total)} total votes`, x + 650, y + 67);

      result.rows.forEach((row, rowIndex) => {
        const rowY = y + 101 + rowIndex * 30;
        context.fillStyle = row.color;
        context.beginPath();
        context.roundRect(x + 24, rowY - 11, 9, 9, 3);
        context.fill();
        context.fillStyle = '#f4fcfb';
        drawFittedText(context, row.candidate.name, x + 44, rowY, 270, 500, 16, bodyFont);
        context.fillStyle = 'rgba(120, 200, 190, .12)';
        context.beginPath();
        context.roundRect(x + 330, rowY - 10, 300, 8, 4);
        context.fill();
        context.fillStyle = row.color;
        context.beginPath();
        context.roundRect(x + 330, rowY - 10, result.total > 0 ? (row.votes / Math.max(1, ...result.rows.map((candidate) => candidate.votes))) * 300 : 0, 8, 4);
        context.fill();
        context.fillStyle = 'rgba(234, 250, 247, .7)';
        setCanvasFont(context, 400, 16, monoFont);
        context.fillText(`${formatNumber(row.votes)} · ${formatPercent(row.votes, result.total)}`, x + 650, rowY);
      });
    });
  }

  context.fillStyle = 'rgba(234, 250, 247, .4)';
  setCanvasFont(context, 400, 18, monoFont);
  context.fillText(`EXPORTED ${new Date().toLocaleString('en-PH')}`, 96, canvas.height - 84);

  await downloadCanvas(canvas, `css-voting-${positionName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-results.png`);
}

async function drawTransparentGraph(params: {
  positionName: string;
  rows: DesignResultRow[];
  total: number;
  fonts: DesignTestFonts;
}) {
  const { positionName, rows, total, fonts } = params;
  if (document.fonts) {
    await Promise.all([
      document.fonts.ready,
      document.fonts.load(`800 46px ${fonts.figtree}`),
      document.fonts.load(`600 19px ${fonts.jetBrainsMono}`),
    ]);
  }
  const bodyFont = fonts.figtree || 'Figtree, sans-serif';
  const monoFont = fonts.jetBrainsMono || '"JetBrains Mono", monospace';
  const canvas = document.createElement('canvas');
  canvas.width = 1500;
  canvas.height = Math.max(680, 250 + rows.length * 64);
  const context = canvas.getContext('2d');
  if (!context) return;

  context.fillStyle = '#f4fcfb';
  drawFittedText(context, positionName, 72, 72, 820, 800, 46, bodyFont);
  context.fillStyle = 'rgba(234, 250, 247, .66)';
  setCanvasFont(context, 400, 19, monoFont);
  context.fillText('VOTE DISTRIBUTION  ·  TRANSPARENT GRAPH', 72, 108);

  const centerX = 300;
  const centerY = 380;
  const radius = 172;
  context.lineWidth = 54;
  context.lineCap = 'butt';
  context.strokeStyle = 'rgba(120, 200, 190, .22)';
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  if (total > 0) {
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
  context.textAlign = 'center';
  context.fillStyle = '#f4fcfb';
  setCanvasFont(context, 800, 48, bodyFont);
  context.fillText(formatNumber(total), centerX, centerY + 8);
  context.fillStyle = 'rgba(234, 250, 247, .66)';
  setCanvasFont(context, 400, 17, monoFont);
  context.fillText('TOTAL VOTES', centerX, centerY + 39);
  context.textAlign = 'left';

  const legendX = 610;
  const legendStart = 180;
  rows.forEach((row, index) => {
    const y = legendStart + index * 64;
    context.fillStyle = row.color;
    context.beginPath();
    context.roundRect(legendX, y - 14, 15, 15, 4);
    context.fill();
    context.fillStyle = '#f4fcfb';
    drawFittedText(context, row.candidate.name, legendX + 29, y, 570, 600, 21, bodyFont);
    context.fillStyle = 'rgba(234, 250, 247, .66)';
    setCanvasFont(context, 400, 18, monoFont);
    context.fillText(`${formatNumber(row.votes)} votes  ·  ${formatPercent(row.votes, total)}`, legendX + 29, y + 28);
  });

  context.fillStyle = 'rgba(234, 250, 247, .45)';
  setCanvasFont(context, 400, 16, monoFont);
  context.fillText(`CSS VOTING  ·  ${new Date().toLocaleString('en-PH')}`, 72, canvas.height - 48);
  await downloadCanvas(canvas, `css-voting-${positionName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-graph-transparent.png`);
}

/**
 * Winners-by-position export: a focused, presentation-ready graphic built
 * around the combined winner doughnut and its legend — the same content as the
 * winners section of the full result export, without the hero.
 */
async function drawWinnersGraph(params: {
  title: string;
  winnerGraphRows: WinnerGraphRow[];
  winnerGraphTotal: number;
  pendingPositions: number;
  positionCount: number;
  fonts: DesignTestFonts;
}) {
  const { title, winnerGraphRows, winnerGraphTotal, pendingPositions, positionCount, fonts } = params;
  if (document.fonts) {
    await Promise.all([
      document.fonts.ready,
      document.fonts.load(`800 52px ${fonts.figtree}`),
      document.fonts.load(`600 20px ${fonts.jetBrainsMono}`),
    ]);
  }
  const bodyFont = fonts.figtree || 'Figtree, sans-serif';
  const monoFont = fonts.jetBrainsMono || '"JetBrains Mono", monospace';
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  // Legend grows 58px per winner row (20 rows with the mock roster), so the
  // canvas height must be derived from it — a fixed 360px budget puts the
  // exported stamp on top of the last legend rows and the pending-positions
  // note below the stamp.
  const legendStart = 320;
  const legendRowCount = Math.max(1, winnerGraphRows.length);
  const pendingNoteY = legendStart + legendRowCount * 58 + 12;
  const contentBottom = pendingPositions > 0 ? pendingNoteY + 30 : legendStart + legendRowCount * 58;
  canvas.height = Math.max(820, contentBottom + 130);
  const context = canvas.getContext('2d');
  if (!context) return;

  const background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, '#0d2426');
  background.addColorStop(0.5, '#0a0e0f');
  background.addColorStop(1, '#07191b');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = 'rgba(120, 200, 190, .08)';
  context.lineWidth = 1;
  for (let x = 40; x < canvas.width; x += 80) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let y = 40; y < canvas.height; y += 80) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  context.fillStyle = '#a0ede2';
  setCanvasFont(context, 600, 24, monoFont);
  context.fillText('CSS VOTING  /  WINNERS BY POSITION', 96, 92);
  context.fillStyle = '#f4fcfb';
  drawFittedText(context, safeText(title, 64), 96, 172, 1300, 800, 58, bodyFont);
  context.fillStyle = 'rgba(234, 250, 247, .62)';
  setCanvasFont(context, 400, 25, bodyFont);
  context.fillText(`Combined winner distribution  ·  ${positionCount} department positions`, 96, 218);

  const centerX = 330;
  const centerY = 480;
  const radius = 150;
  context.lineWidth = 46;
  context.lineCap = 'butt';
  context.strokeStyle = 'rgba(120, 200, 190, .12)';
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  if (winnerGraphTotal > 0) {
    let cursor = -Math.PI / 2;
    winnerGraphRows.forEach((row) => {
      const sweep = (row.votes / winnerGraphTotal) * Math.PI * 2;
      context.strokeStyle = row.color;
      context.beginPath();
      context.arc(centerX, centerY, radius, cursor, cursor + sweep);
      context.stroke();
      cursor += sweep;
    });
  }
  context.fillStyle = '#f4fcfb';
  setCanvasFont(context, 800, 52, bodyFont);
  context.textAlign = 'center';
  context.fillText(formatNumber(winnerGraphTotal), centerX, centerY + 8);
  context.fillStyle = 'rgba(234, 250, 247, .62)';
  setCanvasFont(context, 400, 19, monoFont);
  context.fillText('WINNER VOTES', centerX, centerY + 42);
  context.textAlign = 'left';

  const legendX = 620;
  winnerGraphRows.forEach((row, index) => {
    const y = legendStart + index * 58;
    context.fillStyle = row.color;
    context.beginPath();
    context.roundRect(legendX, y - 16, 15, 15, 4);
    context.fill();
    context.fillStyle = '#f4fcfb';
    drawFittedText(context, `${row.positionName}: ${row.label}`, legendX + 28, y - 2, 620, 600, 20, bodyFont);
    context.fillStyle = 'rgba(234, 250, 247, .62)';
    setCanvasFont(context, 400, 17, monoFont);
    context.fillText(`${formatNumber(row.votes)} votes · ${formatPercent(row.votes, winnerGraphTotal)}`, legendX + 28, y + 24);
    setCanvasFont(context, 600, 20, bodyFont);
  });
  if (winnerGraphRows.length === 0) {
    context.fillStyle = 'rgba(234, 250, 247, .5)';
    setCanvasFont(context, 400, 20, bodyFont);
    context.fillText('No position winners yet. Votes will appear here as they are recorded.', legendX, legendStart);
  }
  if (pendingPositions > 0) {
    context.fillStyle = '#f4b860';
    setCanvasFont(context, 400, 18, bodyFont);
    context.fillText(
      `${pendingPositions} position${pendingPositions === 1 ? '' : 's'} have no winner yet.`,
      legendX,
      pendingNoteY,
    );
  }

  context.fillStyle = 'rgba(234, 250, 247, .4)';
  setCanvasFont(context, 400, 18, monoFont);
  context.fillText(`EXPORTED ${new Date().toLocaleString('en-PH')}`, 96, canvas.height - 84);

  await downloadCanvas(canvas, 'css-voting-winners-by-position.png');
}

function Doughnut({ rows, total }: { rows: DoughnutRow[]; total: number }) {
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
      <svg className="design-doughnut" viewBox="0 0 220 220" role="img" aria-label={`Vote distribution for ${formatNumber(total)} votes`}>
        <circle className="design-doughnut-track" cx="110" cy="110" r={radius} />
        {segments.map((segment) => (
          <circle
            className="design-doughnut-segment"
            key={'candidate' in segment ? segment.candidate.id : segment.id}
            cx="110"
            cy="110"
            r={radius}
            stroke={segment.color}
            strokeDasharray={`${segment.length} ${circumference - segment.length}`}
            strokeDashoffset={-segment.offset}
          />
        ))}
        <text className="design-doughnut-total" x="110" y="106" textAnchor="middle">{formatNumber(total)}</text>
        <text className="design-doughnut-label" x="110" y="129" textAnchor="middle">TOTAL VOTES</text>
      </svg>
    </div>
  );
}

const POSITION_GROUP_LABELS = {
  exec: 'Executive',
  cmte: 'Committees',
  year: 'Year Representatives',
} as const;

export default function SuperAdminDesignTest({ fonts }: { fonts: DesignTestFonts }) {
  useDesignFonts(fonts);
  const { session, status, deniedReason, signOutToHome } = useGuardedSession((current) => {
    if (!current.user) return { kind: 'redirect', to: '/admin/auth' };
    if (!hasSuperAdminClaim(current.claims)) return { kind: 'deny', reason: 'This account does not have super admin access.' };
    return { kind: 'allow' };
  }, 'Unable to verify super admin credentials.');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingWinners, setExportingWinners] = useState(false);
  const [useMock, setUseMock] = useState(false);
  const [positionId, setPositionId] = useState('');
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [elections, setElections] = useState<Election[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [dataError, setDataError] = useState('');
  const liveData = useAdminElectionData(status === 'ready');
  const actorUid = session?.user?.uid ?? '';

  const aggregate = useMemo(() => buildAggregate({
    results: liveData.results,
    candidates: liveData.candidates,
    positions: liveData.positions,
    voters: liveData.voters,
    electionId: ELECTION_ID,
  }), [liveData.results, liveData.candidates, liveData.positions, liveData.voters]);

  // When the live election has nothing to render, default to the mock roster so
  // the design surface (and its exports) is never empty on first load.
  useEffect(() => {
    if (status === 'ready' && liveData.positions.length === 0) setUseMock(true);
  }, [status, liveData.positions.length]);

  useEffect(() => {
    if (status !== 'ready') return;
    const onError = (error: Error) => setDataError(error.message);
    const unsubscribers = [
      watchAdmins(setAdmins, onError),
      watchAllElections(setElections, onError),
      watchAudit(setAuditEntries, onError, 50),
      watchAppConfig(setConfig, onError),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [status]);

  const currentElection = liveData.election ?? elections.find((election) => election.id === ELECTION_ID) ?? null;

  // Single source for every design surface, so the mock/live toggle swaps the
  // hero, winners-by-position, and overview sections all at once.
  const display = useMemo(
    () => (useMock
      ? { positions: MOCK_POSITIONS, candidates: MOCK_CANDIDATES, aggregate: MOCK_AGGREGATE, election: MOCK_ELECTION }
      : { positions: liveData.positions, candidates: liveData.candidates, aggregate, election: currentElection }),
    [useMock, liveData.positions, liveData.candidates, aggregate, currentElection],
  );

  useEffect(() => {
    setPositionId((current) => display.positions.some((position) => position.id === current)
      ? current
      : display.positions[0]?.id ?? '');
  }, [display.positions]);

  const positionOptions = useMemo<CustomSelectOption[]>(() => display.positions.map((position) => ({
    value: position.id,
    label: `${position.order}. ${position.name}`,
    group: POSITION_GROUP_LABELS[positionGroup(position)],
  })), [display.positions]);
  const selectedPosition = display.positions.find((position) => position.id === positionId);
  const rawRows = useMemo(
    () => positionVoteRows(display.candidates, display.aggregate, positionId).rows,
    [display.aggregate, display.candidates, positionId],
  );
  const total = useMemo(() => rawRows.reduce((sum, row) => sum + row.votes, 0), [rawRows]);
  const rows = useMemo<DesignResultRow[]>(() => rawRows.map((row, index) => ({
    ...row,
    color: COLORS[index % COLORS.length],
  })), [rawRows]);
  const winner = useMemo(() => currentWinner(rawRows), [rawRows]);
  const positionResults = useMemo(
    () => display.positions.map((position) => buildPositionResult(position, display.candidates, display.aggregate)),
    [display.aggregate, display.candidates, display.positions],
  );
  const winnerGraphRows = useMemo(() => buildWinnerGraphRows(positionResults), [positionResults]);
  const winnerGraphTotal = useMemo(() => winnerGraphRows.reduce((sum, row) => sum + row.votes, 0), [winnerGraphRows]);
  const pendingPositions = useMemo(
    () => positionResults.filter((result) => result.winner.kind === 'none').length,
    [positionResults],
  );
  const actorEmail = (session?.user?.email ?? 'super admin').toLowerCase();
  const turnoutPercent = percent(display.aggregate.turnout.total, display.aggregate.eligible.total);
  const activeCandidates = display.candidates.filter((candidate) => candidate.active).length;
  const positionsCovered = display.positions.filter((position) => display.candidates.some((candidate) => candidate.positionId === position.id && candidate.active)).length;
  const setupReady = display.positions.length > 0 && positionsCovered === display.positions.length && display.aggregate.eligible.total > 0;
  const electionTitle = display.election?.title ?? 'CSS Department Election';

  if (status === 'loading') return <RouteLoading />;
  if (status === 'denied') {
    return (
      <AccessDeniedScreen
        eyebrow="Super admin route"
        reason={deniedReason}
        refNote="superadmin credentials required"
        titleId="superadmin-design-denied-title"
        actions={session?.user && <button className="btn btn-ghost" type="button" onClick={signOutToHome}>Sign out</button>}
      />
    );
  }

  const winnerName = winner.kind === 'winner'
    ? winner.leaders[0].candidate.name
    : winner.kind === 'tie'
      ? 'Tie in this race'
      : winner.label;
  const winnerVotes = winner.leaders[0]?.votes ?? 0;
  const winnerPercent = formatPercent(winnerVotes, total);
  async function exportCurrentResult(transparent = false) {
    if (!selectedPosition || exporting) return;
    setExporting(true);
    try {
      if (transparent) {
        await drawTransparentGraph({ positionName: selectedPosition.name, rows, total, fonts });
      } else {
        await drawExportGraphic({
          title: electionTitle,
          positionName: selectedPosition.name,
          rows,
          total,
          winner,
          positionResults,
          winnerGraphRows,
          winnerGraphTotal,
          fonts,
        });
      }
    } finally {
      setExporting(false);
    }
  }

  async function exportWinners() {
    if (exportingWinners) return;
    setExportingWinners(true);
    try {
      await drawWinnersGraph({
        title: electionTitle,
        winnerGraphRows,
        winnerGraphTotal,
        pendingPositions,
        positionCount: display.positions.length,
        fonts,
      });
    } finally {
      setExportingWinners(false);
    }
  }

  return (
    <div className="superadmin-design-test">
      <div className="topbar">
        <a className="terminal-brand" href="/superadmin" aria-label="CSS Voting super admin dashboard">
          <BrandMark />
          <span className="nav-brand-text"><strong>CSS Voting</strong><small>Design Test</small></span>
        </a>
        <button className="menu-btn" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
      </div>
      <div className={`scrim${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden="true" />

      <div className="shell">
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} aria-label="Super admin design navigation">
          <div className="side-brand">
            <BrandMark />
            <span className="nav-brand-text"><strong>CSS Voting</strong><small>Control Center</small></span>
          </div>
          <span className="super-badge"><span className="d" />Super Admin</span>
          <nav className="side-nav" aria-label="Super admin sections">
            <span className="side-cap">{'// system'}</span>
            <a className="item" href="/superadmin" onClick={() => setSidebarOpen(false)}>
              <LayoutDashboard size={18} aria-hidden="true" /> Dashboard
              <ExternalLink className="ext" size={14} aria-hidden="true" />
            </a>
            <a className="item on" href="/superadmin/design-test" aria-current="page" onClick={() => setSidebarOpen(false)}>
              <BarChart3 size={18} aria-hidden="true" /> Results design
            </a>
            <span className="side-cap">{'// shortcuts'}</span>
            <a className="item" href="/admin">
              <ShieldCheck size={18} aria-hidden="true" /> Admin console
              <ExternalLink className="ext" size={14} aria-hidden="true" />
            </a>
          </nav>
          <div className="side-foot">
            <div className="who">
              <span className="av">{initials(actorEmail)}</span>
              <div><b>Super admin</b><small>{actorEmail}</small></div>
            </div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={signOutToHome}>
              <LogOut size={14} style={{ marginRight: 6 }} /> Sign out
            </button>
          </div>
        </aside>

        <main className="main design-main">
          <header className="design-page-head">
            <div>
              <span className="eyebrow"><Radio size={12} aria-hidden="true" /> Design test / live results</span>
              <h1>Winner, at a glance.</h1>
              <p>Presentation-ready election results built on the same live tally as the production console.</p>
            </div>
            <div className="design-page-head-actions">
              <span className="design-live-state"><span className="d" /> {useMock ? 'Mock data' : 'Live data'}</span>
              <label className="design-mock-toggle">
                <span>Mock data</span>
                <button
                  className={`toggle${useMock ? ' on' : ''}`}
                  type="button"
                  role="switch"
                  aria-checked={useMock}
                  aria-label="Toggle mock data"
                  onClick={() => setUseMock((open) => !open)}
                />
              </label>
            </div>
          </header>

          <nav className="design-choice-index" aria-label="Design sections">
            <span className="design-choice-index-title">Select a design to review</span>
            <a href="#design-01"><DesignLabel code="01" name="Result hero" /></a>
            <a href="#design-02"><DesignLabel code="02" name="Winners by position" /></a>
            <a href="#design-03"><DesignLabel code="03" name="Election overview" /></a>
            <a href="#design-04"><DesignLabel code="04" name="Management console" /></a>
          </nav>

          {liveData.errorMessage && <p className="form-message is-error" role="alert">{liveData.errorMessage}</p>}
          {liveData.loading && <p className="form-message" role="status">Loading live election data…</p>}

          <section className="design-result-hero" id="design-01" data-design-id="01" aria-labelledby="design-result-title">
            <div className="design-hero-toolbar">
              <div>
                <DesignLabel code="01" name="Result hero" />
                <span className="design-kicker">{electionTitle}</span>
                <h2 id="design-result-title">The result, without the noise.</h2>
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
                <button
                  className="btn btn-primary design-export-btn"
                  type="button"
                  disabled={!selectedPosition || exporting}
                  onClick={() => void exportCurrentResult()}
                >
                  <Download size={16} aria-hidden="true" /> {exporting ? 'Preparing…' : 'Export Results'}
                </button>
                <button
                  className="btn btn-ghost design-export-transparent"
                  type="button"
                  disabled={!selectedPosition || exporting}
                  onClick={() => void exportCurrentResult(true)}
                >
                  <BarChart3 size={16} aria-hidden="true" /> Export Graph — Transparent
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
                <article className={`design-winner-card${winner.kind === 'tie' ? ' is-tie' : ''}`} data-design-id="01A">
                  <div className="design-card-topline">
                    <DesignLabel code="01A" name="Winner card" />
                    <span className="design-kicker">{selectedPosition.name}</span>
                    <span className={`design-winner-badge${winner.kind === 'tie' ? ' is-tie' : ''}`}>
                      <Trophy size={13} aria-hidden="true" />
                      {winner.kind === 'winner' ? 'Current winner' : winner.kind === 'tie' ? 'Tied lead' : 'Awaiting votes'}
                    </span>
                  </div>
                  <div className="design-winner-icon"><Trophy size={25} aria-hidden="true" /></div>
                  <p className="design-winner-label">{winner.kind === 'none' ? 'Race status' : 'Leading candidate'}</p>
                  <h3>{winnerName}</h3>
                  {winner.kind === 'tie' && (
                    <p className="design-tie-list">{winner.leaders.map((row) => row.candidate.name).join(' · ')}</p>
                  )}
                  {winner.kind === 'none' && <p className="design-winner-copy">No votes yet. The current winner will appear here as ballots are recorded.</p>}
                  {winner.kind === 'winner' && <p className="design-winner-copy">Leading this position with the highest recorded vote count.</p>}
                  {winner.kind === 'tie' && <p className="design-winner-copy">The highest vote count is shared. No single winner is declared.</p>}
                  <div className="design-winner-stats">
                    <div><strong>{formatNumber(winnerVotes)}</strong><span>Votes</span></div>
                    <div><strong>{winnerPercent}</strong><span>Of race</span></div>
                    <div><strong>{formatNumber(total)}</strong><span>Total votes</span></div>
                  </div>
                </article>

                <article className="design-graph-card" data-design-id="01B">
                  <div className="design-card-heading">
                    <div><DesignLabel code="01B" name="Distribution graph" /><span className="design-kicker">Distribution</span><h3>How the race stands</h3></div>
                    <span className="design-graph-meta">{rows.length} candidates</span>
                  </div>
                  <div className="design-graph-layout">
                    <Doughnut rows={rows} total={total} />
                    <div className="design-legend" aria-label="Candidate vote distribution">
                      {rows.length === 0 ? (
                        <div className="design-legend-empty">No candidates available for this position.</div>
                      ) : rows.map((row) => (
                        <div className="design-legend-row" key={row.candidate.id}>
                          <span className="design-swatch" style={{ background: row.color }} />
                          <span className="design-legend-name"><b>{row.candidate.name}</b><small>{formatNumber(row.votes)} votes</small></span>
                          <span className="design-legend-percent">{formatPercent(row.votes, total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              </div>
            )}

            <footer className="design-result-footer">
              <span><span className="d" /> Counts update automatically as votes are recorded.</span>
              <span>Last view: {new Date().toLocaleString('en-PH')}</span>
            </footer>
          </section>

          <WinnersByPositionSection
            positionResults={positionResults}
            winnerGraphRows={winnerGraphRows}
            winnerGraphTotal={winnerGraphTotal}
            pendingPositions={pendingPositions}
            onExport={() => void exportWinners()}
            exporting={exportingWinners}
          />

          <DesignOverviewSection
            election={display.election}
            aggregate={display.aggregate}
            activeCandidates={activeCandidates}
            positionsCovered={positionsCovered}
            setupReady={setupReady}
            turnoutPercent={turnoutPercent}
            positionsCount={display.positions.length}
          />
          <DesignManagementSections
            admins={admins}
            elections={elections}
            auditEntries={auditEntries}
            config={config}
            actorUid={actorUid}
            actorEmail={actorEmail}
            onError={setDataError}
          />
          {dataError && <p className="form-message is-error" role="alert">{dataError}</p>}
        </main>
      </div>
    </div>
  );
}

function WinnersByPositionSection({
  positionResults,
  winnerGraphRows,
  winnerGraphTotal,
  pendingPositions,
  onExport,
  exporting,
}: {
  positionResults: PositionResult[];
  winnerGraphRows: WinnerGraphRow[];
  winnerGraphTotal: number;
  pendingPositions: number;
  onExport: () => void;
  exporting: boolean;
}) {
  return (
    <section className="design-position-section" id="design-02" data-design-id="02" aria-labelledby="winners-by-position-title">
      <div className="design-section-heading">
        <div><DesignLabel code="02" name="Winners by position" /><span className="design-kicker">Race-by-race results</span><h2 id="winners-by-position-title">Winners by Position</h2></div>
        <div className="design-section-actions">
          <span className="design-section-note">{positionResults.length} positions · independently calculated</span>
          <button className="btn btn-primary design-export-btn" type="button" disabled={exporting} onClick={onExport}>
            <Download size={16} aria-hidden="true" /> {exporting ? 'Preparing…' : 'Export Winners'}
          </button>
        </div>
      </div>
      {positionResults.length === 0 ? (
        <div className="design-empty-state"><BarChart3 size={30} aria-hidden="true" /><strong>No positions available</strong><span>Position results will appear when the election is configured.</span></div>
      ) : (
        <>
          <article className="design-winner-position-graph" data-design-id="02A">
            <div className="design-card-heading">
              <div><DesignLabel code="02A" name="Combined winner graph" /><span className="design-kicker">Combined winner distribution</span><h3>All position winners in one graph</h3></div>
              <span className="design-graph-meta">{formatNumber(winnerGraphTotal)} winner votes</span>
            </div>
            <p className="design-card-copy">Each slice represents a winning candidate in a department position. Percentages are calculated across the displayed position-winner votes.</p>
            <div className="design-winner-position-graph-layout">
              <Doughnut rows={winnerGraphRows} total={winnerGraphTotal} />
              <div className="design-winner-position-legend" aria-label="Winner distribution by position">
                {winnerGraphRows.length === 0 ? (
                  <div className="design-legend-empty">No votes yet. Position winners will appear here as votes are recorded.</div>
                ) : winnerGraphRows.map((row) => (
                  <div className="design-winner-position-legend-row" key={row.id}>
                    <span className="design-swatch" style={{ background: row.color }} />
                    <span><b>{row.positionName}</b><small>{row.label}</small></span>
                    <strong>{formatNumber(row.votes)} · {formatPercent(row.votes, winnerGraphTotal)}</strong>
                  </div>
                ))}
                {pendingPositions > 0 && <small className="design-pending-note">{pendingPositions} position{pendingPositions === 1 ? '' : 's'} have no winner yet.</small>}
              </div>
            </div>
          </article>
        </>
      )}
    </section>
  );
}

export function DesignOverviewSection({
  election,
  aggregate,
  activeCandidates,
  positionsCovered,
  setupReady,
  turnoutPercent,
  positionsCount,
}: {
  election: Election | null;
  aggregate: ReturnType<typeof buildAggregate>;
  activeCandidates: number;
  positionsCovered: number;
  setupReady: boolean;
  turnoutPercent: number;
  positionsCount: number;
}) {
  const status = election?.status ?? 'draft';
  const statusLabel = status === 'open' ? 'Voting open' : status === 'published' ? 'Results published' : status === 'closed' ? 'Voting closed' : 'Draft';
  const statusClass = status === 'open' ? 'is-open' : status === 'published' ? 'is-published' : status === 'closed' ? 'is-closed' : 'is-draft';

  return (
    <section className="design-overview-section" id="design-03" data-design-id="03" aria-labelledby="design-overview-title">
      <div className="design-section-heading">
        <div><DesignLabel code="03" name="Election overview" /><span className="design-kicker">Election control</span><h2 id="design-overview-title">The operating picture</h2></div>
        <span className={`design-status-pill ${statusClass}`}><span className="d" />{statusLabel}</span>
      </div>
      <div className="design-metric-grid">
        {[
          { icon: Users, value: aggregate.eligible.total, label: 'Registered voters' },
          { icon: Vote, value: aggregate.turnout.total, label: 'Ballots cast' },
          { icon: BarChart3, value: `${turnoutPercent}%`, label: 'Turnout' },
          { icon: CalendarClock, value: activeCandidates, label: 'Active candidates' },
        ].map(({ icon: Icon, value, label }) => (
          <div className="design-metric" key={label}>
            <span className="design-metric-icon"><Icon size={18} aria-hidden="true" /></span>
            <div><strong>{typeof value === 'number' ? formatNumber(value) : value}</strong><span>{label}</span></div>
          </div>
        ))}
      </div>
      <div className="design-overview-lower">
        <div className="design-status-card">
          <div className="design-card-heading"><div><span className="design-kicker">Election information</span><h3>{election?.title ?? 'Election record unavailable'}</h3></div><span className="design-record-id">{election?.id ?? ELECTION_ID}</span></div>
          <div className="design-fact-grid">
            <div><span>Status</span><strong>{statusLabel}</strong></div>
            <div><span>Registration</span><strong>{election?.registrationOpen === false ? 'Closed' : 'Open'}</strong></div>
            <div><span>Positions covered</span><strong>{positionsCovered} / {positionsCount}</strong></div>
            <div><span>Setup</span><strong>{setupReady ? 'Ready' : 'Needs attention'}</strong></div>
          </div>
        </div>
        <div className="design-turnout-card">
          <div className="design-card-heading"><div><span className="design-kicker">Turnout by year</span><h3>Participation</h3></div><span className="design-graph-meta">{formatNumber(aggregate.turnout.total)} ballots</span></div>
          <div className="design-year-list">
            {[1, 2, 3, 4].map((year) => {
              const voted = aggregate.turnout.byYear[String(year)] ?? 0;
              const eligible = aggregate.eligible.byYear[String(year)] ?? 0;
              const share = percent(voted, eligible);
              return (
                <div className="design-year-row" key={year}>
                  <span>{yearLabel(year)}</span>
                  <div className="design-year-track"><i style={{ width: `${share}%` }} /></div>
                  <b>{voted}<small> / {eligible} · {share}%</small></b>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {status === 'draft' && (
        <div className={`design-setup-note${setupReady ? ' ready' : ''}`} role="status">
          <span>{setupReady ? 'Setup complete.' : 'Setup checklist'}</span>
          <p>{setupReady ? 'All required positions and eligible voters are ready for the next lifecycle action.' : `${positionsCovered} of ${positionsCount} positions have an active candidate and ${aggregate.eligible.total} eligible voters are registered.`}</p>
        </div>
      )}
    </section>
  );
}

export function DesignManagementSections({
  admins,
  elections,
  auditEntries,
  config,
  actorUid,
  actorEmail,
  onError,
}: {
  admins: AdminEntry[];
  elections: Election[];
  auditEntries: AuditEntry[];
  config: AppConfig;
  actorUid: string;
  actorEmail: string;
  onError: (message: string) => void;
}) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountNotice, setAccountNotice] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminNotice, setAdminNotice] = useState('');
  const [editingElection, setEditingElection] = useState('');
  const [electionTitle, setElectionTitle] = useState('');
  const [electionBusy, setElectionBusy] = useState(false);
  const [electionNotice, setElectionNotice] = useState('');
  const [settingBusy, setSettingBusy] = useState('');
  const [settingNotice, setSettingNotice] = useState('');
  const [openAudit, setOpenAudit] = useState<Set<string>>(new Set());

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim());
  const accountEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail.trim());
  const accountPasswordValid = accountPassword.length >= 8;
  const orderedElections = [...elections].sort((a, b) => (a.id === ELECTION_ID ? -1 : b.id === ELECTION_ID ? 1 : a.id.localeCompare(b.id)));

  async function createAccount() {
    if (!accountEmailValid || !accountPasswordValid || accountBusy) return;
    setAccountBusy(true);
    setAccountNotice('');
    try {
      const result = await createAdminAccount({ email: accountEmail, password: accountPassword });
      setAccountEmail('');
      setAccountPassword('');
      setAccountNotice(`${result.email} can now sign in as an admin.`);
    } catch (error) {
      setAccountNotice((error as Error).message || 'Unable to create the admin account.');
    } finally {
      setAccountBusy(false);
    }
  }

  async function addAdmin() {
    const email = inviteEmail.trim().toLowerCase();
    if (!emailValid || admins.some((admin) => admin.email === email) || adminBusy) return;
    const reason = window.prompt('Reason for granting admin access (at least 8 characters):')?.trim() ?? '';
    if (reason.length < 8) {
      setAdminNotice('Admin grants require a reason of at least 8 characters.');
      return;
    }
    setAdminBusy(true);
    setAdminNotice('');
    try {
      await grantAdmin({ email, reason, actorUid });
      setInviteEmail('');
      setAdminNotice(`${email} now has admin access.`);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function removeAdmin(admin: AdminEntry) {
    const reason = window.prompt(`Reason for revoking ${admin.email} (at least 8 characters):`)?.trim() ?? '';
    if (reason.length < 8) {
      setAdminNotice('Admin revokes require a reason of at least 8 characters.');
      return;
    }
    setAdminBusy(true);
    setAdminNotice('');
    try {
      await revokeAdmin({ email: admin.email, reason, actorUid });
      setAdminNotice(`${admin.email} no longer has admin access.`);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function saveTitle(electionId: string) {
    if (!electionTitle.trim() || electionBusy) return;
    setElectionBusy(true);
    try {
      await updateElectionTitle(electionId, electionTitle);
      setElectionNotice('Election title updated.');
      setEditingElection('');
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setElectionBusy(false);
    }
  }

  async function toggleSetting(key: 'allowGuestVoters' | 'maintenanceMode') {
    if (settingBusy) return;
    setSettingBusy(key);
    setSettingNotice('');
    try {
      await saveAppConfig({ ...config, [key]: !config[key] }, actorUid);
      setSettingNotice('Settings saved.');
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setSettingBusy('');
    }
  }

  function toggleAudit(id: string) {
    setOpenAudit((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="design-management-section" id="design-04" data-design-id="04" aria-labelledby="design-management-title">
      <div className="design-section-heading">
        <div><DesignLabel code="04" name="Management console" /><span className="design-kicker">Control center</span><h2 id="design-management-title">Manage the election</h2></div>
        <span className="design-section-note">Existing superadmin controls, redesigned</span>
      </div>
      <div className="design-management-grid">
        <article className="design-management-card design-admin-card">
          <div className="design-card-heading"><div><span className="design-kicker"><Users size={12} /> Access control</span><h3>Admins</h3></div><span className="design-card-count">{admins.length + 1} total</span></div>
          <p className="design-card-copy">Grant or revoke runtime admin access. Every change is audit-logged.</p>
          <div className="design-admin-stats"><span><b>{admins.length}</b>Runtime grants</span><span><b>1</b>Super admin</span></div>
          <form className="design-admin-account-form" onSubmit={(event) => { event.preventDefault(); void createAccount(); }}>
            <div className="design-form-heading"><span>Create admin account</span><small>Email and password</small></div>
            <label className="design-form-field">
              <span>Email</span>
              <input type="email" autoComplete="off" value={accountEmail} placeholder="admin@example.com" onChange={(event) => { setAccountEmail(event.target.value); setAccountNotice(''); }} />
            </label>
            <label className="design-form-field">
              <span>Password</span>
              <input type="password" autoComplete="new-password" value={accountPassword} placeholder="At least 8 characters" onChange={(event) => { setAccountPassword(event.target.value); setAccountNotice(''); }} />
            </label>
            <button className="btn btn-primary btn-sm" type="submit" disabled={!accountEmailValid || !accountPasswordValid || accountBusy}>
              {accountBusy ? 'Creating…' : 'Create admin account'}
            </button>
            {accountNotice && <p className="design-inline-notice" role="status">{accountNotice}</p>}
          </form>
          <div className="design-inline-form">
            <label><span className="sr-only">Existing admin email</span><input type="email" value={inviteEmail} placeholder="Existing account email" onChange={(event) => setInviteEmail(event.target.value)} /></label>
            <button className="btn btn-primary btn-sm" type="button" disabled={!emailValid || adminBusy} onClick={() => void addAdmin()}>Grant</button>
          </div>
          {adminNotice && <p className="design-inline-notice" role="status">{adminNotice}</p>}
          <div className="design-compact-list">
            <div className="design-compact-row"><span className="design-avatar">{initials(actorEmail)}</span><span><b>{actorEmail}</b><small>Root super admin</small></span><em>Super</em></div>
            {admins.map((admin) => (
              <div className="design-compact-row" key={admin.id}><span className="design-avatar">{initials(admin.email)}</span><span><b>{admin.email}</b><small>{formatTimestamp(admin.createdAt) || 'Recently granted'}</small></span><button className="btn btn-danger btn-sm" type="button" disabled={adminBusy} onClick={() => void removeAdmin(admin)}>Revoke</button></div>
            ))}
            {admins.length === 0 && <small className="design-muted-row">No runtime admins yet.</small>}
          </div>
        </article>

        <article className="design-management-card">
          <div className="design-card-heading"><div><span className="design-kicker"><Vote size={12} /> Cycles</span><h3>Elections</h3></div><a className="design-text-link" href="/admin">Manage <ExternalLink size={13} /></a></div>
          <p className="design-card-copy">Live election records and current registration state.</p>
          {electionNotice && <p className="design-inline-notice" role="status">{electionNotice}</p>}
          <div className="design-compact-list">
            {orderedElections.length === 0 ? <small className="design-muted-row">No election records found.</small> : orderedElections.map((election) => (
              <div className="design-election-row" key={election.id}>
                <div className="design-election-main">
                  <span className="design-election-icon"><Vote size={15} /></span>
                  <div>
                    {editingElection === election.id ? <input className="design-title-input" value={electionTitle} autoFocus onChange={(event) => setElectionTitle(event.target.value)} /> : <b>{election.title || election.id}</b>}
                    <small>{election.id}{election.id === ELECTION_ID ? ' · current election' : ''} · registration {election.registrationOpen === false ? 'closed' : 'open'}</small>
                  </div>
                </div>
                <div className="design-election-actions">
                  <em className={`design-mini-tag ${election.status}`}>{election.status}</em>
                  {editingElection === election.id ? <><button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditingElection('')}>Cancel</button><button className="btn btn-primary btn-sm" type="button" disabled={!electionTitle.trim() || electionBusy} onClick={() => void saveTitle(election.id)}>Save</button></> : <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setEditingElection(election.id); setElectionTitle(election.title ?? ''); setElectionNotice(''); }}>Rename</button>}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="design-management-card">
          <div className="design-card-heading"><div><span className="design-kicker"><Settings size={12} /> Configuration</span><h3>Settings</h3></div><span className="design-card-count">Live policy</span></div>
          <p className="design-card-copy">System-wide policy flags apply immediately and are written to the audit log.</p>
          {settingNotice && <p className="design-inline-notice" role="status">{settingNotice}</p>}
          <div className="design-settings-list">
            <div><span><b>Require .scc email</b><small>Institutional email validation is permanently enforced.</small></span><button className="toggle on" type="button" disabled aria-label="Require .scc email is always on" aria-pressed="true" /></div>
            <div><span><b>Allow one-time voters</b><small>Enable single-use guest access on the sign-in form.</small></span><button className={`toggle${config.allowGuestVoters ? ' on' : ''}`} type="button" disabled={settingBusy === 'allowGuestVoters'} aria-pressed={config.allowGuestVoters} onClick={() => void toggleSetting('allowGuestVoters')} /></div>
            <div><span><b>Maintenance mode</b><small>Pause the public ballot and show a maintenance notice.</small></span><button className={`toggle${config.maintenanceMode ? ' on' : ''}`} type="button" disabled={settingBusy === 'maintenanceMode'} aria-pressed={config.maintenanceMode} onClick={() => void toggleSetting('maintenanceMode')} /></div>
          </div>
          <div className="design-institution"><span>Institution</span><b>St. Clare College of Caloocan · Computer Science Department</b></div>
        </article>

        <article className="design-management-card design-audit-card">
          <div className="design-card-heading"><div><span className="design-kicker"><FileText size={12} /> Traceability</span><h3>Audit log</h3></div><span className="design-card-count">Latest {auditEntries.length}</span></div>
          <p className="design-card-copy">Immutable record of privileged actions across the control center.</p>
          <div className="design-audit-list">
            {auditEntries.length === 0 ? <small className="design-muted-row">No audit entries yet.</small> : auditEntries.slice(0, 8).map((entry) => {
              const open = openAudit.has(entry.id);
              return <div className={`design-audit-row${open ? ' open' : ''}`} key={entry.id}>
                <button type="button" aria-expanded={open} onClick={() => toggleAudit(entry.id)}><span className="design-audit-icon"><FileText size={14} /></span><span><b>{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}{auditDetail(entry) ? ` ${auditDetail(entry)}` : ''}</b><small>{formatTimestamp(entry.ts) || 'pending…'} · {entry.actorUid.slice(0, 8)}</small></span><em>{entry.actorRole ?? 'admin'}</em><ChevronDown size={15} /></button>
                {open && <div className="design-audit-detail"><span>Target <b>{entry.target}</b></span><span>Actor <b>{entry.actorUid}</b></span></div>}
              </div>;
            })}
          </div>
        </article>
      </div>
    </section>
  );
}
