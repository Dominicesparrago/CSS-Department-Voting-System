import { getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { firebaseConfig } from './config';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

if (typeof window !== 'undefined') {
  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (isLocalHost && !(globalThis as Record<string, unknown>).__CSS_VOTE_EMULATORS_CONNECTED__) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8081);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    (globalThis as Record<string, unknown>).__CSS_VOTE_EMULATORS_CONNECTED__ = true;
  }
}
