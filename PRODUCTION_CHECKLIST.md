# Lista de preparación para producción

## Configuración y secretos

- [ ] Configurar `VITE_MAPBOX_TOKEN` como token público de cliente.
- [ ] Restringir el token de Mapbox a los dominios de producción autorizados.
- [ ] Mantener tokens secretos y credenciales exclusivamente en backend/gestor de secretos.
- [ ] Configurar `VITE_API_BASE_URL` solo cuando exista un backend productivo.
- [ ] Verificar que archivos `.env*` con secretos no se versionen.

## Mapbox

- [ ] Revisar el plan, cuota mensual y alertas de gasto antes del lanzamiento.
- [ ] Activar restricciones de URL y permisos mínimos del token.
- [ ] Definir qué ocurre al superar cuota o ante indisponibilidad.
- [ ] Comprobar atribución y términos aplicables a mapas, estilos y datos.
- [ ] Medir cargas de mapa por sesión y por usuario real.

## Geocodificación

- [ ] Sustituir el acceso directo al Nominatim público por un proxy propio o proveedor contratado.
- [ ] Añadir identificación apropiada del servicio, caché servidor y rate limiting.
- [ ] Evitar registrar consultas personales en logs sin necesidad.
- [ ] Definir retención y borrado de logs.

## Backend y cuentas

- [ ] Implementar autenticación, recuperación de cuenta y cierre de sesión.
- [ ] Validar y autorizar toda operación en servidor.
- [ ] Separar viajes por propietario y evitar acceso mediante IDs ajenos.
- [ ] Proteger sesiones, CSRF, CORS y rate limiting.
- [ ] Añadir migraciones, backups verificados y restauración probada.
- [ ] Implementar exportación y eliminación de datos.

## Alojamiento

- [ ] Servir por HTTPS.
- [ ] Configurar CSP, HSTS, Referrer-Policy y Permissions-Policy como cabeceras HTTP.
- [ ] Servir assets estáticos mediante CDN con compresión Brotli/Gzip.
- [ ] Configurar fallback de SPA a `index.html` sin interceptar `/api` ni assets inexistentes.
- [ ] Definir estrategia de caché y versionado del service worker.
- [ ] Probar despliegue desde varias regiones.

## Observabilidad

- [ ] Monitorizar errores de frontend sin incluir notas, rutas o datos sensibles.
- [ ] Monitorizar latencia y errores del backend.
- [ ] Crear alertas de disponibilidad, cuota y gasto.
- [ ] Definir identificadores de correlación y política de retención.

## Privacidad y legal

- [ ] Publicar política de privacidad y términos aplicables.
- [ ] Identificar responsable, finalidades, base jurídica y proveedores.
- [ ] Determinar si se requiere consentimiento de cookies o analítica.
- [ ] Definir transferencias internacionales y ubicación de datos.
- [ ] Documentar conservación, exportación y borrado.

## Calidad

- [ ] Mantener verdes pruebas, lint, build, CodeQL y auditoría de dependencias.
- [ ] Añadir pruebas end-to-end de crear, editar, guardar, abrir y eliminar viajes.
- [ ] Probar teclado, lectores de pantalla y contraste conforme a WCAG 2.2 AA.
- [ ] Probar PWA instalada y actualización del service worker.
- [ ] Probar en Safari/iOS, Chrome/Android, Firefox y Edge.
- [ ] Ejecutar pruebas de carga del backend y de rutas con muchos marcadores.
