import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contractPath = new globalThis.URL('../server/openapi.yaml', import.meta.url);

async function contract() {
  return readFile(contractPath, 'utf8');
}

test('contrato API incluye autenticación y aislamiento por sesión', async () => {
  const source = await contract();
  assert.match(source, /sessionCookie:/);
  assert.match(source, /name: atlas_session/);
  assert.match(source, /\/auth\/session:/);
  assert.match(source, /\/auth\/logout:/);
});

test('contrato API define CRUD, paginación y sincronización incremental', async () => {
  const source = await contract();
  assert.match(source, /\/trips:/);
  assert.match(source, /\/trips\/\{tripId\}:/);
  assert.match(source, /updated_after/);
  assert.match(source, /nextCursor/);
});

test('contrato API exige control de concurrencia para evitar sobrescrituras', async () => {
  const source = await contract();
  assert.match(source, /name: If-Match/);
  assert.match(source, /ETag:/);
  assert.match(source, /trip_version_conflict/);
  assert.match(source, /'409':/);
});

test('contrato API limita geocodificación y colecciones grandes', async () => {
  const source = await contract();
  assert.match(source, /\/geocode:/);
  assert.match(source, /maximum: 10/);
  assert.match(source, /maxItems: 500/);
  assert.match(source, /'429':/);
});
