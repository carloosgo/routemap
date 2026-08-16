import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CALLABLE_FUNCTION_NAMES,
  CALLABLE_FUNCTIONS,
  CALLABLE_FUNCTIONS_REGION,
} from '../functions/callableManifest.js';

const indexSource = readFileSync(resolve('functions/index.js'), 'utf8');
const policySource = readFileSync(resolve('functions/callablePolicy.js'), 'utf8');

test('manifest fija los 18 callables públicos en us-central1', () => {
  assert.equal(CALLABLE_FUNCTIONS_REGION, 'us-central1');
  assert.equal(CALLABLE_FUNCTIONS.length, 18);
  assert.equal(new Set(CALLABLE_FUNCTION_NAMES).size, 18);
  assert.ok(!CALLABLE_FUNCTION_NAMES.includes('storageV4ProviderOutageProbe'));
});

test('cada callable del manifest sigue exportado y definido con onCall + callableOptions', () => {
  for (const { name, file } of CALLABLE_FUNCTIONS) {
    assert.match(indexSource, new RegExp(`\\b${name}\\b`), `${name} debe seguir exportado desde functions/index.js`);
    const source = readFileSync(resolve('functions', file), 'utf8');
    assert.match(source, /from 'firebase-functions\/v2\/https'/, `${file} debe usar Functions v2 HTTPS`);
    assert.match(source, /\bonCall\b/, `${file} debe importar/usar onCall`);
    assert.match(
      source,
      new RegExp(`export const ${name} = onCall\\(`),
      `${name} debe seguir siendo callable`
    );
    assert.match(source, /callableOptions\(/, `${name} debe pasar por la política central`);
  }
});

test('política central conserva enforcement parametrizado y replay protection apagado', () => {
  assert.match(policySource, /ENFORCE_APP_CHECK = defineBoolean/);
  assert.match(policySource, /default:\s*false/);
  assert.match(policySource, /enforceAppCheck:\s*ENFORCE_APP_CHECK/);
  assert.match(policySource, /consumeAppCheckToken:\s*false/);
  assert.doesNotMatch(policySource, /consumeAppCheckToken:\s*true/);
});

test('probe HTTP de resiliencia queda explícitamente fuera del manifest callable', () => {
  const probeSource = readFileSync(resolve('functions/v4ProviderOutageProbeFunction.js'), 'utf8');
  assert.match(probeSource, /\bonRequest\b/);
  assert.doesNotMatch(probeSource, /\bonCall\b/);
  assert.ok(!CALLABLE_FUNCTION_NAMES.includes('storageV4ProviderOutageProbe'));
});
