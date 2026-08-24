import { createUserWithEmailAndPassword, deleteUser, signInAnonymously, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseDb, getFirebaseFunctions } from '../firebase/init';
import { verifyStudentRegistration, normalizeSection, namesMatch } from '../student/registrationVerification';

interface RegisterValues {
  email: string;
  password: string;
  studentNo: string;
  fullName: string;
  yearLevel: number;
  section: string;
  electionId?: string;
}

interface GuestValues {
  fullName: string;
  yearLevel: number;
  section: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function registerStudent(values: RegisterValues) {
  // Step 1: Verify student against the official roster
  const verification = await verifyStudentRegistration(
    values.studentNo,
    values.fullName,
    values.email,
    values.yearLevel,
    values.section
  );

  if (!verification.ok) {
    throw new Error(verification.message);
  }

  // Step 2: Create Firebase user and register
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
    const batch = writeBatch(db);
    batch.set(doc(db, 'voters', user.uid), {
      fullName: values.fullName,
      yearLevel: values.yearLevel,
      section: values.section,
      eligible: true,
      guest: true,
      createdAt: now,
      updatedAt: now,
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
