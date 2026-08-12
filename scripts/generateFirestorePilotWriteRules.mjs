/* global console */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composePilotWriteRules } from './firestorePilotWriteRules.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const outputPath = join(repoRoot, 'firestore-pilot-write.rules');
const [v3Rules, v4Rules] = await Promise.all([
  readFile(join(repoRoot, 'firestore.rules'), 'utf8'),
  readFile(join(repoRoot, 'firestore-v4.rules'), 'utf8'),
]);
const composed = composePilotWriteRules(v3Rules, v4Rules);
await writeFile(outputPath, composed, 'utf8');
console.log('Generated firestore-pilot-write.rules. No Cloud resources were modified.');
