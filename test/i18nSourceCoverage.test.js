import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import es from '../src/i18n/es.js';
import en from '../src/i18n/en.js';

const SOURCE_ROOT = new URL('../src/', import.meta.url);
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx']);

async function sourceFiles(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directoryUrl);
      if (entry.isDirectory()) return sourceFiles(child);
      return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [child] : [];
    })
  );
  return nested.flat();
}

function translationKeys(source) {
  return [...source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

test('cada clave t() usada por el frontend existe en español e inglés', async () => {
  const missing = [];
  for (const fileUrl of await sourceFiles(SOURCE_ROOT)) {
    const source = await readFile(fileUrl, 'utf8');
    for (const key of translationKeys(source)) {
      if (!Object.hasOwn(es, key) || !Object.hasOwn(en, key)) {
        missing.push(`${fileUrl.pathname}: ${key}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('los placeholders de traducción coinciden entre idiomas', () => {
  const placeholders = (value) =>
    [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();

  for (const key of Object.keys(es)) {
    assert.deepEqual(
      placeholders(en[key]),
      placeholders(es[key]),
      `${key} debe usar las mismas variables en ambos idiomas`
    );
  }
});
