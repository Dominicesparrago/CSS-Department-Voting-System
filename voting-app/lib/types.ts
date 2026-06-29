import type { User } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

export interface VoterProfile {
  uid: string;
  studentNo: string;
  fullName: string;
  email: string;
  yearLevel: number;
  section: string;
  eligible: boolean;
  hasVoted?: Record<string, boolean>;
  votedAt?: Record<string, Timestamp>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Session {
  user: User | null;
  voterProfile: VoterProfile | null;
  claims: Record<string, unknown> | null;
}

export interface Election {
  id: string;
  title?: string;
  status: 'draft' | 'open' | 'closed' | 'published';
  updatedAt?: Timestamp;
}

export interface Position {
  id: string;
  name: string;
  scope: 'department' | 'year';
  yearLevel?: number;
  order: number;
}

export interface Candidate {
  id: string;
  electionId: string;
  positionId: string;
  name: string;
  section: string;
  yearLevel: number;
  platform: string;
  goals?: string | null;
  bio?: string | null;
  party?: string | null;
  order: number;
  active: boolean;
  photoURL?: string;
  photoPath?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Vote {
  id: string;
  electionId: string;
  uid: string;
  positionId: string;
  candidateId: string;
  yearLevel: number;
  createdAt?: Timestamp;
}

export interface Voter extends VoterProfile {
  id: string;
}

export type Selections = Record<string, string>;
