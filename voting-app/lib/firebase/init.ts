import { getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './config';

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

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

  if (typeof window !== 'undefined') {
    connectLocalEmulators(authInstance, dbInstance, storageInstance);
  }

  return { app, auth: authInstance, db: dbInstance, storage: storageInstance };
}

function connectLocalEmulators(auth: Auth, db: Firestore, storage: FirebaseStorage) {
  const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true';
  if (useEmulators && !(globalThis as Record<string, unknown>).__CSS_VOTE_EMULATORS_CONNECTED__) {
    const firestorePort = Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? 8081);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', firestorePort);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
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
