# Gate G — READ rollout runbook

## Estado y alcance

Este runbook cubre exclusivamente Gate G en modo `read`.

Objetivo: permitir que una cohorte controlada use el repositorio híbrido para descubrir y leer viajes v2/v3/v4, manteniendo las escrituras de cliente en v3 y las escrituras directas v4 bloqueadas.

Fuera de alcance de este runbook:

- activar `pilot`;
- conectar el runtime de escritura v4;
- exportar/activar Functions administrativas v4;
- migrar viajes en producción;
- cambiar secretos;
- desplegar sin un checkpoint explícito de autorización.

## Estado fail-closed esperado

Antes de cualquier rollout, la build debe conservar estos valores:

```text
VITE_STORAGE_V4_ENABLED=false
VITE_STORAGE_V4_KILL_SWITCH=true
VITE_STORAGE_V4_MODE=off
VITE_STORAGE_V4_COHORT_PERCENT=0
VITE_STORAGE_V4_READ_RULES_READY=false
```

`firebase.json` debe continuar apuntando a `firestore.rules`.

`firebase.gate-g-read.json` debe apuntar a `firestore-gate-g-read.rules`.

El archivo `firestore-gate-g-read.rules` es generado a partir de las Rules v3 activas; no debe editarse manualmente como una segunda fuente de verdad.

## Bloqueo operativo antes de una cohorte productiva

Los flags `VITE_STORAGE_V4_*` son variables de Vite evaluadas en build time. Por tanto, el `killSwitch` actual es una barrera lógica fail-closed, pero NO es todavía un kill switch remoto que pueda modificarse instantáneamente en clientes ya publicados.

No activar una cohorte productiva mientras no se haya decidido explícitamente una de estas dos estrategias:

1. incorporar un mecanismo de configuración runtime/remoto para Gate G; o
2. aceptar formalmente que el rollback del cliente requiere publicar una nueva build y definir el SLO operativo correspondiente.

No asumir ni documentar el flag actual como apagado remoto instantáneo.

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

Si cualquiera de estas garantías falla en Emulator, detener el rollout.

## Preparación reproducible de Rules

Generar siempre el candidato inmediatamente antes de validarlo/desplegarlo:

```bash
npm run generate:rules:gate-g-read
```

No sustituir manualmente `firestore.rules` y no cambiar `firebase.json` para preparar READ.

El deploy candidato, cuando exista autorización expresa y el proyecto haya sido verificado, debe usar la configuración separada:

```bash
firebase --config firebase.gate-g-read.json deploy --only firestore:rules --project <verified-project-id>
```

Este comando es un checkpoint destructivo/remoto y NO forma parte de la preparación local automática.

## Secuencia de rollout READ

### 1. Rules

1. Confirmar HEAD y CI verde.
2. Generar `firestore-gate-g-read.rules`.
3. Ejecutar nuevamente Emulator/Rules sobre ese HEAD.
4. Verificar el proyecto Firebase objetivo.
5. Obtener autorización explícita.
6. Desplegar únicamente Firestore Rules mediante `firebase.gate-g-read.json`.
7. Verificar que v3 continúa operativo antes de modificar cualquier build cliente.

No avanzar si v3 presenta regresiones.

### 2. Build cliente READ

Solo después de confirmar Rules READ:

```text
VITE_STORAGE_V4_ENABLED=true
VITE_STORAGE_V4_KILL_SWITCH=false
VITE_STORAGE_V4_MODE=read
VITE_STORAGE_V4_READ_RULES_READY=true
VITE_STORAGE_V4_COHORT_PERCENT=<small-approved-percent>
```

Mantener `pilot` desactivado.

La cohorte se determina de manera estable por UID; no usar azar por dispositivo o sesión.

### 3. Cohorte inicial

Comenzar con una cohorte pequeña aprobada. No saltar directamente a 100%.

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

### Rollback del cliente

El primer objetivo es impedir que nuevos clientes entren o permanezcan en READ.

Configuración segura:

```text
VITE_STORAGE_V4_ENABLED=false
VITE_STORAGE_V4_KILL_SWITCH=true
VITE_STORAGE_V4_MODE=off
VITE_STORAGE_V4_COHORT_PERCENT=0
VITE_STORAGE_V4_READ_RULES_READY=false
```

Mientras estos flags sigan siendo build-time, aplicar este rollback exige publicar una nueva build. Esa limitación es el bloqueo operativo descrito arriba.

### Rollback de Rules

NO restaurar las Rules v3 mientras exista una build READ activa que todavía pueda intentar leer entidades v4. Hacerlo convertiría un rollback parcial en errores de autorización para esos clientes.

Una vez confirmado que el tráfico cliente READ está fuera, restaurar el ruleset v3 mediante la configuración normal:

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
- telemetría que incluya PII o contenido de viajes.

## Paso siguiente tras READ estable

Gate G `pilot` de escritura es un checkpoint separado. No se activa por haber completado READ.

Antes de `pilot` deben existir, como mínimo:

- decisión explícita sobre kill switch operativo;
- Rules de escritura v4 apropiadas;
- wiring autorizado del runtime v4;
- Functions/lifecycle necesarios desplegados y verificados;
- plan de migración y rollback aprobado;
- nueva ronda de tests y Emulator específica de escritura.
