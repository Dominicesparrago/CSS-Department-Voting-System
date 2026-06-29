'use client';

import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { aggregateVotes, rankedCandidatesForPosition } from '@/lib/admin/adminCore';
import type { Candidate, Position, Vote, Voter } from '@/lib/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const PALETTE = ['#22b8a0', '#1cabb8', '#3bd6b0', '#1a8fa0', '#a0ede2', '#0e6e7e', '#2dc4a2', '#115e6e'];
function palette(n: number) { return Array.from({ length: n }, (_, i) => PALETTE[i % PALETTE.length]); }

const BAR_OPTS = (horizontal = false) => ({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: horizontal ? ('y' as const) : ('x' as const),
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: '#a0ede2' }, grid: { color: 'rgba(120,200,190,.12)' } },
    y: { beginAtZero: true, ticks: { color: '#a0ede2', precision: 0 }, grid: { color: 'rgba(120,200,190,.12)' } },
  },
});

const DOUGHNUT_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: true, labels: { color: '#f4fcfb' } } },
};

interface Props {
  positions: Position[];
  candidates: Candidate[];
  voters: Voter[];
  votes: Vote[];
  selectedPositionId: string;
  onPositionChange: (id: string) => void;
}

export default function MonitorTab({ positions, candidates, voters, votes, selectedPositionId, onPositionChange }: Props) {
  const aggregate = aggregateVotes({ votes, candidates, positions, voters });
  const selectedCandidates = rankedCandidatesForPosition(candidates, aggregate, selectedPositionId);
  const selectedPosition = positions.find((p) => p.id === selectedPositionId);
  const distribution = positions.map((p) => aggregate.perPosition[p.id] ?? 0);

  const countsData = {
    labels: selectedCandidates.map((c) => c.name),
    datasets: [{ label: selectedPosition?.name ?? 'Votes', data: selectedCandidates.map((c) => c.votes), backgroundColor: palette(selectedCandidates.length), borderColor: 'rgba(10,14,15,.55)', borderWidth: 1 }],
  };
  const distData = {
    labels: positions.map((p) => p.name),
    datasets: [{ label: 'Votes per position', data: distribution, backgroundColor: palette(positions.length), borderColor: 'rgba(10,14,15,.55)', borderWidth: 1 }],
  };
  const turnoutData = {
    labels: ['Year 1', 'Year 2', 'Year 3', 'Year 4'],
    datasets: [{ label: 'Turnout', data: ['1','2','3','4'].map((y) => aggregate.turnout.byYear[y] ?? 0), backgroundColor: palette(4), borderColor: 'rgba(10,14,15,.55)', borderWidth: 1 }],
  };
  const leaderData = {
    labels: selectedCandidates.map((c) => c.name),
    datasets: [{ label: 'Ranked votes', data: selectedCandidates.map((c) => c.votes), backgroundColor: palette(selectedCandidates.length), borderColor: 'rgba(10,14,15,.55)', borderWidth: 1 }],
  };

  return (
    <section className="admin-section is-active" data-admin-panel="monitor">
      <div className="metric-grid">
        <article className="metric-card">
          <span>Total turnout</span>
          <strong id="turnout-total">{aggregate.turnout.total}</strong>
          <small id="turnout-eligible">{aggregate.eligible.total} eligible voters</small>
        </article>
        <article className="metric-card">
          <span>Vote documents</span>
          <strong id="vote-doc-total">{aggregate.voteDocTotal}</strong>
          <small>Immutable records</small>
        </article>
        <article className="metric-card">
          <span>Active candidates</span>
          <strong id="active-candidate-total">{candidates.filter((c) => c.active).length}</strong>
          <small id="candidate-total">{candidates.length} total candidates</small>
        </article>
      </div>

      <div className="admin-card">
        <label>
          Position filter
          <select id="position-filter" value={selectedPositionId} onChange={(e) => onPositionChange(e.target.value)}>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.order}. {p.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="chart-grid">
        <article className="admin-card chart-card" data-spot>
          <h2>Live vote counts</h2>
          <Bar id="candidate-counts-chart" data={countsData} options={BAR_OPTS()} aria-label="Live vote counts per candidate" />
        </article>
        <article className="admin-card chart-card" data-spot>
          <h2>Vote distribution</h2>
          <Doughnut id="distribution-chart" data={distData} options={DOUGHNUT_OPTS} aria-label="Vote distribution per position" />
        </article>
        <article className="admin-card chart-card" data-spot>
          <h2>Turnout by year</h2>
          <Bar id="turnout-chart" data={turnoutData} options={BAR_OPTS()} aria-label="Turnout by year level" />
        </article>
        <article className="admin-card chart-card" data-spot>
          <h2>Leaderboard</h2>
          <Bar id="leaderboard-chart" data={leaderData} options={BAR_OPTS(true)} aria-label="Candidate ranking by selected position" />
        </article>
      </div>
    </section>
  );
}
