import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PURE_MODULES = [
  'src/shared/utils.js',
  'src/app/appInteractionModel.js',
  'src/modules/trips/tripModel.js',
  'src/modules/expenses/expenseModel.js',
  'src/modules/storage/localStorageRepository.js',
  'src/modules/geocoding/citySearchCache.js',
  'src/modules/storage-v4/gateGRuntimeConfigModel.js',
];

const FORBIDDEN_IMPORTS = [
  /from\s+['"]react(?:\/[^'"]*)?['"]/,
  /from\s+['"]react-dom(?:\/[^'"]*)?['"]/,
  /from\s+['"][^'"]*App(?:\.jsx|\.css)?['"]/,
  /from\s+['"][^'"]*components\//,
  /import\s+['"][^'"]*\.(?:css|scss|sass|less)['"]/,
];

test('las capas puras no dependen de React, componentes ni estilos', async () => {
  for (const path of PURE_MODULES) {
    const source = await readFile(path, 'utf8');

    for (const forbidden of FORBIDDEN_IMPORTS) {
      assert.doesNotMatch(source, forbidden, `${path} viola el límite arquitectónico: ${forbidden}`);
    }
  }
});
