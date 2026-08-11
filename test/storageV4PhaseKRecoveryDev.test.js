import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const scriptPath = new URL('../scripts/storage-v4-phase-k-recovery-dev.ps1', import.meta.url);

test('recovery dev esta bloqueado a atlasmap-dev y requiere Apply', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(source, /\$Project -ne 'atlasmap-dev'/);
  assert.match(source, /\[switch\]\$Apply/);
  assert.match(source, /if \(-not \$Apply\)/);
  assert.match(source, /applyRequested = \[bool\]\$Apply/);
});

test('recovery dev habilita PITR y crea backup solo cuando hace falta', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(source, /POINT_IN_TIME_RECOVERY_ENABLED/);
  assert.match(source, /\$needsBackupSchedule = @\(\$before\.schedules\)\.Count -eq 0/);
  assert.match(source, /'firestore', 'databases', 'update'/);
  assert.match(source, /'--enable-pitr'/);
  assert.match(source, /'firestore', 'backups', 'schedules', 'create'/);
  assert.match(source, /"--retention=\$BackupRetention"/);
  assert.match(source, /"--recurrence=\$Recurrence"/);
});

test('recovery dev no contiene operaciones de delete ni toca produccion', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.doesNotMatch(source, /firestore['\", ]+databases['\", ]+delete/i);
  assert.doesNotMatch(source, /backups['\", ]+schedules['\", ]+delete/i);
  assert.doesNotMatch(source, /atlasmap-prod|production|prod-project/i);
});
