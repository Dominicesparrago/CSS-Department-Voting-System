/** Cumulative turnout curve as a lightweight SVG area (no chart lib). */
export default function MomentumArea({ points }: { points: { t: number; count: number }[] }) {
  if (points.length < 2) {
    return (
      <div className="state-block">
        <strong>Not enough data yet</strong>
        <small>The turnout curve appears once ballots start coming in.</small>
      </div>
    );
  }

  const W = 640;
  const H = 150;
  const PAD = 8;
  const n = points.length;
  const maxCount = points[n - 1].count;
  const minT = points[0].t;
  const maxT = points[n - 1].t;
  const span = maxT - minT;
  const timed = span > 0;

  const x = (i: number) => {
    const frac = timed ? (points[i].t - minT) / span : i / (n - 1);
    return PAD + frac * (W - 2 * PAD);
  };
  const y = (count: number) => H - PAD - (count / maxCount) * (H - 2 * PAD);

  const line = points.map((point, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(point.count).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${(H - PAD).toFixed(1)} L${x(0).toFixed(1)},${(H - PAD).toFixed(1)} Z`;

  const minutes = timed ? Math.max(1, Math.round(span / 60000)) : 0;

  return (
    <>
      <svg className="momentum" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Cumulative ballots over time">
        <defs>
          <linearGradient id="mom-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#mom-fill)" />
        <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(n - 1)} cy={y(maxCount)} r="3.5" fill="var(--brand)" />
      </svg>
      <p className="mom-cap">
        <span><b>{maxCount}</b> ballots cast</span>
        {timed && <span>over <b>{minutes}</b> min of voting</span>}
      </p>
    </>
  );
}
