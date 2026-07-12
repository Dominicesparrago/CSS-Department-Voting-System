// Grant or revoke the superadmin custom claim for an existing Auth user.
// Superadmin is the root of trust and can only be set with the Admin SDK —
// everything below superadmin (the admin registry) is managed in-app.
//
// Emulator:   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node set-superadmin.mjs <email> [--revoke]
// Production: GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> \
//             node set-superadmin.mjs <email> --production [--revoke]

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'css-department-voting-sy-f46a5';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const REVOKE = process.argv.includes('--revoke');
const PRODUCTION = process.argv.includes('--production');
const onEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const email = args[0];

if (!email) {
  console.error('Usage: node set-superadmin.mjs <email> [--revoke] [--production]');
  process.exit(1);
}
if (!onEmulator && !PRODUCTION) {
  console.error(
    'Refusing to run: no FIREBASE_AUTH_EMULATOR_HOST set and --production not passed.\n' +
    'Set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 for the emulator, or pass --production explicitly.',
  );
  process.exit(1);
}

initializeApp(
  onEmulator
    ? { projectId: PROJECT_ID }
    : { credential: applicationDefault(), projectId: PROJECT_ID },
);

const auth = getAuth();
const user = await auth.getUserByEmail(email);
const claims = { ...(user.customClaims ?? {}) };
if (REVOKE) delete claims.superadmin;
else claims.superadmin = true;

await auth.setCustomUserClaims(user.uid, claims);
console.log(
  `${REVOKE ? 'Revoked' : 'Granted'} superadmin for ${email} (uid ${user.uid}) on ` +
  `${onEmulator ? 'the emulator' : 'PRODUCTION'}. Claims now: ${JSON.stringify(claims)}. ` +
  'The user must sign out/in (or refresh their token) for it to take effect.',
);
