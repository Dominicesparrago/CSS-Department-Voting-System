import { createUserWithEmailAndPassword, deleteUser, signInAnonymously, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '../firebase/init';

interface RegisterValues {
  email: string;
  password: string;
  studentNo: string;
  fullName: string;
  yearLevel: number;
  section: string;
}

interface GuestValues {
  studentNo: string;
  email: string;
  fullName: string;
  yearLevel: number;
  section: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function registerStudent(values: RegisterValues) {
  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  const credential = await createUserWithEmailAndPassword(auth, values.email, values.password);
  const { user } = credential;

  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    batch.set(doc(db, 'voters', user.uid), {
      studentNo: values.studentNo,
      fullName: values.fullName,
      email: values.email,
      yearLevel: values.yearLevel,
      section: values.section,
      eligible: true,
      createdAt: now,
      updatedAt: now,
    });

    batch.set(doc(db, 'studentIndex', values.studentNo), {
      uid: user.uid,
      createdAt: now,
    });

    await batch.commit();
    return user;
  } catch (error) {
    try {
      await deleteUser(user);
    } catch {
      await signOut(auth);
    }
    throw error;
  }
}

export async function loginStudent(email: string, password: string) {
  const auth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function loginGuest(values: GuestValues) {
  const auth = getFirebaseAuth();
  const db = getFirebaseDb();
  const credential = await signInAnonymously(auth);
  const { user } = credential;

  try {
    const now = serverTimestamp();
    const email = normalizeEmail(values.email);
    const batch = writeBatch(db);
    batch.set(doc(db, 'voters', user.uid), {
      studentNo: values.studentNo,
      fullName: values.fullName,
      email,
      yearLevel: values.yearLevel,
      section: values.section,
      eligible: true,
      guest: true,
      createdAt: now,
      updatedAt: now,
    });
    batch.set(doc(db, 'studentIndex', values.studentNo), {
      uid: user.uid,
      createdAt: now,
    });
    batch.set(doc(db, 'emailIndex', email), {
      uid: user.uid,
      createdAt: now,
    });
    await batch.commit();
    return user;
  } catch (error) {
    try {
      await deleteUser(user);
    } catch {
      await signOut(auth);
    }
    throw error;
  }
}
