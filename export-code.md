# Turnout Momentum Graph — HTML + CSS

The cumulative turnout curve rendered as a lightweight SVG area chart (no chart library). The HTML is the final structure rendered by `MomentumArea.tsx`; the CSS is the exact block from `styles/components.css`.

## HTML

```html
<div class="momentum-card">
  <!-- y-axis labels: 0 / half / max, right-aligned in their own grid column -->
  <div class="mom-y" aria-hidden="true">
    <span>1280</span>
    <span>640</span>
    <span>0</span>
  </div>

  <!-- the chart itself -->
  <div class="momentum-plot">
    <svg class="momentum" viewBox="0 0 640 150" preserveAspectRatio="none" role="img" aria-label="Cumulative ballots over time">
      <defs>
        <linearGradient id="mom-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.35" />
          <stop offset="100%" stop-color="var(--brand)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <!-- horizontal gridlines at 25% / 50% / 75% -->
      <line class="mom-grid" x1="14" x2="626" y1="105.5" y2="105.5" />
      <line class="mom-grid" x1="14" x2="626" y1="75" y2="75" />
      <line class="mom-grid" x1="14" x2="626" y1="44.5" y2="44.5" />
      <!-- area fill -->
      <path d="M14,136 L66,126 L118,115 L170,104 L222,92 L274,80 L326,68 L378,56 L430,44 L482,32 L534,20 L586,9.3 L626,14 L626,136 L14,136 Z" fill="url(#mom-fill)" />
      <!-- the line itself -->
      <path d="M14,136 L66,126 L118,115 L170,104 L222,92 L274,80 L326,68 L378,56 L430,44 L482,32 L534,20 L586,9.3 L626,14" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
    </svg>

    <!-- endpoint dot: HTML overlay so it stays a perfect circle at any size -->
    <span class="mom-dot" style="left: 97.81%; top: 9.33%" aria-hidden="true"></span>
  </div>

  <!-- x-axis: start / end time -->
  <div class="mom-x" aria-hidden="true">
    <span>08:00</span>
    <span>10:45</span>
  </div>

  <!-- caption: totals + pace -->
  <p class="mom-cap">
    <span><b>1280</b> ballots cast</span>
    <span>over <b>2h 45m</b></span>
    <span class="mom-rate"><b>7.8</b> ballots/min avg</span>
  </p>
</div>
```

## CSS

```css
/* turnout momentum curve */
/*
 * Grid layout: an auto-sized y-axis column next to the chart, so axis labels
 * can never escape the card or collide with the curve — no negative offsets,
 * no fixed label width. Rows: y-labels + plot on the first row, time labels
 * below the plot, caption spanning the full width.
 */
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
}

.mom-grid {
  stroke: rgba(120, 200, 190, 0.1);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 3 4;
}

.mom-dot {
  position: absolute;
  width: 8px;
  height: 8px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--brand);
  box-shadow: 0 0 0 3px rgba(34, 184, 160, 0.22), 0 0 14px rgba(34, 184, 160, 0.55);
}

/* y-axis column: spans the plot's row height; labels flow normally (top, middle,
 * bottom) and right-align, so the column auto-sizes to the widest label and no
 * count — however many digits — can ever push outside the card. */
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

.momentum-empty {
  grid-column: 1 / -1;
  border: 0;
  background: none;
}

@media (max-width: 480px) {
  .momentum-card {
    padding: 12px 12px 10px;
    column-gap: 8px;
  }
}
```

## Notes

- **Empty state** (fewer than 2 ballots): swap the inner content for
  `<div class="state-block momentum-empty"><strong>Not enough data yet</strong><small>The turnout curve appears once ballots start coming in.</small></div>`
- The SVG coordinates are computed from real data: `x(i)` maps each voter's `votedAt` time across `14 → 626` (640 − 14px padding), `y(count)` maps cumulative ballots from `136` (0) up to `14` (max). The endpoint dot uses the same math in percentages so it never distorts under `preserveAspectRatio="none"`.
- Theme variables used: `--line`, `--radius-md`, `--brand`, `--muted-soft`, `--font-mono`, `--tint-400`.
