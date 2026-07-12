import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '../firebase/init';
import type { Session } from '../types';

export function watchSession(callback: (session: Session) => void, onError?: (error: Error) => void): () => void {
  try {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();

    return onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          callback({ user: null, voterProfile: null, claims: null });
          return;
        }

        const [tokenResult, voterSnapshot] = await Promise.all([
          user.getIdTokenResult(true),
          getDoc(doc(db, 'voters', user.uid)),
        ]);

        callback({
          user,
          voterProfile: voterSnapshot.exists()
            ? { uid: user.uid, ...(voterSnapshot.data() as Omit<import('../types').VoterProfile, 'uid'>) }
            : null,
          claims: tokenResult.claims as Record<string, unknown>,
        });
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error('Unable to load the current session.'));
      }
    }, (error) => {
      onError?.(error instanceof Error ? error : new Error('Unable to watch the current session.'));
    });
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error('Unable to initialize Firebase authentication.'));
    return () => {};
  }
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(getFirebaseAuth());
}
