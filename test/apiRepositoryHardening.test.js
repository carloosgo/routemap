import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiRepository } from '../src/modules/storage/apiRepository.js';

test('API repository rechaza identificadores vacíos antes de llamar fetch', async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('No debería ejecutarse');
  };

  try {
    const repository = createApiRepository('https://api.example.com');
    await assert.rejects(repository.get('  '), /identificador de viaje válido/);
    await assert.rejects(repository.remove(null), /identificador de viaje válido/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('API repository codifica el identificador y recorta espacios externos', async () => {
  const previousFetch = globalThis.fetch;
  let receivedUrl;
  globalThis.fetch = async (url) => {
    receivedUrl = url;
    return {
      ok: true,
      status: 200,
      async json() {
        return { id: 'viaje/1', name: 'Prueba', segments: [] };
      },
    };
  };

  try {
    const repository = createApiRepository(' https://api.example.com/// ');
    await repository.get(' viaje/1 ');
    assert.equal(receivedUrl, 'https://api.example.com/api/trips/viaje%2F1');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('API repository controla respuestas JSON inválidas', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      throw new SyntaxError('contenido interno inesperado');
    },
  });

  try {
    const repository = createApiRepository('https://api.example.com');
    await assert.rejects(
      repository.list(),
      (error) => {
        assert.match(error.message, /respuesta inválida/);
        assert.doesNotMatch(error.message, /contenido interno/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('API repository añade una señal de cancelación a cada solicitud', async () => {
  const previousFetch = globalThis.fetch;
  let receivedSignal;
  globalThis.fetch = async (_url, options) => {
    receivedSignal = options.signal;
    return {
      ok: true,
      status: 200,
      async json() {
        return [];
      },
    };
  };

  try {
    const repository = createApiRepository('https://api.example.com');
    await repository.list();
    assert.equal(receivedSignal instanceof globalThis.AbortSignal, true);
    assert.equal(receivedSignal.aborted, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
