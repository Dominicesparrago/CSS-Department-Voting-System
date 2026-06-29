import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/init';
import type { Session } from '../types';

export function watchSession(callback: (session: Session) => void): () => void {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({ user: null, voterProfile: null, claims: null });
      return;
    }

    try {
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
    } catch {
      // If the profile/token fetch fails, surface the user without a voter profile
      // so the page doesn't stay stuck on "Checking session..." indefinitely.
      callback({ user, voterProfile: null, claims: null });
    }
  });
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}
