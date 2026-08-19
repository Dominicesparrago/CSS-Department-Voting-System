"use client";

import { useId, useMemo, useRef, useState, type MouseEvent } from "react";

/**
 * Cumulative turnout curve as a lightweight custom SVG (no chart library).
 * The component receives the raw cast-ballot timestamps and derives the
 * cumulative curve itself, so everything rendered — axis labels, gridlines,
 * path, caption — comes from the actual data.
 */

export interface MomentumBallot {
  /** Epoch ms, ISO string, or Date. Anything unparseable is dropped. */
  votedAt: string | number | Date;
}

export interface MomentumAreaProps {
  /** Raw ballots (one per cast vote). At least 2 valid ones are needed. */
  ballots: MomentumBallot[];
}

const CHART_WIDTH = 640;
const CHART_HEIGHT = 150;

const PLOT_LEFT = 14;
const PLOT_RIGHT = 14;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 14;

const plotWidth = CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT;
const plotHeight = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;

function toDate(value: string | number | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? new Date(value) : null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

const formatCount = (value: number) =>
  Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);

const formatTime = (date: Date) =>
  date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function MomentumArea({ ballots }: MomentumAreaProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Unique per-instance gradient id so several charts on one page never clash.
  const gradientId = `${useId().replace(/:/g, "")}-momentum-fill`;

  // 1–3: keep valid ballots only, parse to Date, sort chronologically.
  const sortedBallots = useMemo(() => {
    return ballots
      .map((ballot) => toDate(ballot.votedAt))
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime());
  }, [ballots]);

  // 4–5: each ballot increments cumulative turnout by 1.
  const cumulative = useMemo(() => {
    let count = 0;
    return sortedBallots.map((time) => ({ time, count: ++count }));
  }, [sortedBallots]);

  const totalBallots = cumulative.length;

  const firstTimestamp = cumulative.length > 0 ? cumulative[0].time.getTime() : 0;
  const lastTimestamp = cumulative.length > 0 ? cumulative[cumulative.length - 1].time.getTime() : 0;
  const spanMs = lastTimestamp - firstTimestamp;

  const maxCount = Math.max(cumulative.length > 0 ? cumulative[cumulative.length - 1].count : 0, 1);

  // Chart-space points: x from time, y from cumulative count.
  const points = useMemo(() => {
    const span = Math.max(spanMs, 1); // avoids division by zero on equal timestamps
    return cumulative.map((point) => {
      const x = PLOT_LEFT + ((point.time.getTime() - firstTimestamp) / span) * plotWidth;
      const y = CHART_HEIGHT - PLOT_BOTTOM - (point.count / maxCount) * plotHeight;
      return { ...point, x, y };
    });
  }, [cumulative, firstTimestamp, spanMs, maxCount]);

  // Use an event-step curve rather than smoothing: each horizontal segment is
  // the time between ballots and each vertical segment is an actual ballot.
  const { linePath, areaPath } = useMemo(() => {
    if (points.length < 2) return { linePath: "", areaPath: "" };
    const first = points[0];
    const last = points[points.length - 1];

    let line = `M ${first.x.toFixed(2)},${first.y.toFixed(2)}`;
    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1];
      const current = points[i];
      line += ` L ${current.x.toFixed(2)},${previous.y.toFixed(2)} L ${current.x.toFixed(2)},${current.y.toFixed(2)}`;
    }

    const bottom = CHART_HEIGHT - PLOT_BOTTOM;
    const area = `${line} L ${last.x.toFixed(2)},${bottom} L ${first.x.toFixed(2)},${bottom} Z`;
    return { linePath: line, areaPath: area };
  }, [points]);

  // Gridlines at 25% / 50% / 75% of the plot height.
  const gridLines = useMemo(() => {
    const levels = [0.25, 0.5, 0.75];
    return levels.map((level) => ({
      level,
      y: CHART_HEIGHT - PLOT_BOTTOM - level * plotHeight,
    }));
  }, []);

  function handleMouseMove(event: MouseEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg || points.length < 2) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = point.matrixTransform(ctm.inverse());
    const clampedX = Math.min(CHART_WIDTH - PLOT_RIGHT, Math.max(PLOT_LEFT, local.x));

    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const distance = Math.abs(points[i].x - clampedX);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    setHoveredIndex(best);
  }

  if (totalBallots < 2) {
    return (
      <div className="momentum-card">
        <div className="state-block momentum-empty">
          <strong>Not enough data yet</strong>
          <small>The turnout curve appears once ballots start coming in.</small>
        </div>
      </div>
    );
  }

  const hovered = hoveredIndex !== null ? points[hoveredIndex] : null;
  const durationLabel = formatDuration(spanMs);
  const avgRate = spanMs > 0 ? totalBallots / (spanMs / 1000 / 60) : 0;
  const latest = cumulative[cumulative.length - 1];
  const firstTime = cumulative[0].time;

  // Tooltip placement: flip toward the inside when near the chart edges.
  const hoverPct = hovered
    ? {
        left: (hovered.x / CHART_WIDTH) * 100,
        top: (hovered.y / CHART_HEIGHT) * 100,
      }
    : null;
  const tooltipStyle: React.CSSProperties = hoverPct
    ? {
        left: `${hoverPct.left}%`,
        top: `${hoverPct.top}%`,
        transform:
          hoverPct.left > 60
            ? hoverPct.top < 25
              ? "translate(calc(-100% - 12px), 12px)"
              : "translate(calc(-100% - 12px), calc(-100% - 12px))"
            : hoverPct.top < 25
              ? "translate(-50%, 12px)"
              : "translate(-50%, calc(-100% - 12px))",
      }
    : {};

  return (
    <div className="momentum-card">
      <div className="momentum-summary">
        <div>
          <span className="momentum-kicker">Participation signal</span>
          <strong className="momentum-total">{totalBallots.toLocaleString()}</strong>
          <span className="momentum-total-label">ballots recorded</span>
        </div>
        <div className="momentum-live"><i aria-hidden="true" /> <span>Live activity</span></div>
        <div className="momentum-last">
          <span>Latest checkpoint</span>
          <b>{formatTime(latest.time)}</b>
          <small>{formatDuration(latest.time.getTime() - firstTime.getTime())} since first ballot</small>
        </div>
      </div>

      <div className="mom-y" aria-hidden="true">
        <span>{formatCount(maxCount)}</span>
        <span>{formatCount(maxCount / 2)}</span>
        <span>0</span>
      </div>

      <div className="momentum-plot">
        <svg
          ref={svgRef}
          className="momentum"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Cumulative ballots over time — ${totalBallots} ballots cast`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridLines.map((grid) => (
            <line key={grid.level} className="mom-grid" x1={PLOT_LEFT} x2={CHART_WIDTH - PLOT_RIGHT} y1={grid.y} y2={grid.y} />
          ))}

          <path d={areaPath} fill={`url(#${gradientId})`} />

          <path
            d={linePath}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {hovered && (
            <>
              <line
                className="mom-hover-line"
                x1={hovered.x}
                x2={hovered.x}
                y1={PLOT_TOP}
                y2={CHART_HEIGHT - PLOT_BOTTOM}
              />
              <circle className="mom-hover-point" cx={hovered.x} cy={hovered.y} r="4" />
            </>
          )}

          <rect
            x={PLOT_LEFT}
            y={PLOT_TOP}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredIndex(null)}
          />
        </svg>

        <span
          className="mom-dot"
          style={{
            left: `${(points[points.length - 1].x / CHART_WIDTH) * 100}%`,
            top: `${(points[points.length - 1].y / CHART_HEIGHT) * 100}%`,
          }}
          aria-hidden="true"
        />

        {hovered && (
          <div className="mom-tooltip" style={tooltipStyle} aria-hidden="true">
            <strong>{formatTime(hovered.time)}</strong>
            <span>{hovered.count.toLocaleString()} ballots</span>
          </div>
        )}
      </div>

      <div className="mom-x" aria-hidden="true">
        <span>{formatTime(cumulative[0].time)}</span>
        <span>{formatTime(cumulative[cumulative.length - 1].time)}</span>
      </div>

      <p className="mom-cap">
        <span><b>{formatTime(firstTime)}</b> start</span>
        <span>over <b>{durationLabel}</b></span>
        <span className="mom-rate"><b>{avgRate.toFixed(1)}</b> ballots/min avg</span>
      </p>
    </div>
  );
}
