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

const hardcodedAttribute = /\b(?:aria-label|placeholder|title)=(['"])(?=[^'"\n]*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ])[^'"\n]*\1/g;
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
  'Notas generales',
  'Nueva nota',
];

test('los atributos visibles de JSX no contienen texto traducible hardcodeado', async () => {
  const violations = [];
  for (const fileUrl of await sourceFiles(SOURCE_ROOT)) {
    if (fileUrl.pathname.includes('/i18n/')) continue;
    const source = await readFile(fileUrl, 'utf8');
    if (path.extname(fileUrl.pathname) !== '.jsx') continue;
    for (const match of source.matchAll(hardcodedAttribute)) {
      violations.push(`${fileUrl.pathname}: ${match[0]}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('los textos de sistema auditados solo viven en los diccionarios', async () => {
  const violations = [];
  for (const fileUrl of await sourceFiles(SOURCE_ROOT)) {
    if (fileUrl.pathname.includes('/i18n/')) continue;
    const source = await readFile(fileUrl, 'utf8');
    for (const phrase of staleUiPhrases) {
      if (source.includes(phrase)) violations.push(`${fileUrl.pathname}: ${phrase}`);
    }
  }
  assert.deepEqual(violations, []);
});
