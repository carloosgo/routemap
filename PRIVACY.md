# Privacidad y tratamiento de datos

## Estado actual

Atlas funciona por defecto en modo local. Los viajes, ciudades, fechas, notas, pendientes y gastos se guardan en `localStorage` dentro del navegador del usuario. El repositorio no incluye actualmente cuentas, autenticación ni una base de datos de producción.

## Datos almacenados localmente

- Nombre del viaje.
- Ciudades, países y coordenadas seleccionadas.
- Fechas de cada tramo.
- Gastos y moneda elegida.
- Notas y pendientes.
- Preferencia de idioma.

Estos datos pueden ser vistos o modificados por cualquier persona o extensión con acceso al perfil local del navegador. No deben considerarse cifrados ni adecuados para información altamente sensible.

## Servicios externos

### Mapbox

El mapa solicita estilos, mosaicos y recursos a Mapbox. Mapbox puede recibir datos técnicos habituales de una solicitud web, como dirección IP, agente de usuario y URL de referencia, conforme a sus propias políticas.

### Nominatim / OpenStreetMap

Las búsquedas de ciudades se envían al servicio Nominatim configurado. Las consultas escritas por el usuario y datos técnicos de red pueden llegar a ese proveedor. Para tráfico público significativo debe utilizarse un proxy propio con caché, identificación y límites de uso; no debe dependerse indefinidamente del servicio público.

### FlagCDN

Las imágenes de banderas pueden solicitarse a FlagCDN. El proveedor puede recibir datos técnicos normales de la petición.

### Google Fonts

La versión actual carga la familia Inter desde Google Fonts. En un despliegue con requisitos estrictos de privacidad conviene alojar los recursos tipográficos dentro del mismo dominio.

## Cookies

El modo local no crea cookies de cuenta. La capa API está preparada para enviar cookies de sesión con `credentials: include`, pero el repositorio no implementa todavía el backend que las emitiría.

## Cuentas y sincronización futuras

Antes de activar cuentas o sincronización deben existir, como mínimo:

- identificación clara del responsable del tratamiento;
- finalidades y base jurídica;
- plazos de conservación;
- exportación y eliminación de datos;
- separación de datos por usuario;
- control de acceso y auditoría;
- cifrado en tránsito y protección de backups;
- acuerdos con proveedores y ubicación de datos;
- política de privacidad publicada y versionada;
- consentimiento cuando legalmente corresponda.

## Eliminación de datos en modo local

Los datos pueden eliminarse borrando los viajes desde la aplicación o limpiando el almacenamiento del sitio en el navegador. Desinstalar la PWA no garantiza por sí solo que el almacenamiento del sitio sea eliminado en todos los navegadores.

## Limitación

Este documento describe técnicamente el comportamiento actual del repositorio. No sustituye una política legal adaptada a la entidad operadora, países de lanzamiento y proveedores finalmente contratados.
