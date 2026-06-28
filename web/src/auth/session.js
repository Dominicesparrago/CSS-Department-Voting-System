import {
  onAuthStateChanged,
  signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db } from "../firebase/init.js";

let currentSession = {
  user: null,
  voterProfile: null,
  claims: null
};

export function getCurrentSession() {
  return currentSession;
}

export function watchSession(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentSession = {
        user: null,
        voterProfile: null,
        claims: null
      };
      callback(currentSession);
      return;
    }

    const [tokenResult, voterSnapshot] = await Promise.all([
      user.getIdTokenResult(true),
      getDoc(doc(db, "voters", user.uid))
    ]);

    currentSession = {
      user,
      voterProfile: voterSnapshot.exists()
        ? { uid: user.uid, ...voterSnapshot.data() }
        : null,
      claims: tokenResult.claims
    };
    callback(currentSession);
  });
}

export async function signOut() {
  await firebaseSignOut(auth);
}

