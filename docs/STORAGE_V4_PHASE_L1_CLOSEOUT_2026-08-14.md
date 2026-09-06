# Atlas Storage v4 — Phase L1 closeout

Fecha: **2026-08-14**

Target:

```text
project: atlasmap-prod
Firestore: (default)
location: us-central1
```

## Decisión

**Phase L1 — seguridad/datos: CLOSED / PASS productivo fail-closed.**

L1 no abre todavía las reglas funcionales v4. Producción queda deliberadamente cerrada a cliente mientras los contratos funcionales ya probados en Emulator esperan los gates L4 (READ) y L6 (WRITE).

## Evidencia productiva

### Preflight

PASS:

- proyecto ACTIVE;
- billing enabled;
- Firestore Standard/Native en `us-central1`;
- delete protection enabled;
- 0 colecciones top-level;
- 0 Web Apps antes del bootstrap.

### Firestore Rules

PASS:

```text
allow read, write: if false;
```

El source activo fue verificado server-side.

### Web App

PASS:

- exactamente 1 Web App activa: `AtlasMap Web Production`;
- SDK config corresponde a `atlasmap-prod`;
- no se imprimió API key;
- no se escribió `.env` automáticamente.

### Authentication

PASS:

- Google Sign-In enabled;
- OAuth client + secret presentes server-side;
- email/password disabled;
- anonymous disabled;
- phone disabled;
- `localhost` no autorizado.

## Contratos funcionales ya probados antes del rollout

Las suites Emulator de v4 prueban, entre otros:

- aislamiento por UID con dos usuarios (`alice`/`bob`) y visitante sin sesión;
- ownership por ruta `users/{uid}`;
- versionado monotónico y rechazo de stale writes;
- server timestamps requeridos mediante `request.time`;
- shape allowlist y límites de longitud/tamaño de campos;
- bloqueo de hard delete desde cliente;
- tombstones de entidades;
- agregados protegidos contra falsificación cliente;
- colecciones internas de agregados, migración, purge y lifecycle bloqueadas al cliente;
- referencias Google Places sin copiar payload dinámico del proveedor.

Los índices actualmente declarados son mínimos: no existen composite indexes adicionales y solo se declara el índice collection-group necesario para `__tripPurgeJobs.dueAt`.

## Límites deliberados

L1 **no** declara que la aplicación productiva ya pueda leer/escribir Firestore. Eso sería incorrecto: las Rules activas siguen siendo deny-all.

Pendiente para gates posteriores:

- dominio productivo real + login E2E desde ese dominio;
- App Check (L3);
- Rules READ controladas (L4);
- Rules WRITE controladas (L6);
- Functions/Eventarc/Remote Config productivos en sus gates correspondientes.

## Evidencia relacionada

- `docs/STORAGE_V4_PHASE_L1_PREFLIGHT_2026-08-14.md`
- `docs/STORAGE_V4_PHASE_L1_RULES_LOCK_2026-08-14.md`
- `docs/STORAGE_V4_PHASE_L1_WEB_APP_2026-08-14.md`
- `docs/STORAGE_V4_PHASE_L1_GOOGLE_AUTH_2026-08-14.md`

## Siguiente gate

**L2 — recovery + costo**:

1. PITR;
2. scheduled backups + retención;
3. restore drill aislado;
4. budget productivo;
5. observabilidad/alertas de costo/errores/latencia;
6. baseline/forecast de costo con supuestos explícitos.
