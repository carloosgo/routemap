import { readFile, writeFile } from 'node:fs/promises';
import { stdout } from 'node:process';
import { URL } from 'node:url';
import { composePhaseKE2ERules } from './firestorePhaseKE2ERules.mjs';

const v3Path = new URL('../firestore.rules', import.meta.url);
const v4Path = new URL('../firestore-v4.rules', import.meta.url);
const targetPath = new URL('../firestore-phase-k-e2e.rules', import.meta.url);

const [v3Rules, v4Rules] = await Promise.all([
  readFile(v3Path, 'utf8'),
  readFile(v4Path, 'utf8'),
]);
const composed = composePhaseKE2ERules(v3Rules, v4Rules);
await writeFile(targetPath, composed, 'utf8');
stdout.write('Generated firestore-phase-k-e2e.rules with v4 writes scoped to phase-k-e2e-* trips.\n');
