'use client';

import { useEffect, useState } from 'react';
import CustomSelect, { type CustomSelectOption } from '@/components/ui/CustomSelect';
import { type Aggregate, type ResultsCounts } from '@/lib/admin/adminCore';
import { ELECTION_ID } from '@/lib/constants';
import type { Candidate, Position } from '@/lib/types';
import ResultsBars from './ResultsBars';
import { downloadFile } from './shared';

interface ResultsPanelProps {
  active: boolean;
  candidates: Candidate[];
  positions: Position[];
  results: ResultsCounts;
  aggregate: Aggregate;
  positionOptions: CustomSelectOption[];
  onRefresh: () => void;
}

export default function ResultsPanel({ active, candidates, positions, results, aggregate, positionOptions, onRefresh }: ResultsPanelProps) {
  const [positionId, setPositionId] = useState('');

  useEffect(() => {
    if (positions.length > 0) setPositionId((current) => current || positions[0].id);
  }, [positions]);

  const tally = { ...results, turnout: aggregate.turnout };

  return (
    <section className={`panel${active ? ' on' : ''}`} data-p="results">
      <div className="head">
        <div><span className="eyebrow">Tally</span><h1>Results</h1><p>Aggregated server-side from anonymous ballots — no individual ballot is ever read.</p></div>
        <div className="head-actions">
          <button className="btn btn-ghost btn-sm" type="button" onClick={onRefresh}>Refresh</button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => downloadFile(`css-results-${ELECTION_ID}.json`, JSON.stringify(tally, null, 2), 'application/json')}>Download JSON</button>
        </div>
      </div>
      <div className="pos-select">
        <CustomSelect
          label="Position"
          value={positionId}
          options={positionOptions}
          placeholder="Select position"
          disabled={positionOptions.length === 0}
          onChange={setPositionId}
        />
      </div>
      <ResultsBars candidates={candidates} aggregate={aggregate} positionId={positionId} />
    </section>
  );
}
