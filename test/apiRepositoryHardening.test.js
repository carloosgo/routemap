import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiRepositoryError,
  createApiRepository,
} from '../src/modules/storage/apiRepository.js';

test('API repository exige una URL base válida', () => {
  assert.throws(() => createApiRepository('  '), /URL base válida/);
});

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

test('API repository acepta la respuesta paginada definida por OpenAPI', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { items: [{ id: 'trip-1', name: 'Europa', currency: 'eur', segments: [] }] };
    },
  });

  try {
    const repository = createApiRepository('https://api.example.com');
    const trips = await repository.list();
    assert.equal(trips.length, 1);
    assert.equal(trips[0].currency, 'EUR');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('API repository normaliza el viaje antes de enviarlo', async () => {
  const previousFetch = globalThis.fetch;
  let receivedBody;
  globalThis.fetch = async (_url, options) => {
    receivedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 201,
      async json() {
        return receivedBody;
      },
    };
  };

  try {
    const repository = createApiRepository('https://api.example.com');
    await repository.save({ id: 'trip-1', name: 'Prueba', currency: 'eur', segments: [] });
    assert.equal(receivedBody.currency, 'EUR');
    assert.ok(Array.isArray(receivedBody.notes));
    assert.ok(Array.isArray(receivedBody.checklist));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('API repository usa ETag para actualizar y eliminar sin sobrescribir cambios ajenos', async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  let etag = '"v1"';

  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    const method = options.method || 'GET';

    if (method === 'GET') {
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name.toLowerCase() === 'etag' ? etag : null) },
        async json() {
          return { id: 'trip-1', name: 'Prueba', segments: [] };
        },
      };
    }

    if (method === 'PUT') {
      etag = '"v2"';
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name.toLowerCase() === 'etag' ? etag : null) },
        async json() {
          return JSON.parse(options.body);
        },
      };
    }

    return { ok: true, status: 204, headers: { get: () => null } };
  };

  try {
    const repository = createApiRepository('https://api.example.com');
    const trip = await repository.get('trip-1');
    await repository.save({ ...trip, name: 'Actualizado' });
    await repository.remove('trip-1');

    assert.equal(requests[1].options.headers['If-Match'], '"v1"');
    assert.equal(requests[2].options.headers['If-Match'], '"v2"');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('API repository clasifica errores sin exponer el cuerpo del servidor', async () => {
  const previousFetch = globalThis.fetch;
  const cases = [
    [401, 'session_expired'],
    [409, 'trip_version_conflict'],
    [422, 'validation_failed'],
    [429, 'rate_limited'],
    [503, 'server_unavailable'],
  ];

  try {
    for (const [status, expectedCode] of cases) {
      globalThis.fetch = async () => ({
        ok: false,
        status,
        headers: {
          get: (name) => (name.toLowerCase() === 'retry-after' ? '30' : null),
        },
        async json() {
          return { internal: 'detalle privado' };
        },
      });

      const repository = createApiRepository('https://api.example.com');
      await assert.rejects(repository.list(), (error) => {
        assert.equal(error instanceof ApiRepositoryError, true);
        assert.equal(error.code, expectedCode);
        assert.equal(error.status, status);
        assert.doesNotMatch(error.message, /detalle privado/);
        if (status === 429) assert.equal(error.retryAfter, '30');
        return true;
      });
    }
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
        assert.equal(error.code, 'invalid_response');
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
