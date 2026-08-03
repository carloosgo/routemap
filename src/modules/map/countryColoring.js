const COUNTRY_CODE_PROPERTY = 'country';
const EMPTY_COUNTRY_CODE = '__NO_VISITED_COUNTRIES__';

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

function baseCountryFilter(countrySelection) {
  return [
    'all',
    ['==', ['get', 'subtype'], 'country'],
    ['==', ['get', 'is_land'], true],
    countrySelection,
  ];
}

export function countryFillStyleState(segments, colorForIndex) {
  const entries = visitedCountries(segments, colorForIndex)
    .map(({ countryCode, color }) => ({ countryCode, color }));

  if (!entries.length) {
    return {
      filter: baseCountryFilter([
        '==',
        ['get', COUNTRY_CODE_PROPERTY],
        EMPTY_COUNTRY_CODE,
      ]),
      colorExpression: 'transparent',
    };
  }

  const countryCodes = entries.map(({ countryCode }) => countryCode);
  const colorExpression = ['match', ['get', COUNTRY_CODE_PROPERTY]];
  entries.forEach(({ countryCode, color }) => {
    colorExpression.push(countryCode, color);
  });
  colorExpression.push('transparent');

  return {
    filter: baseCountryFilter([
      'in',
      ['get', COUNTRY_CODE_PROPERTY],
      ['literal', countryCodes],
    ]),
    colorExpression,
  };
}
