import { buildAggregate, type ResultsCounts } from '../admin/adminCore';
import { ELECTION_ID } from '../constants';
import type { Candidate, Election, Position, Voter } from '../types';

/**
 * Deterministic mock election data for the superadmin design-test page.
 *
 * The design test is a review surface, so when live data is missing (or the
 * reviewer flips the toggle) it renders this full roster instead: 22 positions,
 * 45 candidates, realistic vote counts — including one race with zero votes and
 * one exact tie so every result-hero state (winner / tied / awaiting votes) can
 * be reviewed and exported without touching the real election.
 */

export const MOCK_ELECTION: Election = {
  id: ELECTION_ID,
  title: 'CSS Department Election — A.Y. 2026',
  status: 'open',
  registrationOpen: true,
};

export const MOCK_POSITIONS: Position[] = [
  { id: 'president', name: 'President', scope: 'department', order: 1 },
  { id: 'vp_internal', name: 'Internal - VP', scope: 'department', order: 2 },
  { id: 'vp_external', name: 'External - VP', scope: 'department', order: 3 },
  { id: 'secretary', name: 'Secretary', scope: 'department', order: 4 },
  { id: 'treasurer', name: 'Treasurer', scope: 'department', order: 5 },
  { id: 'auditor', name: 'Auditor', scope: 'department', order: 6 },
  { id: 'pro', name: 'Public Relation Officer (PRO)', scope: 'department', order: 7 },
  { id: 'events_committee_chair', name: 'Event Committee Chair', scope: 'department', order: 8 },
  { id: 'assistant_event_committee_chair', name: 'Assistant Event Committee Chair', scope: 'department', order: 9 },
  { id: 'academic_research_committee_chair', name: 'Academic & Research Committee Chair', scope: 'department', order: 10 },
  { id: 'sports_committee_chair', name: 'Sports Committee Chair', scope: 'department', order: 11 },
  { id: 'business_manager_committee', name: 'Business Manager Committee Chair', scope: 'department', order: 12 },
  { id: 'community_environmental_committee_chair', name: 'Community & Environmental Committee Chair', scope: 'department', order: 13 },
  { id: 'documentation_committee_chair', name: 'Documentation Committee Chair', scope: 'department', order: 14 },
  { id: 'designer_committee_chair', name: 'Designer Committee Chair', scope: 'department', order: 15 },
  { id: 'caption_committee_chair', name: 'Caption Committee Chair', scope: 'department', order: 16 },
  { id: 'sponsorship_partnership_committee_chair', name: 'Sponsorship/Partnership Committee Chair', scope: 'department', order: 17 },
  { id: 'project_hackathon_committee_chair', name: 'Project/Hackathon Committee Chair', scope: 'department', order: 18 },
  { id: 'year_rep_1', name: '1st Year Representative', scope: 'year', yearLevel: 1, order: 19 },
  { id: 'year_rep_2', name: '2nd Year Representative', scope: 'year', yearLevel: 2, order: 20 },
  { id: 'year_rep_3', name: '3rd Year Representative', scope: 'year', yearLevel: 3, order: 21 },
  { id: 'year_rep_4', name: '4th Year Representative', scope: 'year', yearLevel: 4, order: 22 },
];

interface MockCandidateSeed {
  id: string;
  name: string;
  section: string;
  yearLevel: number;
  party: string;
  platform: string;
}

const MOCK_CANDIDATE_SEEDS: MockCandidateSeed[] = [
  // President — clear winner
  { id: 'mock-president-1', name: 'Juan Dela Cruz', section: 'BSCS-4A', yearLevel: 4, party: 'Unity', platform: 'Transparent governance and a stronger student council for every section.' },
  { id: 'mock-president-2', name: 'Maria Santos', section: 'BSCS-3B', yearLevel: 3, party: 'Sulong', platform: 'More academic support, mental-health first, and louder student voices.' },
  { id: 'mock-president-3', name: 'Paolo Reyes', section: 'BSCS-2C', yearLevel: 2, party: 'Bayanihan', platform: 'Uniting the department through open forums and shared projects.' },
  // VP Internal
  { id: 'mock-vp_internal-1', name: 'Ana Lopez', section: 'BSCS-3A', yearLevel: 3, party: 'Unity', platform: 'Smooth internal coordination and clear communication channels.' },
  { id: 'mock-vp_internal-2', name: 'Jose Garcia', section: 'BSCS-2B', yearLevel: 2, party: 'Sulong', platform: 'Faster response times for student concerns and requests.' },
  // VP External
  { id: 'mock-vp_external-1', name: 'Carla Mendoza', section: 'BSCS-4B', yearLevel: 4, party: 'Bayanihan', platform: 'Stronger ties with partner orgs and industry events.' },
  { id: 'mock-vp_external-2', name: 'Luis Tan', section: 'BSCS-1A', yearLevel: 1, party: 'Unity', platform: 'Bringing external opportunities straight to the department.' },
  // Secretary
  { id: 'mock-secretary-1', name: 'Bea Aquino', section: 'BSCS-3C', yearLevel: 3, party: 'Sulong', platform: 'Accurate minutes, organized records, and timely announcements.' },
  { id: 'mock-secretary-2', name: 'Marco Diaz', section: 'BSCS-2A', yearLevel: 2, party: 'Unity', platform: 'Digital-first documentation everyone can access.' },
  { id: 'mock-secretary-3', name: 'Nina Ramos', section: 'BSCS-4C', yearLevel: 4, party: 'Bayanihan', platform: 'Keeping every meeting accountable and every file in order.' },
  // Treasurer
  { id: 'mock-treasurer-1', name: 'Ethan Cruz', section: 'BSCS-3D', yearLevel: 3, party: 'Unity', platform: 'Clear fund reporting and responsible allocation of fees.' },
  { id: 'mock-treasurer-2', name: 'Sofia Villanueva', section: 'BSCS-2D', yearLevel: 2, party: 'Sulong', platform: 'Monthly budget transparency for all students.' },
  // Auditor — exact tie for testing the tied-lead state
  { id: 'mock-auditor-1', name: 'Miguel Torres', section: 'BSCS-4A', yearLevel: 4, party: 'Bayanihan', platform: 'Independent checks on every peso the council spends.' },
  { id: 'mock-auditor-2', name: 'Kyla Bautista', section: 'BSCS-3B', yearLevel: 3, party: 'Unity', platform: 'Audits with receipts — full traceability of council funds.' },
  { id: 'mock-auditor-3', name: 'Diego Fernandez', section: 'BSCS-1B', yearLevel: 1, party: 'Sulong', platform: 'Fresh eyes on financial processes and fair spending.' },
  // Public Relation Officer (PRO)
  { id: 'mock-pro-1', name: 'Hannah Navarro', section: 'BSCS-2C', yearLevel: 2, party: 'Sulong', platform: 'Design-forward announcements that reach every student.' },
  { id: 'mock-pro-2', name: 'Ian Castillo', section: 'BSCS-3A', yearLevel: 3, party: 'Unity', platform: 'Clear, timely, and honest communication for the department.' },
  // Event Committee Chair
  { id: 'mock-events_committee_chair-1', name: 'Trisha Ramos', section: 'BSCS-3A', yearLevel: 3, party: 'Unity', platform: 'Well-run events with something for every student.' },
  { id: 'mock-events_committee_chair-2', name: 'Carlo Aquino', section: 'BSCS-1C', yearLevel: 1, party: 'Sulong', platform: 'More socials, more energy, more participation.' },
  // Assistant Event Committee Chair
  { id: 'mock-assistant_event_committee_chair-1', name: 'Denise Ocampo', section: 'BSCS-2B', yearLevel: 2, party: 'Sulong', platform: 'Logistics that run on time, every time.' },
  { id: 'mock-assistant_event_committee_chair-2', name: 'Ryan Lim', section: 'BSCS-3C', yearLevel: 3, party: 'Unity', platform: 'Backstage support so the spotlight stays on the students.' },
  // Academic & Research Committee Chair
  { id: 'mock-academic_research_committee_chair-1', name: 'Chloe Del Rosario', section: 'BSCS-3C', yearLevel: 3, party: 'Sulong', platform: 'Tutorials, review sessions, and research showcases for every year level.' },
  { id: 'mock-academic_research_committee_chair-2', name: 'Patricia Manalo', section: 'BSCS-3D', yearLevel: 3, party: 'Bayanihan', platform: 'Mentorship for thesis teams and open research opportunities.' },
  // Sports Committee Chair
  { id: 'mock-sports_committee_chair-1', name: 'EJ Domingo', section: 'BSCS-4B', yearLevel: 4, party: 'Bayanihan', platform: 'Team leagues and tryouts open to all skill levels.' },
  { id: 'mock-sports_committee_chair-2', name: 'Rhea Padilla', section: 'BSCS-2C', yearLevel: 2, party: 'Unity', platform: 'Fair schedules and gear that actually fits the budget.' },
  // Business Manager Committee Chair
  { id: 'mock-business_manager_committee-1', name: 'Andrea Lim', section: 'BSCS-4B', yearLevel: 4, party: 'Unity', platform: 'Sponsorships and partnerships that fund student programs.' },
  { id: 'mock-business_manager_committee-2', name: 'Rafael Ong', section: 'BSCS-2A', yearLevel: 2, party: 'Bayanihan', platform: 'Sustainable fundraising with zero unnecessary costs.' },
  // Community & Environmental Committee Chair
  { id: 'mock-community_environmental_committee_chair-1', name: 'Joaquin Mercado', section: 'BSCS-3D', yearLevel: 3, party: 'Bayanihan', platform: 'Outreach programs and campus clean-ups with clear impact.' },
  { id: 'mock-community_environmental_committee_chair-2', name: 'Aira Evangelista', section: 'BSCS-1D', yearLevel: 1, party: 'Unity', platform: 'Greener department spaces through student-led initiatives.' },
  // Documentation Committee Chair
  { id: 'mock-documentation_committee_chair-1', name: 'Mia Chua', section: 'BSCS-2D', yearLevel: 2, party: 'Unity', platform: 'Accurate archives so every project is easy to hand off.' },
  { id: 'mock-documentation_committee_chair-2', name: 'Vince Soriano', section: 'BSCS-4C', yearLevel: 4, party: 'Sulong', platform: 'Digital-first records everyone can search and trust.' },
  // Designer Committee Chair
  { id: 'mock-designer_committee_chair-1', name: 'Kyle Santos', section: 'BSCS-4A', yearLevel: 4, party: 'Sulong', platform: 'Visual identity that makes every department event stand out.' },
  { id: 'mock-designer_committee_chair-2', name: 'Jasmine Yap', section: 'BSCS-3B', yearLevel: 3, party: 'Unity', platform: 'Posters and socials that are as clear as they are creative.' },
  // Caption Committee Chair
  { id: 'mock-caption_committee_chair-1', name: 'Hannah Navarro', section: 'BSCS-2C', yearLevel: 2, party: 'Sulong', platform: 'Captions that capture the moment — quick, witty, on-brand.' },
  { id: 'mock-caption_committee_chair-2', name: 'Ian Castillo', section: 'BSCS-3A', yearLevel: 3, party: 'Unity', platform: 'Every post tells the story of the department well.' },
  // Sponsorship/Partnership Committee Chair
  { id: 'mock-sponsorship_partnership_committee_chair-1', name: 'Andrea Lim', section: 'BSCS-4B', yearLevel: 4, party: 'Unity', platform: 'Partnerships that bring real value to student events.' },
  { id: 'mock-sponsorship_partnership_committee_chair-2', name: 'Rafael Ong', section: 'BSCS-2A', yearLevel: 2, party: 'Bayanihan', platform: 'Sponsor decks and proposals that close deals.' },
  // Project/Hackathon Committee Chair
  { id: 'mock-project_hackathon_committee_chair-1', name: 'Leo Pascual', section: 'BSCS-2B', yearLevel: 2, party: 'Bayanihan', platform: 'Hackathons and project sprints that build real skills.' },
  { id: 'mock-project_hackathon_committee_chair-2', name: 'Aaron Salvador', section: 'BSCS-2D', yearLevel: 2, party: 'Unity', platform: 'Mentorship and judging that make every project count.' },
  // Year representatives
  { id: 'mock-year_rep_1-1', name: 'Kit Mendoza', section: 'BSCS-1A', yearLevel: 1, party: 'Unity', platform: 'Helping freshmen settle in and find their place.' },
  { id: 'mock-year_rep_1-2', name: 'Zia Garcia', section: 'BSCS-1B', yearLevel: 1, party: 'Bayanihan', platform: 'A first-year voice that asks the questions everyone is thinking.' },
  { id: 'mock-year_rep_2-1', name: 'Dan Santos', section: 'BSCS-2A', yearLevel: 2, party: 'Sulong', platform: 'Better communication and faster resolution of batch issues.' },
  { id: 'mock-year_rep_2-2', name: 'Ela Navarro', section: 'BSCS-2B', yearLevel: 2, party: 'Unity', platform: 'A dependable point person for every second-year student.' },
  { id: 'mock-year_rep_3-1', name: 'Gelo Ramos', section: 'BSCS-3A', yearLevel: 3, party: 'Bayanihan', platform: 'Real answers for third-year concerns, from load to labs.' },
  { id: 'mock-year_rep_3-2', name: 'Trixie Bautista', section: 'BSCS-3B', yearLevel: 3, party: 'Unity', platform: 'Regular town halls so every batchmate is heard.' },
  { id: 'mock-year_rep_4-1', name: 'Andre Cruz', section: 'BSCS-4A', yearLevel: 4, party: 'Unity', platform: 'A strong final-year voice on graduation and career support.' },
  { id: 'mock-year_rep_4-2', name: 'Mica Villanueva', section: 'BSCS-4B', yearLevel: 4, party: 'Sulong', platform: 'Championing thesis relief and clearer faculty feedback.' },
];

export const MOCK_CANDIDATES: Candidate[] = MOCK_CANDIDATE_SEEDS.map((seed) => {
  const positionId = seed.id.replace('mock-', '').replace(/-\d+$/, '');
  const orderInPosition = MOCK_CANDIDATE_SEEDS
    .filter((candidate) => candidate.id.replace(/-\d+$/, '') === seed.id.replace(/-\d+$/, ''))
    .findIndex((candidate) => candidate.id === seed.id) + 1;
  return {
    id: seed.id,
    electionId: ELECTION_ID,
    positionId,
    name: seed.name,
    section: seed.section,
    yearLevel: seed.yearLevel,
    platform: seed.platform,
    party: seed.party,
    order: orderInPosition,
    active: true,
  };
});

/**
 * Per-candidate vote counts. Deliberately includes an exact tie (auditor) and
 * a position with zero votes (4th Year Representative) so every result state
 * can be previewed and exported.
 */
const MOCK_CANDIDATE_VOTES: Record<string, number> = {
  'mock-president-1': 96,
  'mock-president-2': 62,
  'mock-president-3': 31,
  'mock-vp_internal-1': 118,
  'mock-vp_internal-2': 71,
  'mock-vp_external-1': 84,
  'mock-vp_external-2': 43,
  'mock-secretary-1': 76,
  'mock-secretary-2': 52,
  'mock-secretary-3': 38,
  'mock-treasurer-1': 109,
  'mock-treasurer-2': 61,
  'mock-auditor-1': 70,
  'mock-auditor-2': 70,
  'mock-auditor-3': 29,
  'mock-pro-1': 92,
  'mock-pro-2': 55,
  'mock-events_committee_chair-1': 81,
  'mock-events_committee_chair-2': 46,
  'mock-assistant_event_committee_chair-1': 63,
  'mock-assistant_event_committee_chair-2': 40,
  'mock-academic_research_committee_chair-1': 74,
  'mock-academic_research_committee_chair-2': 51,
  'mock-sports_committee_chair-1': 60,
  'mock-sports_committee_chair-2': 39,
  'mock-business_manager_committee-1': 88,
  'mock-business_manager_committee-2': 47,
  'mock-community_environmental_committee_chair-1': 66,
  'mock-community_environmental_committee_chair-2': 44,
  'mock-documentation_committee_chair-1': 58,
  'mock-documentation_committee_chair-2': 33,
  'mock-designer_committee_chair-1': 68,
  'mock-designer_committee_chair-2': 42,
  'mock-caption_committee_chair-1': 55,
  'mock-caption_committee_chair-2': 37,
  'mock-sponsorship_partnership_committee_chair-1': 72,
  'mock-sponsorship_partnership_committee_chair-2': 45,
  'mock-project_hackathon_committee_chair-1': 79,
  'mock-project_hackathon_committee_chair-2': 49,
  'mock-year_rep_1-1': 89,
  'mock-year_rep_1-2': 33,
  'mock-year_rep_2-1': 77,
  'mock-year_rep_2-2': 35,
  'mock-year_rep_3-1': 83,
  'mock-year_rep_3-2': 41,
  'mock-year_rep_4-1': 0,
  'mock-year_rep_4-2': 0,
};

export const MOCK_RESULTS: ResultsCounts = {
  perCandidate: MOCK_CANDIDATE_VOTES,
  perPosition: Object.fromEntries(
    MOCK_POSITIONS.map((position) => [
      position.id,
      MOCK_CANDIDATES
        .filter((candidate) => candidate.positionId === position.id)
        .reduce((sum, candidate) => sum + (MOCK_CANDIDATE_VOTES[candidate.id] ?? 0), 0),
    ]),
  ),
};

/** ~330 eligible students across the four year levels; ~65% have already voted. */
function buildMockVoters(): Voter[] {
  const byYear = [
    { eligible: 80, voted: 52 },
    { eligible: 85, voted: 55 },
    { eligible: 90, voted: 60 },
    { eligible: 75, voted: 48 },
  ];
  const voters: Voter[] = [];
  let sequence = 0;
  byYear.forEach(({ eligible, voted }, index) => {
    const year = index + 1;
    for (let i = 0; i < eligible; i += 1) {
      const id = `mock-voter-${year}-${i}`;
      voters.push({
        id,
        uid: id,
        fullName: `Mock Student ${year}${i}`,
        email: `mock.student${sequence}.scc@gmail.com`,
        studentNo: String(20000000 + sequence),
        yearLevel: year,
        section: `BSCS-${year}${String.fromCharCode(65 + (i % 4))}`,
        eligible: true,
        hasVoted: i < voted ? { [ELECTION_ID]: true } : undefined,
      });
      sequence += 1;
    }
  });
  return voters;
}

export const MOCK_VOTERS: Voter[] = buildMockVoters();

export const MOCK_AGGREGATE = buildAggregate({
  results: MOCK_RESULTS,
  candidates: MOCK_CANDIDATES,
  positions: MOCK_POSITIONS,
  voters: MOCK_VOTERS,
  electionId: ELECTION_ID,
});
