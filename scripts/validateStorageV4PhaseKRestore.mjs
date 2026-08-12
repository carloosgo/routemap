/* global process, console, fetch */
import { createHash } from 'node:crypto';

const PROJECT = 'atlasmap-dev';
const SOURCE_DB = '(default)';
const MAX_DOCUMENTS = 10_000;

function option(name) {
  const prefix = `${name}=`;
  const entry = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : '';
}

function assertDatabaseId(value) {
  if (!/^atlas-restore-drill-[a-z0-9-]+$/.test(value)) {
    throw new Error('destination-db debe ser una base atlas-restore-drill-* valida.');
  }
  return value;
}

function assertReadTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new Error('source-read-time debe ser un timestamp RFC3339 valido.');
  }
  return value;
}

function accessToken() {
  const token = String(process.env.ATLAS_GCLOUD_ACCESS_TOKEN || '').trim();
  if (!token) {
    throw new Error('Falta ATLAS_GCLOUD_ACCESS_TOKEN; el launcher debe inyectarlo sin imprimirlo.');
  }
  return token;
}

function encodeDocumentPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function requestJson(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 800);
    throw new Error(`Firestore REST ${response.status}: ${text}`);
  }
  return response.json();
}

function databaseRoot(databaseId) {
  return `projects/${PROJECT}/databases/${databaseId}/documents`;
}

function restBase(databaseId) {
  return `https://firestore.googleapis.com/v1/${databaseRoot(databaseId)}`;
}

async function listCollectionIds({ databaseId, parentPath = '', readTime, token }) {
  const parent = parentPath
    ? `${restBase(databaseId)}/${encodeDocumentPath(parentPath)}`
    : restBase(databaseId);
  let pageToken = '';
  const ids = [];
  do {
    const body = { pageSize: 1000 };
    if (pageToken) body.pageToken = pageToken;
    if (readTime) body.readTime = readTime;
    const result = await requestJson(`${parent}:listCollectionIds`, token, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    ids.push(...(result.collectionIds || []));
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return ids.sort();
}

async function listDocuments({ databaseId, parentPath = '', collectionId, readTime, token }) {
  const parent = parentPath
    ? `${restBase(databaseId)}/${encodeDocumentPath(parentPath)}`
    : restBase(databaseId);
  let pageToken = '';
  const documents = [];
  do {
    const params = new URLSearchParams({ pageSize: '1000', orderBy: '__name__' });
    if (pageToken) params.set('pageToken', pageToken);
    if (readTime) params.set('readTime', readTime);
    const url = `${parent}/${encodeURIComponent(collectionId)}?${params.toString()}`;
    const result = await requestJson(url, token);
    documents.push(...(result.documents || []));
    if (documents.length > MAX_DOCUMENTS) {
      throw new Error(`Restore validator excedio el limite de ${MAX_DOCUMENTS} documentos.`);
    }
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return documents;
}

function relativeDocumentPath(databaseId, name) {
  const prefix = `${databaseRoot(databaseId)}/`;
  if (!String(name).startsWith(prefix)) {
    throw new Error('Firestore devolvio un document name fuera de la base esperada.');
  }
  return String(name).slice(prefix.length);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, stable(child)])
  );
}

function digestFields(fields) {
  return createHash('sha256')
    .update(JSON.stringify(stable(fields || {})))
    .digest('hex');
}

async function inventoryDatabase({ databaseId, readTime, token }) {
  const inventory = new Map();

  async function walk(parentPath = '') {
    const collectionIds = await listCollectionIds({ databaseId, parentPath, readTime, token });
    for (const collectionId of collectionIds) {
      const docs = await listDocuments({ databaseId, parentPath, collectionId, readTime, token });
      for (const doc of docs) {
        const path = relativeDocumentPath(databaseId, doc.name);
        inventory.set(path, digestFields(doc.fields));
        if (inventory.size > MAX_DOCUMENTS) {
          throw new Error(`Restore validator excedio el limite de ${MAX_DOCUMENTS} documentos.`);
        }
        await walk(path);
      }
    }
  }

  await walk();
  return inventory;
}

function compareInventories(source, destination) {
  const sourcePaths = [...source.keys()].sort();
  const destinationPaths = [...destination.keys()].sort();
  const missing = sourcePaths.filter((path) => !destination.has(path));
  const extra = destinationPaths.filter((path) => !source.has(path));
  const changed = sourcePaths.filter(
    (path) => destination.has(path) && source.get(path) !== destination.get(path)
  );
  return { sourcePaths, destinationPaths, missing, extra, changed };
}

const destinationDb = assertDatabaseId(option('--destination-db'));
const sourceReadTime = assertReadTime(option('--source-read-time'));
const token = accessToken();

const source = await inventoryDatabase({
  databaseId: SOURCE_DB,
  readTime: sourceReadTime,
  token,
});
const destination = await inventoryDatabase({
  databaseId: destinationDb,
  readTime: '',
  token,
});
const comparison = compareInventories(source, destination);
const passed =
  comparison.missing.length === 0
  && comparison.extra.length === 0
  && comparison.changed.length === 0;

console.log(JSON.stringify({
  collectedAtUtc: new Date().toISOString(),
  project: PROJECT,
  sourceDatabase: SOURCE_DB,
  sourceReadTime,
  destinationDatabase: destinationDb,
  sourceDocumentCount: comparison.sourcePaths.length,
  destinationDocumentCount: comparison.destinationPaths.length,
  missingDocumentCount: comparison.missing.length,
  extraDocumentCount: comparison.extra.length,
  changedDocumentCount: comparison.changed.length,
  sampleMissingPaths: comparison.missing.slice(0, 20),
  sampleExtraPaths: comparison.extra.slice(0, 20),
  sampleChangedPaths: comparison.changed.slice(0, 20),
  comparesFieldContentBySha256: true,
  exposesDocumentContent: false,
  mutatesCloud: false,
  touchesProduction: false,
  passed,
}, null, 2));

if (!passed) process.exit(2);
