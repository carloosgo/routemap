function isRouteCity(city) {
  return Boolean(
    city
    && Number.isFinite(city.lat)
    && Math.abs(city.lat) <= 90
    && Number.isFinite(city.lon)
    && Math.abs(city.lon) <= 180
  );
}

function routeCountryCode(city) {
  const countryCode = String(city?.countryCode || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(countryCode) ? countryCode : '';
}

function nextDistinctColor(colorForIndex, countryIndex, previousColor) {
  const firstCandidate = colorForIndex(countryIndex);
  if (!previousColor || firstCandidate !== previousColor) return firstCandidate;

  for (let offset = 1; offset < 32; offset += 1) {
    const candidate = colorForIndex(countryIndex + offset);
    if (candidate !== previousColor) return candidate;
  }

  return firstCandidate;
}

export function visitedCountries(segments, colorForIndex) {
  const safeSegments = Array.isArray(segments) ? segments : [];
  const originCountryCode = routeCountryCode(safeSegments[0]?.origin);
  const destinations = new Map();

  safeSegments.forEach((segment) => {
    const city = segment?.destination;
    if (!isRouteCity(city)) return;

    const countryCode = routeCountryCode(city);
    if (
      !countryCode
      || countryCode === originCountryCode
      || destinations.has(countryCode)
    ) {
      return;
    }

    destinations.set(countryCode, { countryCode, city });
  });

  if (destinations.size <= 1) return [];

  const countries = [];
  let previousColor = '';
  destinations.forEach(({ countryCode, city }) => {
    const color = nextDistinctColor(colorForIndex, countries.length, previousColor);
    countries.push({ countryCode, city, color });
    previousColor = color;
  });

  return countries;
}
