function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function requireRepository(repository) {
  for (const method of ['list', 'get', 'save', 'remove']) {
    if (typeof repository?.[method] !== 'function') {
      throw new TypeError(`El repositorio observado requiere ${method}().`);
    }
  }
  return repository;
}

function classifyList(items) {
  const rows = Array.isArray(items) ? items : [];
  let v4Count = 0;
  let legacyCount = 0;
  for (const item of rows) {
    if (item?.schemaVersion === 4) v4Count += 1;
    else legacyCount += 1;
  }
  return { resultCount: rows.length, v4Count, legacyCount };
}

function classifyGet(item) {
  if (!item) return { found: false, resultSchema: 'none' };
  return {
    found: true,
    resultSchema: item.schemaVersion === 4 ? 'v4' : 'legacy',
  };
}

/**
 * Adds Gate G comparison telemetry without recording trip IDs, names, payloads
 * or mutation contents. The sink decides where metrics are ultimately sent.
 */
export function createObservedTripRepository({
  repository,
  repositoryMode,
  emit,
  now = () => Date.now(),
} = {}) {
  const target = requireRepository(repository);
  const mode = requiredText(repositoryMode, 'repositoryMode');
  if (typeof emit !== 'function') throw new TypeError('emit debe ser función.');
  if (typeof now !== 'function') throw new TypeError('now debe ser función.');

  async function observed(operation, run, summarize = () => ({})) {
    const startedAt = now();
    try {
      const result = await run();
      emit({
        operation,
        repositoryMode: mode,
        outcome: 'success',
        durationMs: Math.max(0, now() - startedAt),
        ...summarize(result),
      });
      return result;
    } catch (error) {
      emit({
        operation,
        repositoryMode: mode,
        outcome: 'error',
        durationMs: Math.max(0, now() - startedAt),
        errorCode: typeof error?.code === 'string' ? error.code : '',
      });
      throw error;
    }
  }

  return {
    list() {
      return observed('list', () => target.list(), classifyList);
    },
    get(id) {
      return observed('get', () => target.get(id), classifyGet);
    },
    save(trip) {
      return observed('save', () => target.save(trip));
    },
    remove(id) {
      return observed('remove', () => target.remove(id));
    },
  };
}
