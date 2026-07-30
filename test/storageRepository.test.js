import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../src/modules/storage/storageRepository.js';

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test('crea repositorio local con el contrato esperado', async () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = createMemoryStorage();
  try {
    const repository = createRepository({ driver: 'local', storageKey: 'atlas:test' });
    assert.equal(typeof repository.list, 'function');
    assert.equal(typeof repository.get, 'function');
    assert.equal(typeof repository.save, 'function');
    assert.equal(typeof repository.remove, 'function');
    assert.deepEqual(await repository.list(), []);
  } finally {
    globalThis.localStorage = previous;
  }
});

test('rechaza modo API sin URL base', () => {
  assert.throws(
    () => createRepository({ driver: 'api', apiBaseUrl: '   ' }),
    /VITE_API_BASE_URL es obligatoria/
  );
});

test('rechaza controladores de almacenamiento desconocidos', () => {
  assert.throws(
    () => createRepository({ driver: 'filesystem' }),
    /Controlador de almacenamiento no soportado/
  );
});
