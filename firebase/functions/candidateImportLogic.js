'use strict';

/**
 * Pure candidate-import validation/normalization, mirrored by the browser-side
 * parser (voting-app/lib/admin/candidateImport.ts). The Cloud Function
 * re-validates every row authoritatively before any write.
 */

const REQUIRED = ['positionId', 'name', 'section', 'yearLevel'];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeYearLevel(value) {
  const n = Number(value);
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
}

function candidateIdentityKey(record) {
  return `${record.positionId}|${record.name.toLowerCase()}|${record.section.toLowerCase()}`;
}

/** Validate one raw candidate row. Returns { ok, value } or { ok:false, error }. */
function normalizeCandidateRow(row) {
  if (!row || typeof row !== 'object') return { ok: false, error: 'Row is not an object.' };
  const positionId = normalizeText(row.positionId);
  const name = normalizeText(row.name);
  const section = normalizeText(row.section);
  const yearLevel = normalizeYearLevel(row.yearLevel);
  const missing = REQUIRED.filter((f) => {
    if (f === 'yearLevel') return yearLevel === null;
    return normalizeText(row[f]).length === 0;
  });
  if (missing.length > 0) {
    return { ok: false, error: `Missing required field(s): ${missing.join(', ')}.` };
  }
  if (name.length < 2) return { ok: false, error: 'Candidate name must be at least 2 characters.' };
  const order = Number(row.order);
  return {
    ok: true,
    value: {
      positionId,
      name,
      section,
      yearLevel,
      platform: normalizeText(row.platform),
      party: row.party ? normalizeText(row.party) : null,
      order: Number.isFinite(order) && order >= 1 ? order : 1,
      active: row.active === undefined ? true : row.active === true,
    },
  };
}

/**
 * Process candidate rows against the election's positions and existing
 * candidates. Duplicates within the file and against existing candidates
 * (same position + name + section) become updates, never silent inserts.
 */
function processCandidateImport({ rows, positions, existingCandidates }) {
  const positionsById = new Map((positions || []).map((p) => (typeof p === 'string' ? [p, { id: p }] : [p.id, p])));
  const summary = { total: rows.length, inserted: 0, updated: 0, duplicates: 0, invalid: 0, rejected: 0, errors: [] };
  const records = [];
  const seenInFile = new Map();
  const existingByKey = new Map((existingCandidates || []).map((c) => [candidateIdentityKey(c), c]));

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const normalized = normalizeCandidateRow(row);
    if (!normalized.ok) {
      summary.invalid += 1;
      summary.rejected += 1;
      summary.errors.push({ row: rowNumber, reason: normalized.error });
      return;
    }
    const value = normalized.value;
    if (!positionsById.has(value.positionId)) {
      summary.invalid += 1;
      summary.rejected += 1;
      summary.errors.push({ row: rowNumber, positionId: value.positionId, reason: 'Position does not exist on this election ballot.' });
      return;
    }
    const key = candidateIdentityKey(value);
    if (seenInFile.has(key)) {
      summary.duplicates += 1;
      summary.rejected += 1;
      summary.errors.push({ row: rowNumber, positionId: value.positionId, name: value.name, reason: 'Duplicate candidate in the file.' });
      return;
    }
    seenInFile.set(key, true);

    const existing = existingByKey.get(key);
    if (existing && existing.id) {
      summary.updated += 1;
      records.push({ ...value, id: existing.id });
    } else {
      summary.inserted += 1;
      records.push({ ...value, id: null });
    }
  });

  return { summary, records };
}

module.exports = { normalizeCandidateRow, processCandidateImport, candidateIdentityKey };
