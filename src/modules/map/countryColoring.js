import { iso2ToIso3 } from './isoCountryCodes.js';

const COUNTRY_CODE_PROPERTY = 'iso_3166_1_alpha_3';
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

export function countryFillStyleState(segments, colorForIndex) {
  const entries = visitedCountries(segments, colorForIndex)
    .map(({ countryCode, color }) => ({
      alpha3: iso2ToIso3(countryCode),
      color,
    }))
    .filter(({ alpha3 }) => alpha3);

  if (!entries.length) {
    return {
      filter: ['==', ['get', COUNTRY_CODE_PROPERTY], EMPTY_COUNTRY_CODE],
      colorExpression: 'transparent',
    };
  }

  const alpha3Codes = entries.map(({ alpha3 }) => alpha3);
  const colorExpression = ['match', ['get', COUNTRY_CODE_PROPERTY]];
  entries.forEach(({ alpha3, color }) => {
    colorExpression.push(alpha3, color);
  });
  colorExpression.push('transparent');

  return {
    filter: ['in', ['get', COUNTRY_CODE_PROPERTY], ['literal', alpha3Codes]],
    colorExpression,
  };
}
