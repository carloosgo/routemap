import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

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

const translatedCharacter = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
const hardcodedAttribute = new RegExp(
  `\\b(?:aria-label|placeholder|title)=(['"])(?=[^'"\\n]*[${translatedCharacter}])[^'"\\n]*\\1`,
  'g'
);
const hardcodedTextNode = new RegExp(
  `>\\s*([${translatedCharacter}][^<>{}\\n]*?)\\s*<(?=\\/)`,
  'g'
);
const hardcodedStringExpression = new RegExp(
  `\\{\\s*(['"])(?=[^'"\\n]*[${translatedCharacter}])[^'"\\n]*\\1\\s*\\}`,
  'g'
);
const hardcodedUiCall = new RegExp(
  `\\b(?:showToast|alert|confirm)\\(\\s*(['"])(?=[^'"\\n]*[${translatedCharacter}])[^'"\\n]*\\1`,
  'g'
);
const hardcodedDomText = new RegExp(
  `\\b(?:textContent|innerText|placeholder|ariaLabel|title)\\s*=\\s*(['"])(?=[^'"\\n]*[${translatedCharacter}])[^'"\\n]*\\1`,
  'g'
);

const staleUiPhrases = [
  'El viaje guardado ya no existe.',
  'No fue posible abrir el viaje.',
  'Más opciones',
  'Buscar hotel, restaurante, estación…',
  'Buscar lugares',
  'Cerrar búsqueda y quitar resultados',
  'Buscando sugerencias…',
  'No fue posible buscar lugares.',
  'Error de búsqueda',
  'Lugar guardado',
  'Este lugar ya está guardado.',
  '¿Guardar lugar para tu ruta?',
  'Sin ciudad',
  'Sin país',
  'dd/mm/aaaa',
  'mm/dd/yyyy',
  'Notas generales',
  'Nueva nota',
];
const legacyMigrationPhrases = new Set([
  'Notas generales',
  'Nueva nota',
]);

function isAllowedLegacyMigration(fileUrl, phrase) {
  return fileUrl.pathname.endsWith('/modules/trips/tripEntities.js')
    && legacyMigrationPhrases.has(phrase);
}

function collectMatches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[0]);
}

test('los atributos y nodos visibles de JSX no contienen texto traducible hardcodeado', async () => {
  const violations = [];
  for (const fileUrl of await sourceFiles(SOURCE_ROOT)) {
    if (fileUrl.pathname.includes('/i18n/')) continue;
    if (path.extname(fileUrl.pathname) !== '.jsx') continue;
    const source = await readFile(fileUrl, 'utf8');
    for (const match of [
      ...collectMatches(source, hardcodedAttribute),
      ...collectMatches(source, hardcodedTextNode),
      ...collectMatches(source, hardcodedStringExpression),
    ]) {
      violations.push(`${fileUrl.pathname}: ${match}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('toasts, diálogos y asignaciones DOM no usan textos literales visibles', async () => {
  const violations = [];
  for (const fileUrl of await sourceFiles(SOURCE_ROOT)) {
    if (fileUrl.pathname.includes('/i18n/')) continue;
    const source = await readFile(fileUrl, 'utf8');
    for (const match of [
      ...collectMatches(source, hardcodedUiCall),
      ...collectMatches(source, hardcodedDomText),
    ]) {
      violations.push(`${fileUrl.pathname}: ${match}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('los textos de sistema auditados solo viven en diccionarios o migraciones explícitas', async () => {
  const violations = [];
  for (const fileUrl of await sourceFiles(SOURCE_ROOT)) {
    if (fileUrl.pathname.includes('/i18n/')) continue;
    const source = await readFile(fileUrl, 'utf8');
    for (const phrase of staleUiPhrases) {
      if (source.includes(phrase) && !isAllowedLegacyMigration(fileUrl, phrase)) {
        violations.push(`${fileUrl.pathname}: ${phrase}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});
