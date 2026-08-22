# Gate G — READ rollout runbook

## Estado y alcance

Este runbook cubre exclusivamente Gate G en modo `read`.

Objetivo: permitir que una cohorte controlada use el repositorio híbrido para descubrir y leer viajes v2/v3/v4, manteniendo las escrituras de cliente en v3 y las escrituras directas v4 bloqueadas.

Fuera de alcance:

- activar `pilot`;
- conectar el runtime de escritura v4;
- exportar/activar Functions administrativas v4 distintas de la callable de telemetría READ;
- migrar viajes en producción;
- cambiar secretos;
- desplegar sin un checkpoint explícito de autorización.

## Estado fail-closed esperado

Las builds normales deben conservar:

```text
VITE_STORAGE_V4_ENABLED=false
VITE_STORAGE_V4_KILL_SWITCH=true
VITE_STORAGE_V4_MODE=off
VITE_STORAGE_V4_COHORT_PERCENT=0
VITE_STORAGE_V4_READ_RULES_READY=false
VITE_STORAGE_V4_REMOTE_CONFIG_ENABLED=false
VITE_STORAGE_V4_TELEMETRY_ENABLED=false
```

`firebase.json` debe continuar apuntando a `firestore.rules`.

`firebase.gate-g-read.json` debe apuntar a `firestore-gate-g-read.rules`.

El archivo `firestore-gate-g-read.rules` se genera a partir de las Rules v3 activas; no debe editarse manualmente como una segunda fuente de verdad.

## Kill switch operacional

Gate G READ dispone de un canal runtime opt-in mediante Firebase Remote Config.

Una build de rollout debe habilitar:

```text
VITE_STORAGE_V4_REMOTE_CONFIG_ENABLED=true
```

Hasta que Remote Config entregue un conjunto válido de parámetros, la aplicación permanece fail-closed en v3.

Si Remote Config no está disponible, no está soportado, falla el fetch, falla la activación o se produce un error en el listener realtime, la configuración vuelve a:

```text
enabled=false
killSwitch=true
mode=off
cohortPercent=0
readRulesReady=false
```

El modo remoto `pilot` no está aceptado por el modelo de Gate G READ; cualquier valor distinto de `read` se normaliza a `off`.

### Parámetros Remote Config

Crear exactamente estos parámetros en el proyecto Firebase objetivo:

```text
storage_v4_enabled            false
storage_v4_kill_switch        true
storage_v4_mode               off
storage_v4_cohort_percent     0
storage_v4_read_rules_ready   false
```

Los valores iniciales deben ser fail-closed.

Antes de depender del apagado remoto, verificar que la Firebase Remote Config Realtime API esté habilitada en el proyecto objetivo y hacer una prueba real de actualización realtime en una build de staging/desarrollo.

No activar una cohorte productiva si la actualización realtime no ha sido verificada.

## Telemetría de rollout

Gate G dispone de una callable candidata llamada `storageV4RolloutTelemetry` y de un buffer cliente best-effort.

La callable acepta únicamente métricas agregadas de operación, modo de repositorio, resultado, latencia, conteos y códigos de error acotados. El modelo rechaza campos desconocidos para impedir que entren IDs de viaje, UID, nombres, textos o payloads arbitrarios.

La callable no escribe las métricas en Firestore; emite logs estructurados para observabilidad.

El cliente mantiene la telemetría apagada con:

```text
VITE_STORAGE_V4_TELEMETRY_ENABLED=false
```

No habilitar ese flag hasta que `storageV4RolloutTelemetry` haya sido exportada deliberadamente desde `functions/index.js`, desplegada por separado y verificada. Mientras la callable permanezca sin exportar, el test de frontera debe seguir garantizando que un deploy general de Functions no la incluya accidentalmente.

Una vez verificada, una build de rollout puede usar:

```text
VITE_STORAGE_V4_TELEMETRY_ENABLED=true
```

El fallo del sink de métricas nunca debe bloquear ni convertir en error una operación del viaje.

## Prechecks obligatorios

Trabajar solo desde la rama autorizada y confirmar el HEAD esperado.

Ejecutar:

```bash
npm ci
npm ci --prefix functions
npm test
npm run generate:rules:gate-g-read
npm run test:rules
npm run lint
npm run build
```

Todos deben terminar en verde.

Además, los checks del commit deben estar verdes:

- Quality checks;
- CodeQL;
- Dependency audit.

Antes de cualquier comando Firebase remoto, verificar explícitamente el proyecto objetivo. No inferirlo por el nombre de la carpeta ni por una sesión previa de CLI.

## Qué garantiza el ruleset READ

El ruleset candidato debe conservar simultáneamente estas propiedades:

- las escrituras v3 existentes siguen funcionando;
- el dueño puede leer roots y entidades v4;
- otro usuario no puede leer esos datos;
- el cliente no puede crear ni actualizar directamente datos v4;
- las colecciones internas continúan cerradas al cliente;
- los viajes v2/v3/v4 pueden coexistir para un mismo usuario durante la ventana de rollout.

Si cualquiera falla en Emulator, detener el rollout.

## Preparación reproducible de Rules

Generar siempre el candidato inmediatamente antes de validarlo/desplegarlo:

```bash
npm run generate:rules:gate-g-read
```

No sustituir manualmente `firestore.rules` y no cambiar `firebase.json` para preparar READ.

El deploy candidato, cuando exista autorización expresa y el proyecto haya sido verificado, debe usar:

```bash
firebase --config firebase.gate-g-read.json deploy --only firestore:rules --project <verified-project-id>
```

Este comando es un checkpoint remoto y NO forma parte de la preparación automática.

## Secuencia de rollout READ

### 1. Preparar Remote Config en fail-closed

1. Verificar el proyecto Firebase objetivo.
2. Crear los cinco parámetros con los valores fail-closed indicados arriba.
3. Confirmar que la API realtime está habilitada.
4. Publicar una build no productiva con `VITE_STORAGE_V4_REMOTE_CONFIG_ENABLED=true` y todos los demás flags locales en OFF.
5. Verificar que la build arranca en v3.
6. Cambiar remotamente `storage_v4_kill_switch` y verificar que el cliente recibe la actualización realtime.
7. Volver a los valores fail-closed.

No seguir si esta prueba no funciona.

### 2. Preparar telemetría

1. Revisar nuevamente `v4RolloutTelemetryModel` y sus tests de privacidad.
2. Exportar `storageV4RolloutTelemetry` desde `functions/index.js` en un commit separado y explícito.
3. Ejecutar unit, lint, build y auditorías.
4. Verificar el proyecto Firebase objetivo.
5. Obtener autorización explícita.
6. Desplegar únicamente esa Function.
7. Invocarla con un usuario de prueba y confirmar logs estructurados sin PII.
8. Confirmar que un error deliberado del sink no afecta operaciones del viaje.

Solo después puede habilitarse `VITE_STORAGE_V4_TELEMETRY_ENABLED=true` en la build de rollout.

### 3. Rules READ

1. Confirmar HEAD y CI verde.
2. Generar `firestore-gate-g-read.rules`.
3. Ejecutar nuevamente Emulator/Rules.
4. Verificar el proyecto Firebase objetivo.
5. Obtener autorización explícita.
6. Desplegar únicamente Firestore Rules mediante `firebase.gate-g-read.json`.
7. Verificar que v3 continúa operativo.

No avanzar si v3 presenta regresiones.

### 4. Build cliente de rollout

La build candidata debe mantener el rollout local apagado y habilitar únicamente los canales operativos que ya hayan sido verificados:

```text
VITE_STORAGE_V4_ENABLED=false
VITE_STORAGE_V4_KILL_SWITCH=true
VITE_STORAGE_V4_MODE=off
VITE_STORAGE_V4_COHORT_PERCENT=0
VITE_STORAGE_V4_READ_RULES_READY=false
VITE_STORAGE_V4_REMOTE_CONFIG_ENABLED=true
VITE_STORAGE_V4_TELEMETRY_ENABLED=true
```

Si la callable de telemetría no se ha desplegado/verificado, mantener `VITE_STORAGE_V4_TELEMETRY_ENABLED=false`.

Esto evita que una build se active por sí sola; Remote Config es la autoridad operacional del rollout READ.

### 5. Activar cohorte remota

Solo después de confirmar Remote Config, telemetría, Rules READ y la build de rollout:

```text
storage_v4_enabled            true
storage_v4_kill_switch        false
storage_v4_mode               read
storage_v4_read_rules_ready   true
storage_v4_cohort_percent     <small-approved-percent>
```

Comenzar con una cohorte pequeña aprobada. No saltar directamente a 100%.

La cohorte se determina de manera estable por UID; no usar azar por dispositivo o sesión.

Durante la observación comparar como mínimo:

- latencia por operación y modo;
- tasa de éxito/error;
- errores de autorización/Rules;
- mix agregado de schemas leídos;
- incidencias de versión desconocida;
- regresiones en lectura/listado de viajes v2/v3;
- señales de reconexión/backoff anómalas.

La telemetría no debe incluir IDs de viaje, nombres ni contenido del usuario.

No ampliar la cohorte si la observación no es estable.

## Rollback

### Kill switch remoto inmediato

El primer rollback es publicar:

```text
storage_v4_enabled            false
storage_v4_kill_switch        true
storage_v4_mode               off
storage_v4_cohort_percent     0
storage_v4_read_rules_ready   false
```

La build de rollout debe recibir ese cambio mediante Remote Config realtime y volver a v3.

Verificar efectivamente el retorno a v3 antes de tocar Rules.

### Rollback de telemetría

La telemetría es independiente del modo READ. Ante problemas del sink, publicar una build con:

```text
VITE_STORAGE_V4_TELEMETRY_ENABLED=false
```

No es necesario alterar datos ni Rules para apagar telemetría.

### Rollback de build

Si Remote Config realtime presenta un incidente, publicar una build con:

```text
VITE_STORAGE_V4_REMOTE_CONFIG_ENABLED=false
VITE_STORAGE_V4_TELEMETRY_ENABLED=false
```

Los defaults locales mantienen Gate G en OFF.

### Rollback de Rules

NO restaurar las Rules v3 mientras exista una build READ activa que todavía pueda intentar leer entidades v4.

Una vez confirmado que el tráfico READ está fuera, restaurar el ruleset v3 mediante:

```bash
firebase --config firebase.json deploy --only firestore:rules --project <verified-project-id>
```

Después verificar lectura y escritura v3.

## Condiciones de parada inmediata

Detener la expansión de cohorte ante cualquiera de estas señales:

- incremento material de `permission-denied`;
- viajes que desaparecen del listado;
- diferencias entre lectura v3 y lectura híbrida;
- schema desconocido no esperado;
- errores de aislamiento por UID;
- aumento anormal de latencia o reintentos;
- cualquier escritura v4 directa desde el cliente;
- telemetría que incluya PII o contenido de viajes;
- pérdida del canal realtime de Remote Config durante una ventana de cambio.

## Paso siguiente tras READ estable

Gate G `pilot` de escritura es un checkpoint separado. No se activa por haber completado READ.

Antes de `pilot` deben existir, como mínimo:

- Rules de escritura v4 apropiadas;
- wiring autorizado del runtime v4;
- Functions/lifecycle necesarios desplegados y verificados;
- plan de migración y rollback aprobado;
- nueva ronda de tests y Emulator específica de escritura.
