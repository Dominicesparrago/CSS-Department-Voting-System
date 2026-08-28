import type { User } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

export interface VoterProfile {
  uid: string;
  studentNo?: string;
  fullName: string;
  firstName?: string;
  surname?: string;
  email: string;
  yearLevel: number;
  section: string;
  eligible: boolean;
  guest?: boolean;
  hasVoted?: Record<string, boolean>;
  electionsRegistered?: Record<string, boolean>;
  votedAt?: Record<string, Timestamp>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Session {
  user: User | null;
  voterProfile: VoterProfile | null;
  claims: Record<string, unknown> | null;
  /** True when the signed-in email has an entry in the admins registry. */
  adminViaRegistry?: boolean;
}

/** Runtime-managed admin grant, stored at admins/{email}. */
export interface AdminEntry {
  id: string;
  email: string;
  role: 'admin';
  addedBy: string;
  reason: string;
  createdAt?: Timestamp;
}

/** App-wide policy flags, stored at config/app. */
export interface AppConfig {
  allowGuestVoters: boolean;
  maintenanceMode: boolean;
  updatedBy?: string;
  updatedAt?: Timestamp;
}

export type ElectionStatus = 'draft' | 'open' | 'closed' | 'published' | 'finalized' | 'archived';

export interface Election {
  id: string;
  title?: string;
  status: ElectionStatus;
  registrationOpen?: boolean;
  positions?: string[];
  /** Optional canonical sections (e.g. 'BSCS-3A') allowed to vote; absent/empty = all active roster students. */
  eligibleSections?: string[];
  openAt?: Timestamp | null;
  closeAt?: Timestamp | null;
  /**
   * Election locking (superadmin-controlled). When true, ordinary admin edits to
   * candidates, positions, voter eligibility, and election config are refused;
   * superadmin retains a controlled emergency override (audited).
   */
  locked?: boolean;
  /** Superadmin emergency permission for profile-only candidate edits after ballots exist. */
  candidateProfileEditingUnlocked?: boolean;
  /** Set when results are finalized; further ordinary admin modification is refused. */
  finalizedAt?: Timestamp | null;
  archivedAt?: Timestamp | null;
  /** Free-form superadmin-managed election metadata (edition, slogan, etc.). */
  metadata?: Record<string, string>;
  updatedAt?: Timestamp;
}

export interface Position {
  id: string;
  name: string;
  scope: 'department' | 'year';
  yearLevel?: number;
  order: number;
  /** Number of winners this position can produce (1 by default). */
  maxSelections?: number;
  /** Soft-disable flag; retired positions keep their history but leave the ballot. */
  active?: boolean;
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
  /** Archived candidates are hidden everywhere (admin-only archive/restore). */
  archived?: boolean;
  photoURL?: string;
  photoPath?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * Anonymous ballot record (collection `ballots`). Written only by the trusted
 * submitBallot function — random id, no uid, no timestamp — and never read by
 * the client. Present here to document the stored shape.
 */
export interface Ballot {
  electionId: string;
  positionId: string;
  candidateId: string;
  yearLevel: number;
}

export interface Voter extends VoterProfile {
  id: string;
}

/**
 * Official roster record (collection `students`). Written only by the
 * importRoster Cloud Function; admins may read all records, a student may read
 * their own. This is the authoritative eligibility source.
 *
 * Keyed by student number when the import file has an ID column. Masterlist
 * imports (no ID column) get an auto document id, no `studentNo`, and are
 * matched to voters by name + section + year level.
 */
export interface RosterStudent {
  id: string; // document id: student number, or auto id for masterlist rows
  studentNo?: string;
  fullName: string;
  section: string;
  yearLevel: number;
  email?: string | null;
  status: 'active' | 'inactive';
  eligible: boolean;
  importedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * One normalized roster row sent to the importRoster function. `studentNo` is
 * empty for masterlist rows (no ID column) — those are matched to voters by
 * name + section + year level.
 */
export interface RosterImportRow {
  studentNo: string;
  fullName: string;
  section: string;
  yearLevel: number;
  email?: string;
  status: 'active' | 'inactive';
  eligible: boolean;
}

/** Authoritative result of an import, computed server-side. */
export interface RosterImportSummary {
  total: number;
  inserted: number;
  updated: number;
  duplicates: number;
  invalid: number;
  missingRequired: number;
  rejected: number;
  deactivated: number;
  errors: Array<{ row: number; studentNo?: string; reason: string }>;
}

export interface AuditEntry {
  id: string;
  ts?: Timestamp;
  actorUid: string;
  actorRole?: string;
  action: string;
  target: string;
  /** Election the operation ran against, where relevant. */
  electionId?: string;
  details?: Record<string, unknown>;
}

/** Election-specific data that a scoped reset can clear. */
export type ResetScope = 'candidates' | 'voters' | 'ballots' | 'assignments' | 'full';

/** Affected-record counts for a proposed reset (computed server-side). */
export interface ResetEstimate {
  electionId: string;
  electionTitle?: string;
  candidates: number;
  ballots: number;
  tallies: number;
  votersLocked: number;
  positions: number;
}

/** Backup metadata, stored at backups/{id}. The JSON payload lives in Storage. */
export interface BackupRecord {
  id: string;
  electionId: string;
  type: 'manual' | 'pre-reset' | 'pre-reset-full';
  storagePath: string;
  sizeBytes: number;
  checksum: string;
  recordCounts: Record<string, number>;
  createdAt?: Timestamp;
  actorUid: string;
  restoredAt?: Timestamp | null;
  restoredBy?: string | null;
}

export type DoctorStatus = 'ok' | 'warn' | 'error';

export interface DoctorCheck {
  code: string;
  status: DoctorStatus;
  count: number;
  message: string;
  /** Affected document ids (capped server-side) for the matching repair. */
  ids?: string[];
}

export interface DoctorReport {
  status: 'healthy' | 'issues';
  checks: DoctorCheck[];
  scannedAt?: Timestamp;
}

/** A repair the Database Doctor can perform; each requires explicit confirmation. */
export interface RepairAction {
  code: string;
  label: string;
  affected: number;
  description: string;
  /** Document ids the repair should act on (from the scan). */
  ids?: string[];
}

export interface PositionInput {
  id?: string;
  name: string;
  scope: 'department' | 'year';
  yearLevel?: number | null;
  order: number;
  maxSelections?: number;
  active?: boolean;
}

export type Selections = Record<string, string>;
