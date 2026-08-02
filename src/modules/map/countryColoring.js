function isRouteCity(city) {
  return Boolean(
    city
    && Number.isFinite(city.lat)
    && Math.abs(city.lat) <= 90
    && Number.isFinite(city.lon)
    && Math.abs(city.lon) <= 180
  );
}

export function visitedCountries(segments, colorForIndex) {
  const countries = new Map();

  (segments || []).forEach((segment, index) => {
    const color = colorForIndex(index);
    [segment?.origin, segment?.destination].forEach((city) => {
      if (!isRouteCity(city)) return;
      const countryCode = String(city.countryCode || '').trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(countryCode) || countries.has(countryCode)) return;
      countries.set(countryCode, { countryCode, city, color });
    });
  });

  return [...countries.values()];
}

export function countryLayerStyle(color) {
  return {
    color,
    weight: 1.5,
    opacity: 0.5,
    fillColor: color,
    fillOpacity: 0.18,
    fillRule: 'evenodd',
    smoothFactor: 0,
  };
}
