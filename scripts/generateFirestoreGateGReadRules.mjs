import { readFile, writeFile } from 'node:fs/promises';
import { composeGateGReadRules } from './firestoreGateGReadRules.mjs';

const sourcePath = new URL('../firestore.rules', import.meta.url);
const targetPath = new URL('../firestore-gate-g-read.rules', import.meta.url);

const source = await readFile(sourcePath, 'utf8');
const composed = composeGateGReadRules(source);
await writeFile(targetPath, composed, 'utf8');
console.log('Generated firestore-gate-g-read.rules from active v3 rules.');
