import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TEMPLATE = new URL('./serviceWorkerTemplate.js', import.meta.url);

async function listFiles(root, dir = root) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(root, full);
    return [path.relative(root, full).split(path.sep).join('/')];
  }));
  return files.flat();
}

/** Lista de archivos de la app que el service worker guarda en el teléfono. */
export function precacheList(files) {
  const skip = new Set(['sw.js', 'robots.txt']);
  const paths = files
    .filter((file) => !skip.has(file) && !file.endsWith('.map'))
    .map((file) => (file === 'index.html' ? '/index.html' : `/${file}`));
  return ['/', ...paths.filter((file) => file !== '/')].sort();
}

/**
 * Plugin de Vite: al terminar el build escribe dist/sw.js con la lista de
 * archivos y una versión que cambia cuando cambia cualquier archivo.
 */
export function offlineServiceWorkerPlugin() {
  let outDir = 'dist';
  return {
    name: 'atlas-offline-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = await listFiles(outDir);
      const precache = precacheList(files);
      const hash = createHash('sha256');
      for (const file of files.filter((name) => name !== 'sw.js').sort()) {
        hash.update(file);
        hash.update(await readFile(path.join(outDir, file)));
      }
      const version = hash.digest('hex').slice(0, 12);
      const template = await readFile(TEMPLATE, 'utf8');
      const source = template
        .replace("const VERSION = '__ATLAS_VERSION__';", `const VERSION = '${version}';`)
        .replace('const PRECACHE = __ATLAS_PRECACHE__;', `const PRECACHE = ${JSON.stringify(precache, null, 2)};`);
      if (source.includes('const VERSION = \'__ATLAS_VERSION__\'') || !source.includes(version)) {
        throw new Error('No se pudo generar sw.js: la plantilla cambió.');
      }
      await writeFile(path.join(outDir, 'sw.js'), source);
    },
  };
}
