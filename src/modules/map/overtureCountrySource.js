const OVERTURE_STAC_CATALOG_URL = 'https://stac.overturemaps.org/catalog.json';
let divisionsUrlRequest = null;

function absoluteUrl(baseUrl, href) {
  return new URL(String(href || ''), baseUrl).href;
}

function linksOf(value) {
  return Array.isArray(value?.links) ? value.links : [];
}

function latestReleaseLink(catalog) {
  return linksOf(catalog).find((link) => (
    link?.rel === 'child' && link?.latest === true && link?.href
  ));
}

function divisionsThemeLink(catalog) {
  return linksOf(catalog).find((link) => {
    if (link?.rel !== 'child' || !link?.href) return false;
    const candidate = `${link.title || ''} ${link.id || ''} ${link.href}`.toLowerCase();
    return candidate.includes('divisions');
  });
}

function pmtilesLink(catalog) {
  return linksOf(catalog).find((link) => link?.rel === 'pmtiles' && link?.href);
}

async function fetchCatalog(url) {
  const response = await fetch(url, {
    cache: 'force-cache',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Overture STAC respondió ${response.status}.`);
  }
  return response.json();
}

export async function resolveOvertureDivisionsPmtilesUrl(overrideUrl = '') {
  const override = String(overrideUrl || '').trim();
  if (override) return override;
  if (divisionsUrlRequest) return divisionsUrlRequest;

  divisionsUrlRequest = (async () => {
    const rootCatalog = await fetchCatalog(OVERTURE_STAC_CATALOG_URL);
    const releaseLink = latestReleaseLink(rootCatalog);
    if (!releaseLink) throw new Error('Overture STAC no publicó una versión actual.');

    const releaseUrl = absoluteUrl(OVERTURE_STAC_CATALOG_URL, releaseLink.href);
    const releaseCatalog = await fetchCatalog(releaseUrl);
    const themeLink = divisionsThemeLink(releaseCatalog);
    if (!themeLink) throw new Error('Overture STAC no publicó el tema divisions.');

    const themeUrl = absoluteUrl(releaseUrl, themeLink.href);
    const themeCatalog = await fetchCatalog(themeUrl);
    const archiveLink = pmtilesLink(themeCatalog);
    if (!archiveLink) throw new Error('Overture STAC no publicó el archivo divisions PMTiles.');

    return absoluteUrl(themeUrl, archiveLink.href);
  })().catch((error) => {
    divisionsUrlRequest = null;
    throw error;
  });

  return divisionsUrlRequest;
}

export function resetOvertureCountrySourceForTests() {
  divisionsUrlRequest = null;
}
