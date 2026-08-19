import { getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import type { FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './config';

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let functionsInstance: Functions | null = null;

function assertFirebaseConfig() {
  const required = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
  ] as const;

  const missing = required.filter((key) => !firebaseConfig[key]);
  if (missing.length) {
    throw new Error(`Missing Firebase configuration: ${missing.join(', ')}`);
  }
}

function getFirebaseServices() {
  assertFirebaseConfig();

  app ??= getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  authInstance ??= getAuth(app);
  dbInstance ??= getFirestore(app);
  storageInstance ??= getStorage(app);
  functionsInstance ??= getFunctions(app);

  if (typeof window !== 'undefined') {
    connectLocalEmulators(authInstance, dbInstance, storageInstance, functionsInstance);
  }

  return { app, auth: authInstance, db: dbInstance, storage: storageInstance, functions: functionsInstance };
}

function connectLocalEmulators(auth: Auth, db: Firestore, storage: FirebaseStorage, functions: Functions) {
  const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true';
  if (useEmulators && !(globalThis as Record<string, unknown>).__CSS_VOTE_EMULATORS_CONNECTED__) {
    const firestorePort = Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? 8081);
    // Keep the emulator origin aligned with the page origin. Browsers treat
    // localhost and 127.0.0.1 as different origins, which can make callable
    // Functions fail their CORS preflight when the app is opened on localhost.
    const host = window.location.hostname || '127.0.0.1';
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, firestorePort);
    connectStorageEmulator(storage, host, 9199);
    connectFunctionsEmulator(functions, host, 5001);
    (globalThis as Record<string, unknown>).__CSS_VOTE_EMULATORS_CONNECTED__ = true;
  }
}

export function getFirebaseAuth(): Auth {
  return getFirebaseServices().auth;
}

export function getFirebaseDb(): Firestore {
  return getFirebaseServices().db;
}

export function getFirebaseStorage(): FirebaseStorage {
  return getFirebaseServices().storage;
}

export function getFirebaseFunctions(): Functions {
  return getFirebaseServices().functions;
}
