import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_SOURCE_URL =
  'https://osm-countries-geojson.monicz.dev/osm-countries-0-0001.geojson';
const OUTPUT_VERSION = 'v1';
const QUALITY = 0.0001;

function selectedCountryCodes(argv) {
  const codes = argv
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value));
  return codes.length ? new Set(codes) : null;
}

function countryCodesFromFeature(feature) {
  const raw = feature?.properties?.tags?.['ISO3166-1'];
  return String(raw || '')
    .split(/[;,]/)
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value));
}

function polygonParts(geometry) {
  if (geometry?.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates];
  }
  if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates;
  }
  return [];
}

function roundCoordinates(value) {
  if (!Array.isArray(value)) return value;
  if (
    value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]))
  ) {
    return [
      Number(Number(value[0]).toFixed(6)),
      Number(Number(value[1]).toFixed(6)),
    ];
  }
  return value.map(roundCoordinates);
}

function compactFeature(code, entries, sourceTimestamp) {
  const parts = entries.flatMap((entry) => polygonParts(entry.geometry));
  if (!parts.length) return null;

  const tags = entries[0]?.properties?.tags || {};
  const name = String(tags['name:es'] || tags.name || tags['name:en'] || code).trim();
  const coordinates = roundCoordinates(parts);

  return {
    type: 'Feature',
    properties: {
      countryCode: code,
      name,
      boundaryKind: 'country',
      source: 'OpenStreetMap',
      sourceDataset: 'Zaczero/osm-countries-geojson',
      sourceTimestamp: sourceTimestamp || '',
      quality: QUALITY,
    },
    geometry: coordinates.length === 1
      ? { type: 'Polygon', coordinates: coordinates[0] }
      : { type: 'MultiPolygon', coordinates },
  };
}

async function main() {
  const requestedCodes = selectedCountryCodes(process.argv.slice(2));
  const sourceUrl = process.env.COUNTRY_BOUNDARY_SOURCE_URL || DEFAULT_SOURCE_URL;
  const outputDirectory = resolve(
    process.env.COUNTRY_BOUNDARY_OUTPUT_DIR
      || `public/country-boundaries/${OUTPUT_VERSION}`
  );

  console.log(`Downloading OSM country boundaries from ${sourceUrl}`);
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: 'application/geo+json, application/json',
      'User-Agent': 'routemap-static-country-boundary-builder/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Boundary source responded ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const features = Array.isArray(payload?.features) ? payload.features : [];
  if (!features.length) throw new Error('Boundary source contains no GeoJSON features.');

  const grouped = new Map();
  for (const feature of features) {
    const parts = polygonParts(feature?.geometry);
    if (!parts.length) continue;

    for (const code of countryCodesFromFeature(feature)) {
      if (requestedCodes && !requestedCodes.has(code)) continue;
      const current = grouped.get(code) || [];
      current.push(feature);
      grouped.set(code, current);
    }
  }

  if (requestedCodes) {
    const missing = [...requestedCodes].filter((code) => !grouped.has(code));
    if (missing.length) {
      throw new Error(`The source did not contain: ${missing.join(', ')}`);
    }
  }

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  const sourceTimestamp = String(
    features.find((feature) => feature?.properties?.timestamp)?.properties?.timestamp || ''
  );
  const manifestCountries = {};

  for (const [code, entries] of [...grouped.entries()].sort(([left], [right]) => (
    left.localeCompare(right)
  ))) {
    const feature = compactFeature(code, entries, sourceTimestamp);
    if (!feature) continue;

    const serialized = JSON.stringify(feature);
    await writeFile(resolve(outputDirectory, `${code}.geojson`), serialized, 'utf8');
    manifestCountries[code] = {
      bytes: Buffer.byteLength(serialized, 'utf8'),
      name: feature.properties.name,
    };
  }

  const manifest = {
    version: OUTPUT_VERSION,
    generatedAt: new Date().toISOString(),
    sourceUrl,
    sourceTimestamp,
    source: 'OpenStreetMap',
    sourceDataset: 'Zaczero/osm-countries-geojson',
    quality: QUALITY,
    countryCount: Object.keys(manifestCountries).length,
    countries: manifestCountries,
  };

  await writeFile(
    resolve(outputDirectory, 'manifest.json'),
    JSON.stringify(manifest),
    'utf8'
  );

  console.log(`Generated ${manifest.countryCount} static country boundary files.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
