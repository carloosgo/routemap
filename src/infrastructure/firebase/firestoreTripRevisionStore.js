import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { TRIP_REVISION_COLLECTIONS } from './tripStorageSchema.js';

const WRITE_BATCH_LIMIT = 400;

export function createRevisionId() {
  const randomId = globalThis.crypto?.randomUUID?.().replaceAll('-', '');
  if (randomId) return randomId;
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

function documentIdForPosition(position) {
  return String(position).padStart(6, '0');
}

async function commitMutations(db, mutations) {
  for (let offset = 0; offset < mutations.length; offset += WRITE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    mutations.slice(offset, offset + WRITE_BATCH_LIMIT).forEach((mutation) => {
      if (mutation.type === 'delete') batch.delete(mutation.ref);
      else batch.set(mutation.ref, mutation.data);
    });
    await batch.commit();
  }
}

export function revisionRefFor(tripRef, revisionId) {
  return doc(collection(tripRef, 'revisions'), revisionId);
}

export async function readRevisionCollections(revisionRef) {
  const snapshots = await Promise.all(
    TRIP_REVISION_COLLECTIONS.map((name) =>
      getDocs(collection(revisionRef, name))
    )
  );

  return Object.fromEntries(
    snapshots.map((snapshot, index) => [
      TRIP_REVISION_COLLECTIONS[index],
      snapshot.docs.map((item) => item.data()),
    ])
  );
}

export async function writeRevisionPayload(db, revisionRef, payload) {
  await setDoc(revisionRef, payload.revision);

  const mutations = TRIP_REVISION_COLLECTIONS.flatMap((name) =>
    payload.collections[name].map((item, position) => ({
      type: 'set',
      ref: doc(
        collection(revisionRef, name),
        documentIdForPosition(position)
      ),
      data: item,
    }))
  );

  await commitMutations(db, mutations);
  await setDoc(revisionRef, { ...payload.revision, complete: true });
}

export async function deleteRevision(db, revisionRef) {
  const snapshots = await Promise.all(
    TRIP_REVISION_COLLECTIONS.map((name) =>
      getDocs(collection(revisionRef, name))
    )
  );
  const mutations = snapshots.flatMap((snapshot) =>
    snapshot.docs.map((item) => ({ type: 'delete', ref: item.ref }))
  );
  mutations.push({ type: 'delete', ref: revisionRef });
  await commitMutations(db, mutations);
}

export async function listRevisionRefs(tripRef) {
  const revisions = await getDocs(collection(tripRef, 'revisions'));
  return revisions.docs.map((revision) => revision.ref);
}

export async function cleanupOldRevisions(db, tripRef, activeRevision) {
  try {
    const revisions = await getDocs(collection(tripRef, 'revisions'));
    for (const revision of revisions.docs) {
      if (revision.id !== activeRevision) {
        await deleteRevision(db, revision.ref);
      }
    }
  } catch {
    // La revisión activa ya es válida; la limpieza se vuelve a intentar en otro guardado.
  }
}
