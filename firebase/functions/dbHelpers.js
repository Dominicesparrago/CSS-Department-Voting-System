'use strict';

const BATCH_SIZE = 400;

/** Read every document in a collection, paginated by name (complete for large sets). */
async function readAllDocs(db, collectionName) {
  const docs = [];
  let cursor = null;
  for (;;) {
    let query = db.collection(collectionName).orderBy('__name__').limit(1000);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    snapshot.docs.forEach((d) => docs.push(d));
    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < 1000) break;
  }
  return docs;
}

/** Delete every document in a collection, paginated (used by reset). */
async function deleteAllDocs(db, collectionName) {
  const docs = await readAllDocs(db, collectionName);
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return docs.length;
}

/** Read all documents matching a simple field filter, paginated by name. */
async function readDocsWhere(db, collectionName, field, value) {
  const docs = [];
  let cursor = null;
  for (;;) {
    let query = db.collection(collectionName).where(field, '==', value).orderBy('__name__').limit(1000);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    snapshot.docs.forEach((d) => docs.push(d));
    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < 1000) break;
  }
  return docs;
}

/** Delete documents (given as {id}) from a collection in batches. */
async function batchDeleteByIds(db, collectionName, ids) {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = db.batch();
    ids.slice(i, i + BATCH_SIZE).forEach((id) => batch.delete(db.doc(`${collectionName}/${id}`)));
    await batch.commit();
    deleted += Math.min(BATCH_SIZE, ids.length - i);
  }
  return deleted;
}

/** Run an async callback per chunk; used to keep memory bounded on big sets. */
async function chunk(entries, size, fn) {
  for (let i = 0; i < entries.length; i += size) {
    await fn(entries.slice(i, i + size), i);
  }
}

module.exports = { readAllDocs, deleteAllDocs, readDocsWhere, batchDeleteByIds, chunk, BATCH_SIZE };
