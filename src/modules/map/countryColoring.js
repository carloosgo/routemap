function isRouteCity(city) {
  return Boolean(
    city
    && Number.isFinite(city.lat)
    && Math.abs(city.lat) <= 90
    && Number.isFinite(city.lon)
    && Math.abs(city.lon) <= 180
  );
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
  const countries = new Map();
  let previousColor = '';

  (segments || []).forEach((segment) => {
    [segment?.origin, segment?.destination].forEach((city) => {
      if (!isRouteCity(city)) return;
      const countryCode = String(city.countryCode || '').trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(countryCode) || countries.has(countryCode)) return;

      const color = nextDistinctColor(colorForIndex, countries.size, previousColor);
      countries.set(countryCode, { countryCode, city, color });
      previousColor = color;
    });
  });

  return [...countries.values()];
}
