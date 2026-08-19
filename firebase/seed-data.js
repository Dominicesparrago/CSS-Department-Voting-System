export const ELECTION_ID = "css_department_election_2026";

export const positions = [
  {
    id: "president",
    name: "President",
    order: 1,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "vp_internal",
    name: "Internal - VP",
    order: 2,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "vp_external",
    name: "External - VP",
    order: 3,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "secretary",
    name: "Secretary",
    order: 4,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "treasurer",
    name: "Treasurer",
    order: 5,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "auditor",
    name: "Auditor",
    order: 6,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "pro",
    name: "Public Relation Officer (PRO)",
    order: 7,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "events_committee_chair",
    name: "Event Committee Chair",
    order: 8,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "assistant_event_committee_chair",
    name: "Assistant Event Committee Chair",
    order: 9,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "academic_research_committee_chair",
    name: "Academic & Research Committee Chair",
    order: 10,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "sports_committee_chair",
    name: "Sports Committee Chair",
    order: 11,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "business_manager_committee",
    name: "Business Manager Committee Chair",
    order: 12,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "community_environmental_committee_chair",
    name: "Community & Environmental Committee Chair",
    order: 13,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "documentation_committee_chair",
    name: "Documentation Committee Chair",
    order: 14,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "designer_committee_chair",
    name: "Designer Committee Chair",
    order: 15,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "caption_committee_chair",
    name: "Caption Committee Chair",
    order: 16,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "sponsorship_partnership_committee_chair",
    name: "Sponsorship/Partnership Committee Chair",
    order: 17,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "project_hackathon_committee_chair",
    name: "Project/Hackathon Committee Chair",
    order: 18,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "year_rep_1",
    name: "1st Year Representative",
    order: 19,
    scope: "year",
    yearLevel: 1,
    maxSelections: 1
  },
  {
    id: "year_rep_2",
    name: "2nd Year Representative",
    order: 20,
    scope: "year",
    yearLevel: 2,
    maxSelections: 1
  },
  {
    id: "year_rep_3",
    name: "3rd Year Representative",
    order: 21,
    scope: "year",
    yearLevel: 3,
    maxSelections: 1
  },
  {
    id: "year_rep_4",
    name: "4th Year Representative",
    order: 22,
    scope: "year",
    yearLevel: 4,
    maxSelections: 1
  }
];

export const election = {
  id: ELECTION_ID,
  title: "CSS Department Election 2026",
  status: "draft",
  positions: positions.map((position) => position.id),
  openAt: null,
  closeAt: null
};
