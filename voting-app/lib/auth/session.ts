import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '../firebase/init';
import type { Session } from '../types';

export function watchSession(callback: (session: Session) => void, onError?: (error: Error) => void): () => void {
  try {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();

    return onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          callback({ user: null, voterProfile: null, claims: null, adminViaRegistry: false });
          return;
        }

        const email = user.email?.toLowerCase() ?? '';
        const [tokenResult, voterSnapshot, adminSnapshot] = await Promise.all([
          user.getIdTokenResult(true),
          // Eligibility is security-sensitive. Do not admit a profile retained in
          // IndexedDB after the emulator or backing project has been reset.
          getDocFromServer(doc(db, 'voters', user.uid)),
          // registry lookup is best-effort: a failure here must not break sign-in
          email ? getDocFromServer(doc(db, 'admins', email)).catch(() => null) : Promise.resolve(null),
        ]);

        callback({
          user,
          voterProfile: voterSnapshot.exists()
            ? { uid: user.uid, ...(voterSnapshot.data() as Omit<import('../types').VoterProfile, 'uid'>) }
            : null,
          claims: tokenResult.claims as Record<string, unknown>,
          adminViaRegistry: adminSnapshot?.exists() ?? false,
        });
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error('Unable to load the current session.'));
      }
    }, (error) => {
      onError?.(error instanceof Error ? error : new Error('Unable to watch the current session.'));
    });
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error('Unable to start the sign-in service. Please refresh and try again.'));
    return () => {};
  }
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(getFirebaseAuth());
}
