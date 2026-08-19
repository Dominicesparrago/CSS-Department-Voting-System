# Task: Implement an Enhanced Turnout Momentum Graph

You are implementing the `Turnout Momentum Graph` in the existing voting application.

The graph must remain a lightweight custom SVG implementation. **Do not install or use Chart.js, Recharts, ApexCharts, D3, or any other charting library.**

The implementation must be production-ready, responsive, data-driven, accessible, and compatible with the existing application theme.

---

## Target Component

Update or create:

```text
MomentumArea.tsx
```

and the corresponding styles in:

```text
styles/components.css
```

Use the application's existing project structure and existing imports where possible.

---

# 1. Required Component Imports

Use React imports appropriate for the existing project.

The component should use:

```tsx
import { useMemo, useState } from "react";
```

Do not introduce unnecessary dependencies.

If the project already has a shared type for ballots/votes, use that existing type instead of creating a duplicate type.

---

# 2. Expected Component API

Implement the component so it can receive the real voting data.

Recommended API:

```tsx
interface MomentumBallot {
  votedAt: string | Date;
}

interface MomentumAreaProps {
  ballots: MomentumBallot[];
}
```

Component:

```tsx
export default function MomentumArea({
  ballots,
}: MomentumAreaProps) {
  // implementation
}
```

If the existing project already has a ballot type, replace `MomentumBallot` with that project type.

Do not rename existing application data fields unless necessary.

---

# 3. Data Processing

The graph represents **cumulative ballots over time**.

Process the input data as follows:

1. Remove invalid records where `votedAt` cannot be parsed.
2. Convert `votedAt` to `Date`.
3. Sort the records chronologically.
4. Each ballot increases cumulative turnout by 1.
5. The resulting cumulative data should look conceptually like:

```tsx
[
  {
    time: Date,
    count: 1
  },
  {
    time: Date,
    count: 2
  },
  {
    time: Date,
    count: 3
  }
]
```

Do not assume a fixed number of ballots.

---

# 4. Empty State

When there are fewer than 2 valid ballots, render:

```html
<div class="state-block momentum-empty">
  <strong>Not enough data yet</strong>
  <small>The turnout curve appears once ballots start coming in.</small>
</div>
```

The empty state must use the existing application's `state-block` styles.

Do not render the chart when there are fewer than 2 ballots.

---

# 5. Chart Dimensions

Use a fixed SVG coordinate system:

```text
640 × 150
```

The chart plotting area should use:

```tsx
const CHART_WIDTH = 640;
const CHART_HEIGHT = 150;

const PLOT_LEFT = 14;
const PLOT_RIGHT = 14;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 14;
```

Calculate:

```tsx
const plotWidth =
  CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT;

const plotHeight =
  CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
```

Do not hard-code the graph path based on sample numbers.

All coordinates must be calculated from the actual ballot data.

---

# 6. X Coordinate Calculation

The earliest ballot should map to the left side of the graph.

The latest ballot should map to the right side.

Use:

```tsx
const x =
  PLOT_LEFT +
  ((timestamp - firstTimestamp) /
    Math.max(lastTimestamp - firstTimestamp, 1)) *
    plotWidth;
```

This prevents division-by-zero when timestamps are equal.

---

# 7. Y Coordinate Calculation

The graph represents cumulative turnout.

The bottom represents zero.

The top represents the maximum cumulative ballot count.

Use:

```tsx
const maxCount = Math.max(
  cumulativeData[cumulativeData.length - 1].count,
  1
);

const y =
  CHART_HEIGHT -
  PLOT_BOTTOM -
  (count / maxCount) * plotHeight;
```

The first point should therefore begin near the lower part of the chart and the final point near the upper part.

---

# 8. Dynamic Y-Axis Labels

Do NOT hard-code:

```text
1280
640
0
```

Calculate them from the dataset.

Display three labels:

```text
max
half
0
```

For example, if the final turnout is `1280`:

```text
1280
640
0
```

If the final turnout is `37`:

```text
37
18.5
0
```

Prefer sensible integer formatting where appropriate.

Create a formatter such as:

```tsx
const formatCount = (value: number) =>
  Number.isInteger(value)
    ? value.toLocaleString()
    : value.toFixed(1);
```

---

# 9. Horizontal Grid Lines

Keep three horizontal gridlines:

```text
25%
50%
75%
```

Calculate their Y positions dynamically.

Example:

```tsx
const gridLevels = [0.25, 0.5, 0.75];

const gridY =
  CHART_HEIGHT -
  PLOT_BOTTOM -
  level * plotHeight;
```

Do not use fixed values like:

```text
105.5
75
44.5
```

---

# 10. Area Path

Create a filled SVG area underneath the turnout curve.

The area path should be generated from the calculated points.

Conceptually:

```text
M firstX, firstY
L ...
L lastX,lastY
L lastX,bottom
L firstX,bottom
Z
```

The fill should use:

```tsx
fill="url(#momentum-fill)"
```

Use a gradient similar to:

```tsx
<linearGradient
  id="momentum-fill"
  x1="0"
  y1="0"
  x2="0"
  y2="1"
>
  <stop
    offset="0%"
    stopColor="var(--brand)"
    stopOpacity="0.30"
  />
  <stop
    offset="100%"
    stopColor="var(--brand)"
    stopOpacity="0"
  />
</linearGradient>
```

---

# 11. Smoother Curve

Do not simply connect every point using visible sharp line segments.

Create a smoother SVG path using a lightweight smoothing algorithm.

For example, calculate midpoint/control points between adjacent points and generate a quadratic Bézier path.

The curve should remain faithful to the cumulative data.

Do not use an external library for smoothing.

The curve should still visibly represent the actual turnout progression.

---

# 12. Main Stroke

Render the main curve using:

```tsx
fill="none"
stroke="var(--brand)"
strokeWidth="2"
strokeLinecap="round"
strokeLinejoin="round"
vectorEffect="non-scaling-stroke"
```

---

# 13. Endpoint Dot

Keep an HTML overlay endpoint dot instead of using an SVG circle.

The endpoint dot must remain perfectly circular when the SVG scales.

Calculate the endpoint position from the final chart point.

Example:

```tsx
const endpoint = points[points.length - 1];

const endpointLeft =
  (endpoint.x / CHART_WIDTH) * 100;

const endpointTop =
  (endpoint.y / CHART_HEIGHT) * 100;
```

Render:

```tsx
<span
  className="mom-dot"
  style={{
    left: `${endpointLeft}%`,
    top: `${endpointTop}%`,
  }}
  aria-hidden="true"
/>
```

---

# 14. Hover Interaction

Add interactive hover behavior.

The user should be able to move the mouse across the graph and inspect turnout at that point.

Add a transparent SVG interaction layer:

```tsx
<rect
  x={PLOT_LEFT}
  y={PLOT_TOP}
  width={plotWidth}
  height={plotHeight}
  fill="transparent"
  onMouseMove={handleMouseMove}
  onMouseLeave={() => setHoveredIndex(null)}
/>
```

Determine the nearest data point to the mouse position.

Store:

```tsx
const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
```

When a point is hovered, show a tooltip.

---

# 15. Tooltip

The tooltip should display:

```text
10:32
842 ballots
```

Example JSX:

```tsx
<div className="mom-tooltip">
  <strong>10:32</strong>
  <span>842 ballots</span>
</div>
```

The tooltip must be positioned relative to the hovered point.

Prevent the tooltip from escaping the chart container.

If the point is near the right edge, position the tooltip toward the left.

If the point is near the top, position it below the point.

---

# 16. Hover Guide Line

When hovering over the graph, show a subtle vertical guide line.

Example:

```tsx
<line
  className="mom-hover-line"
  x1={hoveredPoint.x}
  x2={hoveredPoint.x}
  y1={PLOT_TOP}
  y2={CHART_HEIGHT - PLOT_BOTTOM}
/>
```

The guide line must only appear while hovering.

---

# 17. Hover Point

Also render a small highlighted SVG point at the hovered position.

Example:

```tsx
<circle
  className="mom-hover-point"
  cx={hoveredPoint.x}
  cy={hoveredPoint.y}
  r="4"
/>
```

The hover point should visually complement the endpoint dot.

---

# 18. X-Axis Labels

The first X-axis label should use the earliest ballot time.

The second should use the latest ballot time.

Example:

```text
08:00                         10:45
```

Do not hard-code:

```text
08:00
10:45
```

Use actual ballot timestamps.

Create a formatter:

```tsx
const formatTime = (date: Date) =>
  date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
```

Use the project's preferred locale/time formatting if one already exists.

---

# 19. Caption

The caption should dynamically display:

```text
1280 ballots cast
over 2h 45m
7.8 ballots/min avg
```

Calculate:

### Total

```tsx
const totalBallots = cumulativeData.length;
```

### Duration

```tsx
const durationMs =
  lastTimestamp - firstTimestamp;
```

Format duration into:

```text
2h 45m
```

For short durations:

```text
12m
```

For durations with hours and minutes:

```text
2h 45m
```

### Average pace

```tsx
const durationMinutes =
  durationMs / 1000 / 60;

const avgRate =
  durationMinutes > 0
    ? totalBallots / durationMinutes
    : 0;
```

Display one decimal place:

```text
7.8 ballots/min avg
```

---

# 20. SVG Accessibility

The SVG must include:

```tsx
role="img"
aria-label="Cumulative ballots over time"
```

Use a dynamic aria label if practical.

The interactive tooltip should not interfere with screen readers.

The chart itself should remain understandable without hover interaction.

---

# 21. React Performance

Use:

```tsx
useMemo()
```

for expensive calculations such as:

* sorted ballots
* cumulative data
* chart points
* SVG paths
* grid positions

Avoid recalculating the entire graph on every mouse move.

---

# 22. CSS

Keep the existing theme variables:

```text
--line
--radius-md
--brand
--muted-soft
--font-mono
--tint-400
```

Use this base layout:

```css
.momentum-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 10px;
  row-gap: 4px;
  padding: 14px 16px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: rgba(10, 14, 15, 0.4);
}

.momentum-plot {
  position: relative;
  height: 150px;
  min-width: 0;
}

.momentum {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
```

---

# 23. Grid Styling

Use:

```css
.mom-grid {
  stroke: rgba(120, 200, 190, 0.1);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 3 4;
}
```

---

# 24. Hover Styling

Add:

```css
.mom-hover-line {
  stroke: rgba(120, 200, 190, 0.25);
  stroke-width: 1;
  stroke-dasharray: 3 4;
  vector-effect: non-scaling-stroke;
}

.mom-hover-point {
  fill: var(--brand);
  stroke: rgba(10, 14, 15, 0.9);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
```

---

# 25. Endpoint Styling

Use:

```css
.mom-dot {
  position: absolute;
  width: 8px;
  height: 8px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--brand);
  box-shadow:
    0 0 0 3px rgba(34, 184, 160, 0.22),
    0 0 14px rgba(34, 184, 160, 0.55);
  pointer-events: none;
}
```

---

# 26. Tooltip Styling

Add:

```css
.mom-tooltip {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  min-width: 92px;
  padding: 7px 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: rgba(10, 14, 15, 0.94);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  line-height: 1.35;
  white-space: nowrap;
}

.mom-tooltip strong {
  display: block;
  color: var(--tint-400);
  font-weight: 600;
}

.mom-tooltip span {
  display: block;
  margin-top: 2px;
  color: var(--muted-soft);
}
```

---

# 27. Axis Styling

Keep:

```css
.mom-y {
  grid-row: 1;
  grid-column: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  padding: 5px 0;
  pointer-events: none;
}

.mom-y span {
  color: var(--muted-soft);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.mom-x {
  grid-row: 2;
  grid-column: 2;
  display: flex;
  justify-content: space-between;
  color: var(--muted-soft);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
```

---

# 28. Caption Styling

Keep:

```css
.mom-cap {
  grid-row: 3;
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.mom-cap b {
  color: var(--tint-400);
  font-weight: 600;
}

.mom-cap .mom-rate b {
  color: var(--brand);
}
```

---

# 29. Mobile

Keep:

```css
@media (max-width: 480px) {
  .momentum-card {
    padding: 12px 12px 10px;
    column-gap: 8px;
  }

  .mom-tooltip {
    font-size: 0.58rem;
  }
}
```

Make sure the chart never creates horizontal overflow.

---

# 30. Unique SVG Gradient ID

Avoid collisions if multiple `MomentumArea` components can appear on the same page.

Do not blindly reuse:

```text
id="mom-fill"
```

Use a React-generated unique identifier where appropriate.

For example:

```tsx
import { useId, useMemo, useState } from "react";
```

Then:

```tsx
const gradientId = `${useId()}-momentum-fill`;
```

Use:

```tsx
fill={`url(#${gradientId})`}
```

This is important if multiple charts can exist on the same page.

---

# 31. Important Rendering Rules

Do not use:

```text
negative margins
negative SVG coordinates
fixed y-axis label widths
hard-coded turnout values
hard-coded timestamps
hard-coded path coordinates
hard-coded grid positions
```

The entire graph must derive from the actual ballot data.

---

# 32. Existing Layout Compatibility

The existing structure should remain conceptually:

```html
<div class="momentum-card">

  <div class="mom-y">
    ...
  </div>

  <div class="momentum-plot">
    ...
  </div>

  <div class="mom-x">
    ...
  </div>

  <p class="mom-cap">
    ...
  </p>

</div>
```

Do not redesign the entire card.

Improve the graph while preserving the existing visual language.

---

# 33. Example Final JSX Structure

The component should ultimately resemble:

```tsx
<div className="momentum-card">

  <div className="mom-y" aria-hidden="true">
    <span>{maxLabel}</span>
    <span>{halfLabel}</span>
    <span>0</span>
  </div>

  <div className="momentum-plot">

    <svg
      className="momentum"
      viewBox="0 0 640 150"
      preserveAspectRatio="none"
      role="img"
      aria-label="Cumulative ballots over time"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0%"
            stopColor="var(--brand)"
            stopOpacity="0.30"
          />

          <stop
            offset="100%"
            stopColor="var(--brand)"
            stopOpacity="0"
          />
        </linearGradient>
      </defs>

      {gridLines}

      <path
        d={areaPath}
        fill={`url(#${gradientId})`}
      />

      <path
        d={linePath}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />

      {hoveredPoint && (
        <>
          <line
            className="mom-hover-line"
            x1={hoveredPoint.x}
            x2={hoveredPoint.x}
            y1={PLOT_TOP}
            y2={CHART_HEIGHT - PLOT_BOTTOM}
          />

          <circle
            className="mom-hover-point"
            cx={hoveredPoint.x}
            cy={hoveredPoint.y}
            r="4"
          />
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
        left: `${endpointLeft}%`,
        top: `${endpointTop}%`,
      }}
      aria-hidden="true"
    />

    {hoveredPoint && (
      <div
        className="mom-tooltip"
        style={tooltipStyle}
        aria-hidden="true"
      >
        <strong>{formatTime(hoveredPoint.time)}</strong>
        <span>
          {hoveredPoint.count.toLocaleString()} ballots
        </span>
      </div>
    )}

  </div>

  <div className="mom-x" aria-hidden="true">
    <span>{startTime}</span>
    <span>{endTime}</span>
  </div>

  <p className="mom-cap">
    <span>
      <b>{totalBallots.toLocaleString()}</b> ballots cast
    </span>

    <span>
      over <b>{durationLabel}</b>
    </span>

    <span className="mom-rate">
      <b>{averageRate.toFixed(1)}</b> ballots/min avg
    </span>
  </p>

</div>
```

This is the target behavior, not a requirement to copy the example verbatim.

---

# 34. Verification Requirements

After implementation, verify the following:

### Dataset with 2 ballots

The chart renders correctly.

### Dataset with 10 ballots

The curve dynamically scales.

### Dataset with 1000+ ballots

The Y-axis remains readable and does not overflow.

### Identical timestamps

The graph does not produce `NaN`, `Infinity`, or broken paths.

### Invalid `votedAt`

Invalid records are ignored safely.

### Mobile width

No horizontal overflow.

### Hover

Tooltip follows the correct point.

### Rightmost point

Tooltip does not escape the chart.

### Empty state

Fewer than 2 valid ballots shows:

```text
Not enough data yet
The turnout curve appears once ballots start coming in.
```

### Multiple charts on one page

SVG gradient IDs do not conflict.

---

# 35. Final Requirement

Do not simply reproduce the sample chart.

The final result must be a **real data-driven turnout momentum graph** connected to the application's actual ballot records.

The final implementation should compile with TypeScript, follow the existing project conventions, and preserve the current visual design while significantly improving usability and responsiveness.
