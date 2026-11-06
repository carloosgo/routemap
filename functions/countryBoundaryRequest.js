export const COUNTRY_BOUNDARY_GEOMETRY_SOURCE = 'geoBoundaries.gbOpen.ADM0.full';
export const COUNTRY_BOUNDARY_CACHE_VERSION = 'v5';

const GEOBOUNDARIES_API_ORIGIN = 'https://www.geoboundaries.org';
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'github.com',
  'raw.githubusercontent.com',
  'media.githubusercontent.com',
]);

export function countryBoundaryCacheKey(countryCode) {
  const normalizedCode = String(countryCode || '').trim().toUpperCase();
  return `country-boundary:${COUNTRY_BOUNDARY_CACHE_VERSION}:${COUNTRY_BOUNDARY_GEOMETRY_SOURCE}:${normalizedCode}`;
}

export function countryBoundaryMetadataUrl(iso3) {
  const normalizedIso3 = String(iso3 || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedIso3)) return '';
  return `${GEOBOUNDARIES_API_ORIGIN}/api/current/gbOpen/${normalizedIso3}/ADM0/`;
}

function isAllowedGeoBoundariesUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:'
      && ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname)
      && parsed.pathname.includes('/wmgeolab/geoBoundaries/');
  } catch {
    return false;
  }
}

function mediaUrlForGitHubRaw(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com') return '';
    const match = parsed.pathname.match(
      /^\/wmgeolab\/geoBoundaries\/raw\/([^/]+)\/(.+)$/
    );
    if (!match) return '';
    return `https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/${match[1]}/${match[2]}`;
  } catch {
    return '';
  }
}

export function countryBoundaryDownloadUrls(metadata) {
  const primary = String(metadata?.gjDownloadURL || '').trim();
  if (!isAllowedGeoBoundariesUrl(primary)) return [];

  const urls = [primary];
  const mediaUrl = mediaUrlForGitHubRaw(primary);
  if (mediaUrl && isAllowedGeoBoundariesUrl(mediaUrl)) urls.push(mediaUrl);
  return [...new Set(urls)];
}
