'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { loadCandidates, loadElection, loadPositions, loadVoters, watchElection, watchVotes } from '@/lib/admin/adminData';
import { ELECTION_ID } from '@/lib/constants';
import type { Candidate, Election, Position, Vote, Voter } from '@/lib/types';
import BrandLockup from '@/components/BrandLockup';
import MonitorTab from './tabs/MonitorTab';
import CandidatesTab from './tabs/CandidatesTab';
import VotersTab from './tabs/VotersTab';
import ElectionTab from './tabs/ElectionTab';
import VotesTab from './tabs/VotesTab';

type AdminTab = 'monitor' | 'candidates' | 'voters' | 'election' | 'votes';

interface Props {
  actorUid: string;
  onSignOut: () => void;
}

export default function AdminDashboard({ actorUid, onSignOut }: Props) {
  const [activeTab, setActiveTab] = useState<AdminTab>('monitor');
  const [statusLine, setStatusLine] = useState('Loading live election data...');

  const [election, setElection] = useState<Election | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [voters, setVoters] = useState<Voter[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState('');

  const unsubsRef = useRef<(() => void)[]>([]);

  const refreshLists = useCallback(async () => {
    const [freshCandidates, freshVoters] = await Promise.all([loadCandidates(), loadVoters()]);
    setCandidates(freshCandidates);
    setVoters(freshVoters);
  }, []);

  useEffect(() => {
    async function init() {
      const [electionData, positionsData, candidatesData, votersData] = await Promise.all([
        loadElection(),
        loadPositions(),
        loadCandidates(),
        loadVoters(),
      ]);

      setElection(electionData);
      setPositions(positionsData);
      setCandidates(candidatesData);
      setVoters(votersData);
      setSelectedPositionId(positionsData[0]?.id ?? '');
      setStatusLine(`Signed in as admin. Election status: ${electionData.status}.`);

      unsubsRef.current.push(
        watchVotes(
          (newVotes) => setVotes(newVotes),
          (err) => setStatusLine(err.message),
        ),
        watchElection(
          (nextElection) => {
            setElection(nextElection);
            setStatusLine(`Signed in as admin. Election status: ${nextElection.status}.`);
          },
          (err) => setStatusLine(err.message),
        ),
      );
    }

    init().catch((err) => setStatusLine(err.message));

    return () => {
      unsubsRef.current.forEach((unsub) => unsub());
      unsubsRef.current = [];
    };
  }, []);

  const TABS: { key: AdminTab; label: string }[] = [
    { key: 'monitor', label: 'Monitor' },
    { key: 'candidates', label: 'Candidates' },
    { key: 'voters', label: 'Voters' },
    { key: 'election', label: 'Election' },
    { key: 'votes', label: 'Votes' },
  ];

  return (
    <section id="admin-dashboard" className="admin-dashboard">
      <header className="admin-header" data-spot>
        <div>
          <BrandLockup />
          <p className="eyebrow">CSS Department Admin</p>
          <h1>Election command center</h1>
          <p id="admin-status" className="lede">{statusLine}</p>
        </div>
        <div className="admin-header-actions">
          <a className="btn btn-ghost" href="/vote">Student view</a>
          <button className="btn btn-ghost" id="admin-sign-out-button" type="button" onClick={onSignOut}>
            <LogOut size={14} style={{ marginRight: 6 }} />
            Sign out
          </button>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="Admin sections">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            className={`tab-button${activeTab === key ? ' is-active' : ''}`}
            type="button"
            data-admin-tab={key}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'monitor' && (
        <MonitorTab
          positions={positions}
          candidates={candidates}
          voters={voters}
          votes={votes}
          selectedPositionId={selectedPositionId}
          onPositionChange={setSelectedPositionId}
        />
      )}
      {activeTab === 'candidates' && (
        <CandidatesTab
          positions={positions}
          candidates={candidates}
          actorUid={actorUid}
          onRefresh={refreshLists}
        />
      )}
      {activeTab === 'voters' && (
        <VotersTab voters={voters} actorUid={actorUid} onRefresh={refreshLists} />
      )}
      {activeTab === 'election' && (
        <ElectionTab election={election} votes={votes} actorUid={actorUid} />
      )}
      {activeTab === 'votes' && (
        <VotesTab votes={votes} candidates={candidates} positions={positions} voters={voters} />
      )}
    </section>
  );
}
