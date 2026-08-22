# Gate G READ — validación técnica en desarrollo

Fecha: 2026-08-11

Proyecto validado: `atlasmap-dev`

Alcance: únicamente rollout Gate G en modo `read`. Este registro no autoriza `pilot`, escrituras v4, migración productiva ni cambios en producción.

## Resultado

**PASS técnico en desarrollo.**

Se comprobó una lectura real a través del repositorio híbrido y se devolvió Remote Config a fail-closed al terminar la prueba.

## Evidencia operacional

### Remote Config

Estado fail-closed verificado antes de la prueba:

```text
storage_v4_enabled            false
storage_v4_kill_switch        true
storage_v4_mode               off
storage_v4_cohort_percent     0
storage_v4_read_rules_ready   false
```

Se observó el canal Firebase Remote Config Realtime desde el cliente con respuestas HTTP 200 de `firebaseremoteconfigrealtime.googleapis.com` / `firebasestreamFetchInvalidations`.

### Telemetría

La callable `storageV4RolloutTelemetry` respondió correctamente con sesión autenticada y emitió únicamente métricas agregadas permitidas.

Ejemplo de control fuera de cohorte:

```text
operation: list
outcome: success
repositoryMode: v3
resultCount: 1
legacyCount: 1
v4Count: 0
```

La asignación de cohorte se verificó con el selector estable por UID definido en `rolloutPolicy.js`. El UID no se registró ni se incorporó a la telemetría.

Ejemplo de lectura dentro de cohorte:

```text
operation: get
outcome: success
repositoryMode: hybrid-read
resultSchema: legacy
found: true
durationMs: 217
```

Esto confirma que Gate G READ puede entrar en el repositorio híbrido sin modificar el dato legado leído.

### Rules candidatas READ

En `atlasmap-dev` se verificó con un viaje de prueba que las Rules candidatas permiten el flujo v3 existente durante la coexistencia:

- guardar viaje v3: PASS;
- recargar y listar el viaje: PASS;
- abrir el viaje: PASS;
- eliminar el viaje de prueba: PASS;
- recargar y confirmar ausencia: PASS.

No se usaron viajes reales para esta validación CRUD.

### Rollback / cierre

Al finalizar, Remote Config se devolvió a:

```text
storage_v4_enabled            false
storage_v4_kill_switch        true
storage_v4_mode               off
storage_v4_cohort_percent     0
storage_v4_read_rules_ready   false
```

Por tanto, el estado operativo esperado después de la validación es v3 fail-closed.

## Límites de este PASS

Este PASS demuestra el camino READ controlado en desarrollo. No demuestra todavía:

- rollout READ productivo;
- escritura v4 desde cliente;
- `pilot`;
- migración productiva v3 → v4;
- restore drill / PITR;
- App Check con enforcement;
- separación física de provider cache en `atlas-cache`;
- observabilidad y SLO productivos.

Cualquier avance posterior debe tratar esos puntos como checkpoints independientes.