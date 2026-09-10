# Test contracts

La suite se organiza por el tipo de contrato que protege:

- `behavior/`: resultados e invariantes observables. Bloqueante.
- `architecture/`: guardrails estructurales intencionales. Bloqueante.
- `integration/`: interacción entre límites reales de módulos/proveedores/emuladores cuando corresponda. Bloqueante.
- `legacy-static/`: inspección frágil de implementación pendiente de migrar. Deuda visible.

Los archivos todavía ubicados directamente en `test/` son parte de la migración gradual. `npm run test:audit` los clasifica automáticamente para priorizar la conversión.

No se debe mover un test a `legacy-static` solo para hacer verde CI. Primero debe comprobarse que el fallo no representa un contrato funcional o arquitectónico real.
