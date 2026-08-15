import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '../firebase/init';
import type { Session } from '../types';

const ANONYMOUS_PROFILE_RETRIES = 10;
const ANONYMOUS_PROFILE_RETRY_DELAY_MS = 100;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadVoterProfile(user: User, db: ReturnType<typeof getFirebaseDb>) {
  const profileRef = doc(db, 'voters', user.uid);
  let snapshot = await getDocFromServer(profileRef);

  // signInAnonymously emits auth state before loginGuest can finish its profile
  // batch. Wait for that profile instead of publishing a false guest session.
  if (!user.email && !snapshot.exists()) {
    for (let attempt = 0; attempt < ANONYMOUS_PROFILE_RETRIES && !snapshot.exists(); attempt += 1) {
      await wait(ANONYMOUS_PROFILE_RETRY_DELAY_MS);
      if (getFirebaseAuth().currentUser?.uid !== user.uid) return null;
      snapshot = await getDocFromServer(profileRef);
    }
  }

  return snapshot;
}

export function watchSession(callback: (session: Session) => void, onError?: (error: Error) => void): () => void {
  try {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    let disposed = false;
    let generation = 0;
    let unsubscribe = () => {};

    const processSession = async () => {
      const currentGeneration = ++generation;
      const user = auth.currentUser;

      if (!user) {
        if (!disposed && currentGeneration === generation) {
          callback({ user: null, voterProfile: null, claims: null, adminViaRegistry: false });
        }
        return;
      }

      try {
        const email = user.email?.toLowerCase() ?? '';
        const [tokenResult, voterSnapshot, adminSnapshot] = await Promise.all([
          user.getIdTokenResult(true),
          loadVoterProfile(user, db),
          // registry lookup is best-effort: a failure here must not break sign-in
          email ? getDocFromServer(doc(db, 'admins', email)).catch(() => null) : Promise.resolve(null),
        ]);

        if (disposed || currentGeneration !== generation || auth.currentUser?.uid !== user.uid) return;
        if (!voterSnapshot) return;

        callback({
          user,
          voterProfile: voterSnapshot.exists()
            ? { uid: user.uid, ...(voterSnapshot.data() as Omit<import('../types').VoterProfile, 'uid'>) }
            : null,
          claims: tokenResult.claims as Record<string, unknown>,
          adminViaRegistry: adminSnapshot?.exists() ?? false,
        });
      } catch (error) {
        if (disposed || currentGeneration !== generation) return;
        onError?.(error instanceof Error ? error : new Error('Unable to load the current session.'));
      }
    };

    void auth.authStateReady().then(() => {
      if (disposed) return;
      unsubscribe = onAuthStateChanged(auth, () => {
        void processSession();
      }, (error) => {
        if (!disposed) {
          onError?.(error instanceof Error ? error : new Error('Unable to watch the current session.'));
        }
      });
    }).catch((error) => {
      if (!disposed) {
        onError?.(error instanceof Error ? error : new Error('Unable to initialize the current session.'));
      }
    });

    return () => {
      disposed = true;
      generation += 1;
      unsubscribe();
    };
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error('Unable to start the sign-in service. Please refresh and try again.'));
    return () => {};
  }
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(getFirebaseAuth());
}
