/* global process */
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export const PROJECT = 'atlasmap-dev';
export const CONFIRMATION = 'RUN-ATLAS-V4-PHASE-K-CLOUD-LOAD-DEV';

const SHAPE = Object.freeze({
  segments: 20,
  places: 40,
  connections: 20,
  notes: 20,
  checklist: 20,
});
const HYDRATE_SAMPLES = 10;
const RECONNECT_WRITES = SHAPE.segments + SHAPE.places;
const RECONNECT_WINDOW_MS = 5_000;
const AGGREGATE_TIMEOUT_MS = 90_000;

function argValue(args, name) {
  const prefix = `${name}=`;
  const matches = args.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) throw new TypeError(`${name} no puede repetirse.`);
  return matches.length ? matches[0].slice(prefix.length).trim() : '';
}

function parseArgs(args = []) {
  const allowed = new Set(['--apply']);
  for (const value of args) {
    if (allowed.has(value) || value.startsWith('--confirm=')) continue;
    throw new TypeError(`Argumento desconocido: ${value}`);
  }
  const apply = args.includes('--apply');
  const confirm = argValue(args, '--confirm');
  if (!apply && confirm) throw new TypeError('--confirm solo se usa con --apply.');
  if (apply && confirm !== CONFIRMATION) {
    throw new TypeError(`--apply exige --confirm=${CONFIRMATION}.`);
  }
  return { apply };
}

function adminDb() {
  const existing = getApps().find((app) => app.name === '[DEFAULT]');
  const app = existing || initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT,
  });
  if (app.options?.projectId && app.options.projectId !== PROJECT) {
    throw new Error(`Firebase Admin apunta a ${app.options.projectId}, no a ${PROJECT}.`);
  }
  return getFirestore(app);
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, index)]);
}

function latencySummary(values) {
  return {
    samples: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: values.length ? Math.round(Math.max(...values)) : null,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deterministicDelay(index, total, windowMs) {
  if (total <= 1) return 0;
  const mixed = Math.imul(index + 1, 2654435761) >>> 0;
  const unit = mixed / 0x100000000;
  return Math.floor(unit * windowMs);
}

function baseEntity(id, rank, now) {
  return {
    id,
    rank,
    status: 'active',
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function rank(index) {
  return String(index + 1).padStart(10, '0');
}

async function writeFixture(db, tripRef, now) {
  const writer = db.bulkWriter();
  let writes = 0;

  for (let index = 0; index < SHAPE.segments; index += 1) {
    const id = `segment-${String(index + 1).padStart(3, '0')}`;
    writer.set(tripRef.collection('segments').doc(id), {
      ...baseEntity(id, rank(index), now),
      origin: { label: `Origin ${index + 1}` },
      destination: { label: `Destination ${index + 1}` },
      startDate: null,
      endDate: null,
      expenses: { lodging: 1 },
      note: '',
    });
    writes += 1;
  }

  for (let index = 0; index < SHAPE.places; index += 1) {
    const id = `place-${String(index + 1).padStart(3, '0')}`;
    writer.set(tripRef.collection('places').doc(id), {
      ...baseEntity(id, rank(index), now),
      provider: 'synthetic',
      googlePlaceId: null,
      userLabel: `Load place ${index + 1}`,
    });
    writes += 1;
  }

  for (let index = 0; index < SHAPE.connections; index += 1) {
    const id = `connection-${String(index + 1).padStart(3, '0')}`;
    writer.set(tripRef.collection('connections').doc(id), {
      ...baseEntity(id, rank(index), now),
      fromPlaceId: `place-${String((index % SHAPE.places) + 1).padStart(3, '0')}`,
      toPlaceId: `place-${String(((index + 1) % SHAPE.places) + 1).padStart(3, '0')}`,
      mode: 'walk',
      visible: true,
    });
    writes += 1;
  }

  for (let index = 0; index < SHAPE.notes; index += 1) {
    const id = `note-${String(index + 1).padStart(3, '0')}`;
    writer.set(tripRef.collection('notes').doc(id), {
      ...baseEntity(id, rank(index), now),
      title: `Load note ${index + 1}`,
      text: 'Synthetic Phase K cloud-load fixture.',
    });
    writes += 1;
  }

  for (let index = 0; index < SHAPE.checklist; index += 1) {
    const id = `check-${String(index + 1).padStart(3, '0')}`;
    writer.set(tripRef.collection('checklist').doc(id), {
      ...baseEntity(id, rank(index), now),
      text: `Load item ${index + 1}`,
      done: false,
    });
    writes += 1;
  }

  await writer.close();
  return writes;
}

async function waitForAggregates(tripRef, expected, timeoutMs = AGGREGATE_TIMEOUT_MS) {
  const started = performance.now();
  let last = null;
  while (performance.now() - started < timeoutMs) {
    const snapshot = await tripRef.get();
    if (!snapshot.exists) throw new Error('El fixture desapareció durante aggregate convergence.');
    const data = snapshot.data();
    last = {
      segmentCount: Number(data.segmentCount) || 0,
      placeCount: Number(data.placeCount) || 0,
      total: Number(data.total) || 0,
    };
    if (
      last.segmentCount === expected.segmentCount
      && last.placeCount === expected.placeCount
      && last.total === expected.total
    ) {
      return { elapsedMs: Math.round(performance.now() - started), ...last };
    }
    await delay(500);
  }
  throw new Error(`Aggregate convergence timeout: ${JSON.stringify(last)}`);
}

async function hydrateOnce(tripRef) {
  const started = performance.now();
  const [root, ...collections] = await Promise.all([
    tripRef.get(),
    ...Object.keys(SHAPE).map((name) => tripRef.collection(name).get()),
  ]);
  if (!root.exists) throw new Error('Hydrate no encontró root.');
  const count = collections.reduce((sum, snapshot) => sum + snapshot.size, 0);
  return { durationMs: performance.now() - started, childCount: count };
}

async function reconnectBurst(tripRef) {
  const targets = [
    ...Array.from({ length: SHAPE.segments }, (_, index) => ({
      ref: tripRef.collection('segments').doc(`segment-${String(index + 1).padStart(3, '0')}`),
      patch: { version: 2, updatedAt: Timestamp.now(), expenses: { lodging: 2 } },
    })),
    ...Array.from({ length: SHAPE.places }, (_, index) => ({
      ref: tripRef.collection('places').doc(`place-${String(index + 1).padStart(3, '0')}`),
      patch: { version: 2, updatedAt: Timestamp.now(), userLabel: `Reconnected place ${index + 1}` },
    })),
  ];

  const latencies = [];
  const failures = [];
  const started = performance.now();
  await Promise.all(targets.map(async (target, index) => {
    await delay(deterministicDelay(index, targets.length, RECONNECT_WINDOW_MS));
    const writeStarted = performance.now();
    try {
      await target.ref.update(target.patch);
      latencies.push(performance.now() - writeStarted);
    } catch (error) {
      failures.push({ name: error?.name || 'Error', code: error?.code || '' });
    }
  }));

  return {
    elapsedMs: Math.round(performance.now() - started),
    attempted: targets.length,
    success: latencies.length,
    failed: failures.length,
    failures: failures.slice(0, 5),
    latencyMs: latencySummary(latencies),
  };
}

export async function runV4PhaseKCloudLoadDev({ args = process.argv.slice(2), db = null } = {}) {
  const options = parseArgs(args);
  const plannedChildren = Object.values(SHAPE).reduce((sum, value) => sum + value, 0);
  console.log(JSON.stringify({
    project: PROJECT,
    mode: options.apply ? 'apply' : 'dry-run',
    fixtureShape: SHAPE,
    plannedChildren,
    hydrateSamples: HYDRATE_SAMPLES,
    reconnectWrites: RECONNECT_WRITES,
    reconnectWindowMs: RECONNECT_WINDOW_MS,
    usesSyntheticFixtureOnly: true,
    cleansUpFixture: true,
    mutatesProduction: false,
  }, null, 2));

  if (!options.apply) return;

  const firestore = db || adminDb();
  const fixtureUid = 'atlas-phase-k-load';
  const tripId = `load-${randomUUID()}`;
  const tripRef = firestore.doc(`users/${fixtureUid}/trips/${tripId}`);
  const now = Timestamp.now();
  let cleanupCompleted = false;

  try {
    await tripRef.set({
      id: tripId,
      name: 'ATLAS PHASE K CLOUD LOAD',
      currency: 'USD',
      schemaVersion: 4,
      status: 'active',
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      purgeAfter: null,
      segmentCount: 0,
      placeCount: 0,
      total: 0,
    });

    const createStarted = performance.now();
    const createdChildren = await writeFixture(firestore, tripRef, now);
    const createElapsedMs = Math.round(performance.now() - createStarted);

    const createAggregates = await waitForAggregates(tripRef, {
      segmentCount: SHAPE.segments,
      placeCount: SHAPE.places,
      total: SHAPE.segments,
    });

    const hydrateLatencies = [];
    let hydratedChildren = null;
    for (let sample = 0; sample < HYDRATE_SAMPLES; sample += 1) {
      const hydrated = await hydrateOnce(tripRef);
      hydrateLatencies.push(hydrated.durationMs);
      hydratedChildren = hydrated.childCount;
    }
    if (hydratedChildren !== plannedChildren) {
      throw new Error(`Hydrate esperaba ${plannedChildren} children y leyó ${hydratedChildren}.`);
    }

    const reconnect = await reconnectBurst(tripRef);
    if (reconnect.failed !== 0 || reconnect.success !== RECONNECT_WRITES) {
      throw new Error(`Reconnect burst incompleto: ${JSON.stringify(reconnect)}`);
    }

    const reconnectAggregates = await waitForAggregates(tripRef, {
      segmentCount: SHAPE.segments,
      placeCount: SHAPE.places,
      total: SHAPE.segments * 2,
    });

    await firestore.recursiveDelete(tripRef);
    cleanupCompleted = !(await tripRef.get()).exists;
    if (!cleanupCompleted) throw new Error('Cleanup del fixture no eliminó el root.');

    console.log(JSON.stringify({
      project: PROJECT,
      pass: true,
      fixture: {
        rootWrites: 1,
        childCreates: createdChildren,
        childUpdates: reconnect.attempted,
        hydratedChildren,
        cleanupCompleted,
      },
      create: {
        elapsedMs: createElapsedMs,
        aggregateConvergenceMs: createAggregates.elapsedMs,
      },
      hydrate: latencySummary(hydrateLatencies),
      reconnect,
      reconnectAggregateConvergenceMs: reconnectAggregates.elapsedMs,
      eventarcAggregateState: {
        segmentCount: reconnectAggregates.segmentCount,
        placeCount: reconnectAggregates.placeCount,
        total: reconnectAggregates.total,
      },
      productionMutated: false,
    }, null, 2));
  } finally {
    if (!cleanupCompleted) {
      await firestore.recursiveDelete(tripRef).catch(() => {});
    }
  }
}

runV4PhaseKCloudLoadDev().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
