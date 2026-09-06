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
const citySource = readFileSync(resolve('functions/geoapifyCityFunctions.js'), 'utf8');
const countryPlaceIdsSource = readFileSync(resolve('functions/googleCountryPlaceIdsFunction.js'), 'utf8');

test('manifest fija los 17 callables públicos v4-only en us-central1', () => {
  assert.equal(CALLABLE_FUNCTIONS_REGION, 'us-central1');
  assert.equal(CALLABLE_FUNCTIONS.length, 17);
  assert.equal(new Set(CALLABLE_FUNCTION_NAMES).size, 17);
  assert.ok(!CALLABLE_FUNCTION_NAMES.includes('storageV4RolloutTelemetry'));
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

test('política central conserva default global, opt-out explícito por callable y replay protection apagado', () => {
  assert.match(policySource, /process\.env\.ENFORCE_APP_CHECK/);
  assert.match(policySource, /parseAppCheckEnforcementEnv/);
  assert.doesNotMatch(policySource, /defineBoolean/);
  assert.match(policySource, /Object\.hasOwn\(safeOverrides, 'enforceAppCheck'\)/);
  assert.match(policySource, /safeOverrides\.enforceAppCheck === true/);
  assert.match(policySource, /:\s*ENFORCE_APP_CHECK;/);
  assert.match(policySource, /\benforceAppCheck,/);
  assert.match(policySource, /consumeAppCheckToken:\s*false/);
  assert.doesNotMatch(policySource, /consumeAppCheckToken:\s*true/);
});

test('callables públicos usados desde localhost conservan opt-out explícito de App Check', () => {
  assert.match(
    citySource,
    /geoapifyCityAutocomplete = onCall\([\s\S]*?callableOptions\(\{[\s\S]*?enforceAppCheck:\s*false[\s\S]*?\}\)/
  );
  assert.match(
    countryPlaceIdsSource,
    /googleCountryPlaceIds = onCall\([\s\S]*?callableOptions\(\{[\s\S]*?enforceAppCheck:\s*false[\s\S]*?\}\)/
  );
});

test('probe HTTP de resiliencia queda explícitamente fuera del manifest callable', () => {
  const probeSource = readFileSync(resolve('functions/v4ProviderOutageProbeFunction.js'), 'utf8');
  assert.match(probeSource, /\bonRequest\b/);
  assert.doesNotMatch(probeSource, /\bonCall\b/);
  assert.ok(!CALLABLE_FUNCTION_NAMES.includes('storageV4ProviderOutageProbe'));
});
