'use strict';

// Pure normalization + validation for the official student roster.
//
// The roster (collection `students`, keyed by student number) is the
// authoritative source of voter eligibility. It is written ONLY by the
// importRoster callable; these helpers shape and validate that data, and the
// same normalization rules are mirrored client-side in
// voting-app/lib/admin/rosterImport.ts so pre-validation and enforcement agree.
//
// The submitBallot callable uses validateRosterEligibility to bind the
// authenticated account to its official roster record before any ballot is
// accepted.

const STUDENT_NO_PATTERN = /^[0-9]{7,9}$/;

// Canonical section format app-wide: BSCS-<year><letter> (e.g. BSCS-3A).
// Tolerates common spreadsheet variants: "BSCS 3-A", "BSCS-3 A", "BSCS3A",
// and the short masterlist form "CS 1A" / "CS1A" (CS <year><letter>).
const SECTION_PATTERN = /^(?:(?:BSCS|CS)[\s-]*)?([1-4])[\s-]*([A-Za-z])$/i;

// Letters available per year level (A=1 .. letter index). Sections outside the
// configured range for their year are still accepted at import time (the file
// is the source of truth), but the canonical format itself is enforced.
const YEAR_LETTER_COUNT = { 1: 10, 2: 8, 3: 6, 4: 3 };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ACTIVE_STATUS_WORDS = new Set(['active', 'enrolled', 'enlisted', 'current', 'yes', 'y', '1', 'true']);
const INACTIVE_STATUS_WORDS = new Set(['inactive', 'not enrolled', 'withdrawn', 'no', 'n', '0', 'false']);
const ELIGIBLE_WORDS = new Set(['eligible', 'yes', 'y', '1', 'true']);
const INELIGIBLE_WORDS = new Set(['ineligible', 'no', 'n', '0', 'false']);

// Common name suffixes tolerated when comparing a registered name against the
// roster (e.g. roster "Juan Dela Cruz Jr." matches a voter registered as
// "Juan Dela Cruz").
const NAME_SUFFIXES = new Set(['jr', 'sr', 'jnr', 'snr', 'ii', 'iii', 'iv', 'v']);
const SURNAME_PARTICLES = new Set(['de', 'del', 'dela', 'la', 'van', 'von', 'bin', 'ibn']);

function isEmptyValue(value) {
  if (value == null) return true;
  const text = String(value).trim().toLowerCase();
  return text === '' || text === '-' || text === 'n/a' || text === 'none';
}

/** Student IDs are 7-9 digits; strip punctuation/spacing but keep digits. */
function normalizeStudentNo(value) {
  if (value == null) return '';
  return String(value).trim().replace(/\D/g, '');
}

/** Canonical section, or '' when the value is not a recognizable BSCS section. */
function normalizeSection(value) {
  if (value == null) return '';
  const match = SECTION_PATTERN.exec(String(value).trim());
  if (!match) return '';
  return `BSCS-${match[1]}${match[2].toUpperCase()}`;
}

/** School email, lowercased; '' when absent/unrecognizable. */
function normalizeEmail(value) {
  if (isEmptyValue(value)) return '';
  const email = String(value).trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : '';
}

/** Year level 1-4 as a number, or null when unrecognizable. */
function normalizeYearLevel(value) {
  if (isEmptyValue(value)) return null;
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= 4 ? value : null;
  }
  const digits = String(value).replace(/\D/g, '');
  if (!digits || digits.length !== 1) return null;
  const year = Number(digits);
  return year >= 1 && year <= 4 ? year : null;
}

/** 'active' | 'inactive', or null when the status column holds an unknown value. */
function normalizeStatus(value) {
  if (isEmptyValue(value)) return 'active';
  const text = String(value).trim().toLowerCase();
  if (ACTIVE_STATUS_WORDS.has(text)) return 'active';
  if (INACTIVE_STATUS_WORDS.has(text)) return 'inactive';
  return null;
}

/** boolean, or null when the eligibility column holds an unknown value. */
function normalizeEligible(value) {
  if (isEmptyValue(value)) return true;
  const text = String(value).trim().toLowerCase();
  if (ELIGIBLE_WORDS.has(text)) return true;
  if (INELIGIBLE_WORDS.has(text)) return false;
  return null;
}

/** Lowercase, strip punctuation, collapse whitespace. */
function normalizeName(value) {
  if (value == null) return '';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Full name in canonical display order. Masterlists often write names as
 * "Surname, Firstname" — those are swapped to "Firstname Surname" so the
 * first/last token comparison in namesMatch stays order-consistent with voter
 * registrations (which are first-name-first).
 */
function normalizeFullName(value) {
  if (value == null) return '';
  const text = String(value).trim().replace(/\s+/g, ' ');
  if (!text) return '';
  const comma = text.indexOf(',');
  if (comma > 0) {
    const surname = text.slice(0, comma).trim();
    const given = text.slice(comma + 1).trim();
    if (surname && given) return `${given} ${surname}`;
  }
  return text;
}

/**
 * Stable identity key for deduplicating roster records within a file and for
 * matching re-imports to existing documents. Student-number rows key by ID;
 * masterlist rows (no student number) key by section + significant name tokens
 * (initial letters and suffixes dropped), matching how namesMatch compares —
 * so "Dela Cruz, Juan" and "Juan A. Dela Cruz" resolve to the same person
 * instead of creating two entries that would make the vote-time match ambiguous.
 */
function identityKey(record) {
  if (record && record.studentNo) return `id:${record.studentNo}`;
  const name = record && record.fullName ? significantNameTokens(record.fullName).join(' ') : '';
  return `name:${record && record.section ? record.section : ''}|${name}`;
}

/** Name tokens that carry identity (single letters like initials and suffixes are dropped). */
function significantNameTokens(value) {
  return normalizeName(value)
    .split(' ')
    .filter((token) => token.length > 1 && !NAME_SUFFIXES.has(token));
}

/**
 * First + last significant name tokens must agree (case/punctuation/middle-name
 * and suffix tolerant). Used as an additional identity check: the registered
 * name must match the roster, so an account cannot claim someone else's
 * Student ID under a different name.
 */
function namesMatch(registered, roster) {
  const a = significantNameTokens(normalizeFullName(registered));
  const b = significantNameTokens(normalizeFullName(roster));
  if (a.length === 0 || b.length === 0) return false;
  if (a[0] !== b[0]) return false;

  // Treat compound surnames consistently: "De Guzman", "DeGuzman", and
  // "De La Cruz" should produce the same surname key.
  const surnameKey = (tokens) => {
    let start = tokens.length - 1;
    while (start > 0 && SURNAME_PARTICLES.has(tokens[start - 1])) start -= 1;
    return tokens.slice(start).join('');
  };
  return surnameKey(a) === surnameKey(b);
}

/**
 * Normalize one raw roster row (spreadsheet record) into its canonical shape.
 * Fields that failed normalization are left as '' / null so validateRosterRow
 * can report them precisely.
 */
function normalizeRosterRow(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const rawId = source.studentNo == null ? '' : String(source.studentNo).trim();
  const studentNo = normalizeStudentNo(rawId);
  return {
    // A non-blank student number that does not normalize to a valid ID is kept
    // raw so validateRosterRow can reject it — an invalid record must not be
    // silently demoted into an eligible name-matched row.
    studentNo: rawId && !STUDENT_NO_PATTERN.test(studentNo) ? rawId : studentNo,
    fullName: normalizeFullName(source.fullName),
    section: normalizeSection(source.section),
    yearLevel: normalizeYearLevel(source.yearLevel),
    email: normalizeEmail(source.email),
    status: normalizeStatus(source.status),
    eligible: normalizeEligible(source.eligible),
  };
}

/** Human-readable problems with a normalized row; empty means the row is valid. */
function validateRosterRow(row) {
  const errors = [];
  // Student number is optional: masterlists often carry no ID column, in which
  // case the row is matched by name + section + year at vote time. When an ID
  // IS present it must be a valid 7-9 digit number — a malformed ID is rejected
  // rather than silently demoted to a name-matched row.
  if (row.studentNo && !STUDENT_NO_PATTERN.test(row.studentNo)) {
    errors.push('Invalid student ID (7-9 digits).');
  }
  if (!row.fullName || row.fullName.length < 2) {
    errors.push('Full name is required.');
  }
  if (!row.section) {
    errors.push('Invalid section (expected BSCS-<year><letter>, e.g. BSCS-3A).');
  }
  if (row.yearLevel === null) {
    errors.push('Invalid year level (expected 1-4).');
  }
  if (row.status === null) {
    errors.push('Unrecognized status value.');
  }
  if (row.eligible === null) {
    errors.push('Unrecognized eligibility value.');
  }
  return errors;
}

/**
 * Classify an imported file's rows. Valid rows come back in `records` (first
 * occurrence wins); everything else is counted in the summary with row-level
 * reasons. Nothing invalid or duplicated is ever eligible to vote.
 */
function processRosterImport(rows) {
  const summary = {
    total: rows.length,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    invalid: 0,
    missingRequired: 0,
    rejected: 0,
    deactivated: 0,
    errors: [],
  };

  const records = [];
  const seen = new Set();

  rows.forEach((raw, index) => {
    const rowNumber = index + 2; // spreadsheet row number (1 is the header)
    const normalized = normalizeRosterRow(raw);
    const problems = validateRosterRow(normalized);

    if (problems.length > 0) {
      summary.invalid += 1;
      if (problems.some((problem) => problem.includes('required'))) {
        summary.missingRequired += 1;
      }
      summary.rejected += 1;
      summary.errors.push({
        row: rowNumber,
        studentNo: normalized.studentNo || undefined,
        reason: problems.join(' '),
      });
      return;
    }

    const key = identityKey(normalized);
    if (seen.has(key)) {
      summary.duplicates += 1;
      summary.rejected += 1;
      summary.errors.push({
        row: rowNumber,
        studentNo: normalized.studentNo || undefined,
        reason: 'Duplicate student record in this file.',
      });
      return;
    }

    seen.add(key);
    records.push(normalized);
  });

  return { summary, records };
}

/**
 * Bind an authenticated account to its official roster record. Used by
 * submitBallot inside its write transaction: every condition must pass before
 * a ballot is accepted. The roster, not the self-asserted voter profile, is
 * authoritative for identity and eligibility.
 *
 * `election` is the election document data (status already verified by the
 * caller). An optional `eligibleSections` array on the election scopes which
 * sections may participate; an absent/empty array allows every active and
 * eligible roster student.
 */
function validateRosterEligibility({ roster, voter, election }) {
  if (!roster) {
    return {
      ok: false,
      reason: 'not-on-roster',
      code: 'permission-denied',
      message: "You are not on the official roster for this election. If you're a current CSS student, contact the election committee.",
    };
  }
  if (roster.status !== 'active') {
    return {
      ok: false,
      reason: 'inactive',
      code: 'permission-denied',
      message: 'Your roster record is not active for this election. Contact the election committee.',
    };
  }
  if (roster.eligible !== true) {
    return {
      ok: false,
      reason: 'not-eligible',
      code: 'permission-denied',
      message: 'Your roster record is not marked eligible for this election. Contact the election committee.',
    };
  }
  if (roster.yearLevel !== voter.yearLevel) {
    return {
      ok: false,
      reason: 'mismatch',
      code: 'failed-precondition',
      message: 'Your registration does not match the official roster. Contact the election committee.',
    };
  }
  if (normalizeSection(voter.section) !== normalizeSection(roster.section)) {
    return {
      ok: false,
      reason: 'mismatch',
      code: 'failed-precondition',
      message: 'Your registration does not match the official roster. Contact the election committee.',
    };
  }
  // Additional identity check: first + last name must match the roster record
  // for this Student ID. Names alone never authenticate (the locked Student ID
  // is the primary link), but a mismatched name is rejected so no account can
  // vote under another student's ID with a made-up name.
  if (!namesMatch(voter.fullName, roster.fullName)) {
    return {
      ok: false,
      reason: 'mismatch',
      code: 'failed-precondition',
      message: 'Your registration does not match the official roster. Contact the election committee.',
    };
  }
  const rosterEmail = roster.email ? normalizeEmail(roster.email) : '';
  const voterEmail = normalizeEmail(voter.email);
  if (rosterEmail && rosterEmail !== voterEmail) {
    return {
      ok: false,
      reason: 'email-mismatch',
      code: 'permission-denied',
      message: 'The email on your account does not match the official roster. Contact the election committee.',
    };
  }

  const eligibleSections = Array.isArray(election && election.eligibleSections)
    ? election.eligibleSections.map(normalizeSection).filter(Boolean)
    : [];
  if (eligibleSections.length > 0 && !eligibleSections.includes(normalizeSection(voter.section))) {
    return {
      ok: false,
      reason: 'section-not-eligible',
      code: 'permission-denied',
      message: 'Your section is not eligible to vote in this election.',
    };
  }

  return { ok: true };
}

/**
 * Resolve a voter against roster entries that carry no student number (rows
 * imported from a masterlist without an ID column). Only active, eligible
 * entries count, and the registered name + year must match EXACTLY ONE of the
 * section's entries — ambiguity is rejected so no voter is ever bound to the
 * wrong record. Section equality is assumed by the caller (the query is
 * scoped to the voter's section).
 */
function resolveNameRosterMatch(candidates, voter) {
  const matches = (candidates || [])
    .filter((record) => record.status === 'active' && record.eligible === true)
    .filter((record) => record.yearLevel === voter.yearLevel && namesMatch(voter.fullName, record.fullName));
  if (matches.length === 0) {
    return { ok: false, reason: 'not-on-roster' };
  }
  if (matches.length > 1) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true, record: matches[0] };
}

module.exports = {
  normalizeStudentNo,
  normalizeSection,
  normalizeEmail,
  normalizeYearLevel,
  normalizeStatus,
  normalizeEligible,
  normalizeName,
  normalizeFullName,
  identityKey,
  namesMatch,
  normalizeRosterRow,
  validateRosterRow,
  processRosterImport,
  validateRosterEligibility,
  resolveNameRosterMatch,
};
