'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
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
} = require('./rosterLogic');

const ACTIVE_VOTER = {
  studentNo: '20260001',
  fullName: 'Juan Dela Cruz',
  email: 'juan.delacruz.scc@gmail.com',
  yearLevel: 1,
  section: 'BSCS-1A',
  eligible: true,
};

test('normalizeStudentNo keeps digits and strips separators', () => {
  assert.equal(normalizeStudentNo(' 2026-0001 '), '20260001');
  assert.equal(normalizeStudentNo(20260002), '20260002');
  assert.equal(normalizeStudentNo(null), '');
});

test('normalizeSection canonicalizes BSCS variants', () => {
  assert.equal(normalizeSection('BSCS-3A'), 'BSCS-3A');
  assert.equal(normalizeSection('BSCS 3-A'), 'BSCS-3A');
  assert.equal(normalizeSection('BSCS-3 A'), 'BSCS-3A');
  assert.equal(normalizeSection('bscs3a'), 'BSCS-3A');
  assert.equal(normalizeSection('BSCS-2B'), 'BSCS-2B');
  assert.equal(normalizeSection('BSIT-3A'), '');
  assert.equal(normalizeSection('BSCS-5A'), '');
  assert.equal(normalizeSection(null), '');
});

test('normalizeSection accepts masterlist CS sheet names', () => {
  assert.equal(normalizeSection('CS 1A'), 'BSCS-1A');
  assert.equal(normalizeSection('CS1A'), 'BSCS-1A');
  assert.equal(normalizeSection('CS-2B'), 'BSCS-2B');
  assert.equal(normalizeSection('cs 3 c'), 'BSCS-3C');
  assert.equal(normalizeSection('CS 1-A'), 'BSCS-1A');
  assert.equal(normalizeSection('1A'), 'BSCS-1A');
  assert.equal(normalizeSection('Sheet1'), '');
  assert.equal(normalizeSection('Summary'), '');
});

test('normalizeEmail lowercases and rejects non-email placeholders', () => {
  assert.equal(normalizeEmail(' JUAN.DELACRUZ.SCC@GMAIL.COM '), 'juan.delacruz.scc@gmail.com');
  assert.equal(normalizeEmail('N/A'), '');
  assert.equal(normalizeEmail('-'), '');
  assert.equal(normalizeEmail(''), '');
  assert.equal(normalizeEmail('not-an-email'), '');
});

test('normalizeYearLevel accepts numbers and word forms', () => {
  assert.equal(normalizeYearLevel(3), 3);
  assert.equal(normalizeYearLevel('3'), 3);
  assert.equal(normalizeYearLevel('3rd Year'), 3);
  assert.equal(normalizeYearLevel('Year 4'), 4);
  assert.equal(normalizeYearLevel('Grade 12'), null);
  assert.equal(normalizeYearLevel(5), null);
  assert.equal(normalizeYearLevel(''), null);
});

test('normalizeStatus and normalizeEligible map word variants', () => {
  assert.equal(normalizeStatus('Active'), 'active');
  assert.equal(normalizeStatus('ENROLLED'), 'active');
  assert.equal(normalizeStatus('Enlisted'), 'active');
  assert.equal(normalizeStatus('inactive'), 'inactive');
  assert.equal(normalizeStatus('Withdrawn'), 'inactive');
  assert.equal(normalizeStatus(''), 'active');
  assert.equal(normalizeStatus('maybe'), null);

  assert.equal(normalizeEligible('yes'), true);
  assert.equal(normalizeEligible('Eligible'), true);
  assert.equal(normalizeEligible('no'), false);
  assert.equal(normalizeEligible(''), true);
  assert.equal(normalizeEligible('sometimes'), null);
});

test('normalizeRosterRow + validateRosterRow accept a clean row', () => {
  const row = normalizeRosterRow({
    studentNo: ' 2026-0001 ',
    fullName: '  Juan Dela Cruz  ',
    section: 'BSCS 1-A',
    yearLevel: '1st Year',
    email: 'JUAN.DELACRUZ.SCC@GMAIL.COM',
    status: 'enrolled',
    eligible: 'yes',
  });
  assert.deepEqual(row, {
    studentNo: '20260001',
    fullName: 'Juan Dela Cruz',
    section: 'BSCS-1A',
    yearLevel: 1,
    email: 'juan.delacruz.scc@gmail.com',
    status: 'active',
    eligible: true,
  });
  assert.deepEqual(validateRosterRow(row), []);
});

test('validateRosterRow flags each missing/invalid field', () => {
  const row = normalizeRosterRow({});
  const problems = validateRosterRow(row);
  // A student number is optional for masterlist rows, so an empty row is
  // flagged for the fields that are always required.
  assert.ok(problems.length >= 3);
  assert.ok(problems.some((p) => p.includes('Full name')));
  assert.ok(problems.some((p) => p.includes('section')));
  assert.ok(problems.some((p) => p.includes('year level')));
});

test('namesMatch tolerates case, punctuation, middle names, and suffixes', () => {
  assert.equal(namesMatch('Juan Dela Cruz', 'Juan Dela Cruz'), true);
  assert.equal(namesMatch('JUAN DELA CRUZ', 'juan dela cruz'), true);
  assert.equal(namesMatch('Juan A. Dela Cruz', 'Juan Dela Cruz'), true);
  assert.equal(namesMatch('Juan Dela Cruz', 'Juan Dela Cruz Jr.'), true);
  assert.equal(namesMatch('Juan Dela Cruz III', 'Juan Dela Cruz'), true);
  assert.equal(namesMatch('Juan Dela Cruz', 'Juan Dela Cruz'), true);
});

test('namesMatch rejects swapped or forged names', () => {
  assert.equal(namesMatch('Maria Santos', 'Juan Dela Cruz'), false);
  assert.equal(namesMatch('Cruz Juan', 'Juan Dela Cruz'), false);
  assert.equal(namesMatch('Juan Santos', 'Juan Dela Cruz'), false);
  assert.equal(namesMatch('', 'Juan Dela Cruz'), false);
});

test('normalizeFullName swaps Surname, Firstname to Firstname Surname', () => {
  assert.equal(normalizeFullName('Dela Cruz, Juan'), 'Juan Dela Cruz');
  assert.equal(normalizeFullName('DELA CRUZ, JUAN A.'), 'JUAN A. DELA CRUZ');
  assert.equal(normalizeFullName('Santos, Maria'), 'Maria Santos');
  assert.equal(normalizeFullName('  Dela Cruz ,  Juan  '), 'Juan Dela Cruz');
  assert.equal(normalizeFullName('Juan Dela Cruz'), 'Juan Dela Cruz');
  assert.equal(normalizeFullName(''), '');
  assert.equal(normalizeFullName(null), '');
});

test('identityKey keys by student number or section + normalized name', () => {
  assert.equal(identityKey({ studentNo: '20260001', section: 'BSCS-1A', fullName: 'Juan Dela Cruz' }), 'id:20260001');
  assert.equal(
    identityKey({ section: 'BSCS-1A', fullName: 'Juan Dela Cruz' }),
    `name:BSCS-1A|${normalizeName('Juan Dela Cruz')}`,
  );
  // same person, different case/punctuation → same key
  assert.equal(
    identityKey({ section: 'BSCS-1A', fullName: 'JUAN A. DELA CRUZ' }),
    identityKey({ section: 'BSCS-1A', fullName: 'Juan Dela Cruz' }),
  );
});

test('normalizeRosterRow swaps comma names and keeps masterlist rows without IDs valid', () => {
  const row = normalizeRosterRow({
    fullName: 'Dela Cruz, Juan',
    section: 'CS 1A',
    yearLevel: '1',
    status: 'Enlisted',
  });
  assert.equal(row.studentNo, '');
  assert.equal(row.fullName, 'Juan Dela Cruz');
  assert.equal(row.section, 'BSCS-1A');
  assert.equal(row.yearLevel, 1);
  assert.equal(row.status, 'active');
  assert.equal(row.eligible, true);
  assert.deepEqual(validateRosterRow(row), []);
});

test('validateRosterRow rejects a malformed student number but allows a missing one', () => {
  const badId = normalizeRosterRow({ studentNo: 'abc', fullName: 'Juan Dela Cruz', section: 'BSCS-1A', yearLevel: 1 });
  const problems = validateRosterRow(badId);
  assert.ok(problems.some((p) => p.includes('student ID')));

  const noId = normalizeRosterRow({ fullName: 'Juan Dela Cruz', section: 'BSCS-1A', yearLevel: 1 });
  assert.deepEqual(validateRosterRow(noId), []);
});

test('processRosterImport accepts and dedupes masterlist rows without student numbers', () => {
  const { summary, records } = processRosterImport([
    { fullName: 'Dela Cruz, Juan', section: 'CS 1A', yearLevel: '1', status: 'Enlisted' },
    { fullName: 'Dela Cruz, Juan', section: 'CS 1A', yearLevel: '1' }, // same section + name → duplicate
    { fullName: 'Santos, Maria', section: 'CS 2B', yearLevel: '2' },
    { studentNo: 'bad', fullName: 'Bad ID', section: 'CS 3A', yearLevel: '3' },
  ]);

  assert.equal(summary.total, 4);
  assert.equal(summary.duplicates, 1);
  assert.equal(summary.invalid, 1);
  assert.equal(summary.rejected, 2);
  assert.equal(records.length, 2);
  assert.equal(records[0].studentNo, '');
  assert.equal(records[0].fullName, 'Juan Dela Cruz');
  assert.equal(records[0].section, 'BSCS-1A');
  assert.equal(records[1].fullName, 'Maria Santos');
  assert.ok(summary.errors.some((e) => e.reason.includes('Duplicate student record')));
});

test('resolveNameRosterMatch finds the unique active eligible entry for a voter', () => {
  const voter = { fullName: 'Maria Santos', yearLevel: 2 };
  const candidates = [
    { fullName: 'Juan Dela Cruz', yearLevel: 1, status: 'active', eligible: true },
    { fullName: 'Maria Santos', yearLevel: 2, status: 'active', eligible: true },
    { fullName: 'Maria Santos', yearLevel: 2, status: 'active', eligible: false },
  ];
  const result = resolveNameRosterMatch(candidates, voter);
  assert.equal(result.ok, true);
  assert.equal(result.record.fullName, 'Maria Santos');
  assert.equal(result.record.eligible, true);
});

test('resolveNameRosterMatch rejects no-match, inactive-only, and ambiguous matches', () => {
  const voter = { fullName: 'Maria Santos', yearLevel: 2 };
  assert.equal(resolveNameRosterMatch([], voter).ok, false);

  // only an inactive entry with the name → no eligible match
  const inactiveOnly = resolveNameRosterMatch(
    [{ fullName: 'Maria Santos', yearLevel: 2, status: 'inactive', eligible: true }],
    voter,
  );
  assert.equal(inactiveOnly.ok, false);
  assert.equal(inactiveOnly.reason, 'not-on-roster');

  // two active entries with the same name + year → ambiguous, rejected
  const ambiguous = resolveNameRosterMatch(
    [
      { fullName: 'Maria Santos', yearLevel: 2, status: 'active', eligible: true },
      { fullName: 'Maria Santos', yearLevel: 2, status: 'active', eligible: true },
    ],
    voter,
  );
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.reason, 'mismatch');
});

test('validateRosterEligibility returns a client-facing reason per failure', () => {
  const cases = [
    [{ roster: null }, 'not-on-roster'],
    [{ roster: { status: 'inactive', eligible: true, yearLevel: 1, section: 'BSCS-1A', fullName: 'Juan Dela Cruz' } }, 'inactive'],
    [{ roster: { status: 'active', eligible: false, yearLevel: 1, section: 'BSCS-1A', fullName: 'Juan Dela Cruz' } }, 'not-eligible'],
    [{ roster: { status: 'active', eligible: true, yearLevel: 1, section: 'BSCS-1A', fullName: 'Maria Santos' } }, 'mismatch'],
    [{ roster: { status: 'active', eligible: true, yearLevel: 1, section: 'BSCS-1A', fullName: 'Juan Dela Cruz', email: 'juan.delacruz.scc@gmail.com' }, voter: { ...ACTIVE_VOTER, email: 'other.scc@gmail.com' } }, 'email-mismatch'],
    [{ roster: { status: 'active', eligible: true, yearLevel: 1, section: 'BSCS-1A', fullName: 'Juan Dela Cruz' }, election: { eligibleSections: ['BSCS-2A'] } }, 'section-not-eligible'],
  ];
  for (const [extra, expected] of cases) {
    const result = validateRosterEligibility({ voter: ACTIVE_VOTER, election: {}, ...extra });
    assert.equal(result.ok, false);
    assert.equal(result.reason, expected);
  }
});

test('processRosterImport separates valid, invalid, and duplicate rows', () => {
  const { summary, records } = processRosterImport([
    { studentNo: '20260001', fullName: 'One', section: 'BSCS-1A', yearLevel: 1 },
    { studentNo: '20260001', fullName: 'Duplicate', section: 'BSCS-1A', yearLevel: 1 },
    { studentNo: '20260002', fullName: 'Two', section: 'BSCS 2-B', yearLevel: 2 },
    { studentNo: '20260003', fullName: '', section: 'BSCS-3A', yearLevel: 3 },
    { studentNo: 'x', fullName: 'Bad ID', section: 'BSCS-3A', yearLevel: 3 },
  ]);

  assert.equal(summary.total, 5);
  assert.equal(summary.duplicates, 1);
  assert.equal(summary.invalid, 2);
  assert.equal(summary.missingRequired, 1);
  assert.equal(summary.rejected, 3);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((r) => r.studentNo), ['20260001', '20260002']);
  assert.equal(records[1].section, 'BSCS-2B');
  assert.ok(summary.errors.some((e) => e.reason.includes('Duplicate student record')));
  assert.ok(summary.errors.some((e) => e.reason.includes('Full name is required')));
});

test('validateRosterEligibility passes for an active eligible roster match', () => {
  const result = validateRosterEligibility({
    voter: ACTIVE_VOTER,
    roster: { studentNo: '20260001', fullName: 'Juan Dela Cruz', status: 'active', eligible: true, yearLevel: 1, section: 'BSCS-1A', email: 'juan.delacruz.scc@gmail.com' },
    election: {},
  });
  assert.equal(result.ok, true);
});

test('validateRosterEligibility rejects a missing roster record', () => {
  const result = validateRosterEligibility({ voter: ACTIVE_VOTER, roster: null, election: {} });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'permission-denied');
  assert.match(result.message, /not on the official roster/);
});

test('validateRosterEligibility rejects inactive and ineligible records', () => {
  const inactive = validateRosterEligibility({
    voter: ACTIVE_VOTER,
    roster: { status: 'inactive', eligible: true, yearLevel: 1, section: 'BSCS-1A' },
    election: {},
  });
  assert.equal(inactive.ok, false);
  assert.match(inactive.message, /not active/);

  const ineligible = validateRosterEligibility({
    voter: ACTIVE_VOTER,
    roster: { status: 'active', eligible: false, yearLevel: 1, section: 'BSCS-1A' },
    election: {},
  });
  assert.equal(ineligible.ok, false);
  assert.match(ineligible.message, /not marked eligible/);
});

test('validateRosterEligibility rejects a name that does not match the roster', () => {
  const result = validateRosterEligibility({
    voter: { ...ACTIVE_VOTER, fullName: 'Maria Santos' },
    roster: { status: 'active', eligible: true, yearLevel: 1, section: 'BSCS-1A', fullName: 'Juan Dela Cruz' },
    election: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'failed-precondition');
  assert.match(result.message, /does not match/);
});

test('validateRosterEligibility accepts matching names with case/suffix variation', () => {
  const result = validateRosterEligibility({
    voter: { ...ACTIVE_VOTER, fullName: 'JUAN DELA CRUZ JR.' },
    roster: { status: 'active', eligible: true, yearLevel: 1, section: 'BSCS-1A', fullName: 'Juan Dela Cruz' },
    election: {},
  });
  assert.equal(result.ok, true);
});

test('validateRosterEligibility accepts compound surname formatting variation', () => {
  const result = validateRosterEligibility({
    voter: { ...ACTIVE_VOTER, fullName: 'Emerson De Guzman' },
    roster: { status: 'active', eligible: true, yearLevel: 1, section: 'BSCS-1A', fullName: 'DeGuzman, Emerson' },
    election: {},
  });
  assert.equal(result.ok, true);
});

test('validateRosterEligibility rejects year/section mismatch (forged registration)', () => {
  const wrongYear = validateRosterEligibility({
    voter: ACTIVE_VOTER,
    roster: { status: 'active', eligible: true, yearLevel: 4, section: 'BSCS-1A' },
    election: {},
  });
  assert.equal(wrongYear.ok, false);
  assert.match(wrongYear.message, /does not match/);

  const wrongSection = validateRosterEligibility({
    voter: ACTIVE_VOTER,
    roster: { status: 'active', eligible: true, yearLevel: 1, section: 'BSCS-1B' },
    election: {},
  });
  assert.equal(wrongSection.ok, false);
});

test('validateRosterEligibility rejects email mismatch when the roster has an email', () => {
  const result = validateRosterEligibility({
    voter: { ...ACTIVE_VOTER, email: 'other.person.scc@gmail.com' },
    roster: { status: 'active', eligible: true, yearLevel: 1, section: 'BSCS-1A', fullName: 'Juan Dela Cruz', email: 'juan.delacruz.scc@gmail.com' },
    election: {},
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /email/);
});

test('validateRosterEligibility allows voting when the roster has no email', () => {
  const result = validateRosterEligibility({
    voter: ACTIVE_VOTER,
    roster: { status: 'active', eligible: true, yearLevel: 1, section: 'BSCS-1A', fullName: 'Juan Dela Cruz' },
    election: {},
  });
  assert.equal(result.ok, true);
});

test('validateRosterEligibility enforces election eligibleSections', () => {
  const denied = validateRosterEligibility({
    voter: ACTIVE_VOTER,
    roster: { status: 'active', eligible: true, yearLevel: 1, section: 'BSCS-1A', fullName: 'Juan Dela Cruz' },
    election: { eligibleSections: ['BSCS-2A', 'BSCS-3A'] },
  });
  assert.equal(denied.ok, false);
  assert.match(denied.message, /section is not eligible/);

  const allowed = validateRosterEligibility({
    voter: ACTIVE_VOTER,
    roster: { status: 'active', eligible: true, yearLevel: 1, section: 'BSCS-1A', fullName: 'Juan Dela Cruz' },
    election: { eligibleSections: ['BSCS-1A', 'BSCS-2A'] },
  });
  assert.equal(allowed.ok, true);
});
