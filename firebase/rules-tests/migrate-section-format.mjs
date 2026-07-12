// One-time migration: normalize voter/candidate `section` values to the
// canonical `BSCS-<year><letter>` format (e.g. "BSCS 3-A" -> "BSCS-3A").
//
// Dry-run by default — prints what would change and exits. Pass --apply to write.
//
// Lives in rules-tests/ because firebase-admin is installed here.
//
// Emulator:   FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 node migrate-section-format.mjs [--apply]
// Production: GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
//             node migrate-section-format.mjs --production [--apply]

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'css-department-voting-sy-f46a5';
const APPLY = process.argv.includes('--apply');
const PRODUCTION = process.argv.includes('--production');
const onEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

if (!onEmulator && !PRODUCTION) {
  console.error(
    'Refusing to run: no FIRESTORE_EMULATOR_HOST set and --production not passed.\n' +
    'Set FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 for the emulator, or pass --production explicitly.',
  );
  process.exit(1);
}

initializeApp(
  onEmulator
    ? { projectId: PROJECT_ID }
    : { credential: applicationDefault(), projectId: PROJECT_ID },
);
const db = getFirestore();

const SECTION_PATTERN = /^BSCS[\s-]*([1-4])[\s-]*([A-Za-z])$/i;

function canonicalSection(value) {
  if (typeof value !== 'string') return null;
  const match = SECTION_PATTERN.exec(value.trim());
  if (!match) return null;
  return `BSCS-${match[1]}${match[2].toUpperCase()}`;
}

async function migrateCollection(name) {
  const snapshot = await db.collection(name).get();
  const changes = [];
  const unrecognized = [];

  snapshot.forEach((doc) => {
    const section = doc.data().section;
    if (section == null || section === '') return;
    const canonical = canonicalSection(section);
    if (canonical === null) {
      unrecognized.push({ id: doc.id, section });
    } else if (canonical !== section) {
      changes.push({ id: doc.id, from: section, to: canonical });
    }
  });

  console.log(`\n${name}: ${snapshot.size} docs, ${changes.length} to update, ${unrecognized.length} unrecognized`);
  for (const c of changes) console.log(`  ${c.id}: "${c.from}" -> "${c.to}"`);
  for (const u of unrecognized) console.log(`  !! ${u.id}: "${u.section}" (left unchanged — review manually)`);

  if (APPLY && changes.length > 0) {
    // Firestore batches cap at 500 writes
    for (let i = 0; i < changes.length; i += 400) {
      const batch = db.batch();
      for (const c of changes.slice(i, i + 400)) {
        batch.update(db.collection(name).doc(c.id), {
          section: c.to,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
    console.log(`  applied ${changes.length} update(s)`);
  }

  return { updated: changes.length, unrecognized: unrecognized.length };
}

console.log(`Target: ${onEmulator ? `emulator (${process.env.FIRESTORE_EMULATOR_HOST})` : 'PRODUCTION'} · mode: ${APPLY ? 'APPLY' : 'dry-run'}`);

const voters = await migrateCollection('voters');
const candidates = await migrateCollection('candidates');

console.log(`\nDone. ${APPLY ? 'Applied' : 'Would apply'} ${voters.updated + candidates.updated} update(s); ${voters.unrecognized + candidates.unrecognized} unrecognized value(s).`);
if (!APPLY) console.log('Re-run with --apply to write these changes.');
