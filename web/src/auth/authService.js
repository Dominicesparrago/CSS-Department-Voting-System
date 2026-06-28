import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { auth, db } from "../firebase/init.js";

export async function registerStudent(values) {
  const credential = await createUserWithEmailAndPassword(auth, values.email, values.password);
  const { user } = credential;

  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    batch.set(doc(db, "voters", user.uid), {
      studentNo: values.studentNo,
      fullName: values.fullName,
      email: values.email,
      yearLevel: values.yearLevel,
      section: values.section,
      eligible: true,
      createdAt: now,
      updatedAt: now
    });

    batch.set(doc(db, "studentIndex", values.studentNo), {
      uid: user.uid,
      createdAt: now
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

export async function loginStudent(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

