import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const SRC_ROOT = resolve('src');
const WRAPPER_PATH = 'src/infrastructure/firebase/callableFunctions.js';
const SYNC_TELEMETRY_PATH = 'src/infrastructure/firebase/v4SyncTelemetryClient.js';
const SOURCE_EXTENSIONS = /\.(?:js|jsx|mjs|ts|tsx)$/i;

function listSourceFiles(root) {
  return readdirSync(root).flatMap((entry) => {
    const fullPath = resolve(root, entry);
    if (statSync(fullPath).isDirectory()) return listSourceFiles(fullPath);
    return SOURCE_EXTENSIONS.test(fullPath) ? [fullPath] : [];
  });
}

function repoPath(file) {
  return relative(resolve('.'), file).replaceAll('\\', '/');
}

function sourceRecords() {
  return listSourceFiles(SRC_ROOT).map((file) => Object.freeze({
    path: repoPath(file),
    source: readFileSync(file, 'utf8'),
  }));
}

test('firebase/functions y httpsCallable sólo aparecen en el wrapper central', () => {
  const records = sourceRecords();
  const functionsImports = records
    .filter(({ source }) => /from\s+['"]firebase\/functions['"]|require\(['"]firebase\/functions['"]\)/.test(source))
    .map(({ path }) => path);
  const httpsCallableUsers = records
    .filter(({ source }) => /\bhttpsCallable\b/.test(source))
    .map(({ path }) => path);

  assert.deepEqual(functionsImports, [WRAPPER_PATH]);
  assert.deepEqual(httpsCallableUsers, [WRAPPER_PATH]);
});

test('frontend no llama endpoints callable manualmente ni construye headers App Check a mano', () => {
  const records = sourceRecords();
  const manualCallableUrls = records
    .filter(({ source }) => /cloudfunctions\.net|run\.app\/.+\b(?:geoapify|googlePlace|storageV4)/i.test(source))
    .map(({ path }) => path);
  const manualAppCheckHeaders = records
    .filter(({ source }) => /x-firebase-appcheck/i.test(source))
    .map(({ path }) => path);

  assert.deepEqual(manualCallableUrls, []);
  assert.deepEqual(manualAppCheckHeaders, []);
});

test('el wrapper central conserva la semántica factory de getFunctions + httpsCallable', () => {
  const records = sourceRecords();
  const wrapper = records.find(({ path }) => path === WRAPPER_PATH);
  assert.ok(wrapper, `Falta ${WRAPPER_PATH}`);
  assert.match(wrapper.source, /\bgetFunctions\b/);
  assert.match(wrapper.source, /\bhttpsCallable\b/);
  assert.match(wrapper.source, /const functions = getFunctions\(app, config\.geoapify\.functionRegion\);/);
  assert.match(wrapper.source, /return httpsCallable\(functions, name\);/);

  const consumers = records
    .filter(({ path, source }) => (
      path !== WRAPPER_PATH
      && /\bfirebaseCallable\b/.test(source)
    ))
    .map(({ path }) => path);

  assert.ok(consumers.length > 0, 'No se observó ningún consumidor real de firebaseCallable fuera del wrapper.');
});

test('firebaseCallable se invoca como factory de un argumento y sync telemetry ejecuta el callable resultante', () => {
  const records = sourceRecords();
  const multiArgumentCalls = records
    .filter(({ path, source }) => (
      path !== WRAPPER_PATH
      && /firebaseCallable\([^()\n]*,\s*[^)\n]+\)/.test(source)
    ))
    .map(({ path }) => path);
  assert.deepEqual(multiArgumentCalls, []);

  const client = records.find((record) => record.path === SYNC_TELEMETRY_PATH);
  assert.ok(client, `Falta ${SYNC_TELEMETRY_PATH}`);
  assert.match(client.source, /const callable = firebaseCallable\(FUNCTION_NAME\);/);
  assert.match(client.source, /await callable\(\{ events \}\);/);
});
