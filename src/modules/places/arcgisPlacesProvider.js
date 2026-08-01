import { config } from '../../config.js';

const ARCGIS_FIND_URL =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

function normalizeCandidate(candidate, index) {
  const attributes = candidate.attributes || {};
  return {
    id: `${candidate.location?.x ?? 'x'}:${candidate.location?.y ?? 'y'}:${index}`,
    name: attributes.PlaceName || candidate.address || 'Lugar',
    address: attributes.Place_addr || candidate.address || '',
    city: attributes.City || '',
    country: attributes.Country || '',
    category: attributes.Type || attributes.Addr_type || '',
    score: candidate.score || 0,
    lon: candidate.location?.x,
    lat: candidate.location?.y,
  };
}

export async function searchArcgisPlaces(query, { signal, limit = 30 } = {}) {
  const text = query.trim();
  if (text.length < 3) return [];

  const params = new URLSearchParams({
    f: 'json',
    singleLine: text,
    outFields: 'PlaceName,Place_addr,Type,City,Country,Addr_type',
    maxLocations: String(Math.min(Math.max(limit, 1), 50)),
    forStorage: 'false',
  });

  if (config.arcgis.apiKey) params.set('token', config.arcgis.apiKey);

  let response;
  try {
    response = await fetch(`${ARCGIS_FIND_URL}?${params.toString()}`, {
      method: 'GET',
      mode: 'cors',
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('No se pudo conectar con ArcGIS. Revisa la conexión o la clave configurada.');
  }

  if (!response.ok) throw new Error(`ArcGIS respondió ${response.status}`);

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || 'No fue posible buscar lugares en ArcGIS');
  }

  return (payload.candidates || [])
    .map(normalizeCandidate)
    .filter((candidate) => Number.isFinite(candidate.lon) && Number.isFinite(candidate.lat));
}
