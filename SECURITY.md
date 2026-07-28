# Seguridad — checklist para publicación

Esta app es un frontend estático. La seguridad seria vive en el **backend** y
en la **plataforma de despliegue**. Esta guía cubre ambos.

## Frontend (incluido en el repo)

- [x] React escapa el HTML por defecto (mitiga XSS en el render).
- [x] Texto libre del usuario se sanea antes de guardar (`sanitizeText`).
- [x] Popups del mapa escapan HTML manualmente (`escapeHtml` en RouteMap).
- [x] Content-Security-Policy base en `index.html`.
      → En producción, defínela también como **cabecera HTTP** (más fuerte).
- [x] Sin secretos en el cliente. Solo variables `VITE_` públicas.
- [ ] Configurar cabeceras en el CDN/hosting:
      `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
      `Referrer-Policy: strict-origin-when-cross-origin`,
      `X-Frame-Options: DENY` (o `frame-ancestors 'none'` en CSP),
      `Permissions-Policy`.

## Geocodificación

- Nominatim público **no** es apto para tráfico mundial (1 req/seg + atribución).
  Para producción: auto-hospedar Nominatim o usar proveedor comercial detrás de
  tu backend con caché y rate limit. La clave del proveedor va en el **backend**,
  nunca en el cliente.

## Backend (cuando se active `driver=api`)

- [ ] **HTTPS/TLS** obligatorio en todo el tráfico.
- [ ] **Autenticación**: tokens de corta vida + refresh, o cookies httpOnly +
      SameSite. No guardar tokens en localStorage.
- [ ] **Autorización**: cada usuario solo accede a sus propios viajes.
- [ ] **Validación de entrada** server-side (Pydantic) en cada endpoint.
- [ ] **Rate limiting** por IP/usuario (p. ej. slowapi, o en el API gateway).
- [ ] **CORS** restringido al dominio del frontend.
- [ ] **Protección de inyección**: ORM con queries parametrizadas.
- [ ] **Logs y auditoría** sin datos sensibles; rotación de logs.
- [ ] **Secrets** en gestor de secretos (no en código ni en imágenes Docker).
- [ ] **Dependencias**: `npm audit` / escaneo de CVE en CI.

## Privacidad

- Define política de datos (los viajes pueden contener fechas y ubicaciones).
- Cumple GDPR/CCPA si hay usuarios en esas regiones: consentimiento,
  exportación y borrado de datos.

## Despliegue seguro

- Pipeline CI/CD con lint + build + escaneo de dependencias.
- WAF y protección DDoS a nivel de CDN (Cloudflare/AWS Shield).
- Backups automáticos de la base de datos.
