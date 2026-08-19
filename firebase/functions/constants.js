'use strict';

// Shared constants for the Cloud Functions. Keep in sync with
// voting-app/lib/constants.ts where the client mirrors these.

const DEFAULT_ELECTION_ID = 'css_department_election_2026';
const STUDENT_EMAIL_PATTERN = /^[a-z0-9._-]+\.scc@gmail\.com$/;
const STUDENT_NO_PATTERN = /^[0-9]{7,9}$/;
const ADMIN_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_PASSWORD_MIN_LENGTH = 8;
const MAX_ROSTER_ROWS = 20000;
const ROSTER_BATCH_SIZE = 400;
const MAX_CANDIDATE_IMAGE_BYTES = 2 * 1024 * 1024;
const BACKUP_SCHEMA_VERSION = 1;
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

module.exports = {
  DEFAULT_ELECTION_ID,
  STUDENT_EMAIL_PATTERN,
  STUDENT_NO_PATTERN,
  ADMIN_EMAIL_PATTERN,
  ADMIN_PASSWORD_MIN_LENGTH,
  MAX_ROSTER_ROWS,
  ROSTER_BATCH_SIZE,
  MAX_CANDIDATE_IMAGE_BYTES,
  BACKUP_SCHEMA_VERSION,
  MAX_BACKUP_BYTES,
};
