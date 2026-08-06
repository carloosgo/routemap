# Lista de preparación para producción

## Configuración y secretos

- [x] Mantener `GEOAPIFY_CITY_API_KEY` separado de `GEOAPIFY_API_KEY` en Secret Manager.
- [x] Evitar claves privadas de Geoapify en frontend y repositorio.
- [x] Ignorar `.env`, `.env.local` y `functions/.env*`.
- [ ] Restringir `VITE_GEOAPIFY_MAPS_API_KEY` a los dominios autorizados.
- [ ] Revisar versiones activas de secretos antes de destruir versiones antiguas.
- [ ] Configurar alertas de presupuesto y consumo del proyecto Firebase.

## MapLibre y datos cartográficos

- [ ] Verificar atribuciones y términos de Geoapify, MapLibre, Overture y geoBoundaries.
- [ ] Definir comportamiento ante indisponibilidad del estilo vectorial o PMTiles.
- [ ] Medir cargas de mapa, marcadores y geometrías por sesión real.
- [ ] Probar mapas en escritorio y móvil con viajes pequeños y grandes.

## Geoapify y Functions

- [x] Sustituir Nominatim por callable Functions privadas.
- [x] Separar autocomplete de ciudades y búsqueda general.
- [x] Implementar cuotas, caché compartida, expiración y límites de instancias.
- [x] Limitar longitud de búsquedas generales y entradas batch.
- [x] Normalizar respuestas de reverse geocoding.
- [ ] Configurar TTL para todas las colecciones internas con `expiresAt`.
- [ ] Validar manualmente cada Function general antes de desplegarla.
- [ ] Mantener logs sin API keys, tokens, headers completos, IP sin hash o contenido personal.

## Firebase, cuentas y datos

- [x] Implementar Google Auth y cierre de sesión.
- [x] Separar viajes por UID y probar aislamiento con reglas.
- [x] Guardar viajes mediante resúmenes y revisiones inmutables.
- [x] Detectar conflictos entre pestañas o dispositivos.
- [ ] Probar importación de viajes locales sin pérdida de datos.
- [ ] Probar eliminación completa y limpieza de revisiones huérfanas.
- [ ] Definir backups, restauración y retención.
- [ ] Implementar exportación y eliminación de cuenta/datos.

## App Check

- [ ] Registrar la aplicación web y dominios legítimos con reCAPTCHA Enterprise.
- [ ] Añadir `VITE_FIREBASE_APPCHECK_SITE_KEY` al entorno autorizado.
- [ ] Observar solicitudes válidas e inválidas con enforcement desactivado.
- [ ] Activar enforcement gradualmente y documentar rollback.

## Alojamiento

- [ ] Servir por HTTPS.
- [ ] Configurar CSP, HSTS, Referrer-Policy y Permissions-Policy.
- [ ] Servir assets estáticos con compresión y caché versionada.
- [ ] Configurar fallback SPA sin interceptar endpoints ni assets inexistentes.
- [ ] Crear un proyecto Firebase separado para producción.

## Observabilidad

- [ ] Monitorizar errores de frontend sin notas, consultas o rutas sensibles.
- [ ] Monitorizar latencia, errores, cuotas y gasto de Functions.
- [ ] Crear alertas de disponibilidad y presupuesto.
- [ ] Definir retención de logs e identificadores de correlación no sensibles.

## Privacidad y legal

- [ ] Publicar política de privacidad y términos aplicables.
- [ ] Documentar finalidades, proveedores, ubicación y retención de datos.
- [ ] Determinar requisitos de cookies o analítica.
- [ ] Documentar exportación y borrado de datos.

## Calidad

- [ ] Mantener verdes `npm test`, `npm run test:rules`, `npm run lint` y `npm run build`.
- [ ] Mantener verdes Quality checks, CodeQL y Dependency audit.
- [ ] Añadir pruebas end-to-end de crear, editar, guardar, abrir y eliminar viajes.
- [ ] Probar teclado, lectores de pantalla y contraste conforme a WCAG 2.2 AA.
- [ ] Probar Safari/iOS, Chrome/Android, Firefox y Edge.
- [ ] Ejecutar pruebas de carga del backend y del mapa con muchos elementos.
