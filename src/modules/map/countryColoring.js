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

function channelToHex(value) {
  return Math.round(Math.max(0, Math.min(255, value)))
    .toString(16)
    .padStart(2, '0');
}

export function vividCountryColor(value) {
  const color = String(value || '').trim();
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color || 'transparent';

  const numeric = Number.parseInt(match[1], 16);
  const red = ((numeric >> 16) & 255) / 255;
  const green = ((numeric >> 8) & 255) / 255;
  const blue = (numeric & 255) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;

  if (delta !== 0) {
    if (maximum === red) hue = ((green - blue) / delta) % 6;
    else if (maximum === green) hue = ((blue - red) / delta) + 2;
    else hue = ((red - green) / delta) + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const lightness = (maximum + minimum) / 2;
  const saturation = delta === 0
    ? 0
    : delta / (1 - Math.abs((2 * lightness) - 1));
  const vividSaturation = Math.min(1, saturation + 0.18);
  const vividLightness = Math.min(0.68, lightness + 0.08);
  const chroma = (1 - Math.abs((2 * vividLightness) - 1)) * vividSaturation;
  const hueSection = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const offset = vividLightness - (chroma / 2);
  let vividRed = 0;
  let vividGreen = 0;
  let vividBlue = 0;

  if (hueSection < 1) [vividRed, vividGreen, vividBlue] = [chroma, secondary, 0];
  else if (hueSection < 2) [vividRed, vividGreen, vividBlue] = [secondary, chroma, 0];
  else if (hueSection < 3) [vividRed, vividGreen, vividBlue] = [0, chroma, secondary];
  else if (hueSection < 4) [vividRed, vividGreen, vividBlue] = [0, secondary, chroma];
  else if (hueSection < 5) [vividRed, vividGreen, vividBlue] = [secondary, 0, chroma];
  else [vividRed, vividGreen, vividBlue] = [chroma, 0, secondary];

  return `#${channelToHex((vividRed + offset) * 255)}${channelToHex((vividGreen + offset) * 255)}${channelToHex((vividBlue + offset) * 255)}`;
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
    ['==', ['get', 'class'], 'land'],
    countrySelection,
  ];
}

export function countryFillStyleState(segments, colorForIndex) {
  const entries = visitedCountries(segments, colorForIndex)
    .map(({ countryCode, color }) => ({
      countryCode,
      color: vividCountryColor(color),
    }));

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
