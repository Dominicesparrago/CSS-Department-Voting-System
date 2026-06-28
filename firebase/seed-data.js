export const ELECTION_ID = "css_department_election_2026";

// Fixed position IDs are duplicated in firebase/firestore.rules; update both files in lockstep.
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
    name: "Vice President - Internal",
    order: 2,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "vp_external",
    name: "Vice President - External",
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
    name: "P.R.O",
    order: 7,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "business_manager_committee",
    name: "Business Manager Committee",
    order: 8,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "academic_committee_chair",
    name: "Academic Committee Chair",
    order: 9,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "research_committee_chair",
    name: "Research Committee Chair",
    order: 10,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "ict_committee_chair",
    name: "ICT Committee Chair",
    order: 11,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "events_committee_chair",
    name: "Events Committee Chair",
    order: 12,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "sports_committee_chair",
    name: "Sports Committee Chair",
    order: 13,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "environmental_committee_chair",
    name: "Environmental Committee Chair",
    order: 14,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "membership_committee_chair",
    name: "Membership Committee Chair",
    order: 15,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "community_committee_chair",
    name: "Community Committee Chair",
    order: 16,
    scope: "department",
    yearLevel: null,
    maxSelections: 1
  },
  {
    id: "year_rep_4",
    name: "4th Year Representative",
    order: 17,
    scope: "year",
    yearLevel: 4,
    maxSelections: 1
  },
  {
    id: "year_rep_3",
    name: "3rd Year Representative",
    order: 18,
    scope: "year",
    yearLevel: 3,
    maxSelections: 1
  },
  {
    id: "year_rep_2",
    name: "2nd Year Representative",
    order: 19,
    scope: "year",
    yearLevel: 2,
    maxSelections: 1
  },
  {
    id: "year_rep_1",
    name: "1st Year Representative",
    order: 20,
    scope: "year",
    yearLevel: 1,
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
