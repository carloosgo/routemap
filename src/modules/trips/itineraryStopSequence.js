function normalizedText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function coordinateToken(city) {
  const lat = Number(city?.lat);
  const lon = Number(city?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  return `coord:${lat.toFixed(5)},${lon.toFixed(5)}`;
}

function cityIdentityTokens(city) {
  if (!city || typeof city !== 'object') return [];
  const tokens = [];
  const providerId = normalizedText(city.googlePlaceId || city.placeId || city.sourceId);
  const id = normalizedText(city.id);
  const coordinate = coordinateToken(city);
  const name = normalizedText(city.name || city.displayName);
  const country = normalizedText(city.countryCode || city.country);

  if (providerId) tokens.push(`provider:${providerId}`);
  if (id) tokens.push(`id:${id}`);
  if (coordinate) tokens.push(coordinate);
  if (name && country) tokens.push(`name:${name}|${country}`);
  return tokens;
}

export function sameItineraryCity(left, right) {
  const leftTokens = cityIdentityTokens(left);
  if (!leftTokens.length) return false;
  const rightTokens = new Set(cityIdentityTokens(right));
  return leftTokens.some((token) => rightTokens.has(token));
}

function hasChosenCity(city) {
  return cityIdentityTokens(city).length > 0;
}

export function buildItineraryStopSequence(segments, colorForIndex) {
  const safeSegments = Array.isArray(segments) ? segments : [];
  const origin = safeSegments[0]?.origin || null;
  let lastChosenDestinationIndex = -1;

  safeSegments.forEach((segment, index) => {
    if (hasChosenCity(segment?.destination)) lastChosenDestinationIndex = index;
  });

  const terminalReturnIndex = (
    lastChosenDestinationIndex >= 0
    && sameItineraryCity(origin, safeSegments[lastChosenDestinationIndex]?.destination)
  )
    ? lastChosenDestinationIndex
    : -1;

  let nextNumber = 0;
  return safeSegments.map((segment, index) => {
    if (!hasChosenCity(segment?.destination)) {
      return {
        number: null,
        colorIndex: null,
        color: null,
        isTerminalReturn: false,
      };
    }

    if (index === terminalReturnIndex) {
      return {
        number: null,
        colorIndex: null,
        color: null,
        isTerminalReturn: true,
      };
    }

    nextNumber += 1;
    const colorIndex = nextNumber - 1;
    return {
      number: nextNumber,
      colorIndex,
      color: typeof colorForIndex === 'function' ? colorForIndex(colorIndex) : null,
      isTerminalReturn: false,
    };
  });
}
