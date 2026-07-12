import type { QuerySnapshot } from 'firebase/firestore';

/** Map a query snapshot to typed records with their document id attached. */
export function snapshotRecords<T>(snapshot: QuerySnapshot): (T & { id: string })[] {
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T & { id: string });
}
