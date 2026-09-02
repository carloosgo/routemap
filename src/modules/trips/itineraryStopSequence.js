function normalizedText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizedCountryCode(city) {
  return String(city?.countryCode ?? '').trim().toUpperCase();
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

function buildCountryRunPresentation(origin, safeSegments) {
  const stops = [
    origin || null,
    ...safeSegments.map((segment) => segment?.destination || null),
  ];
  const presentation = safeSegments.map(() => ({
    countryRunPosition: null,
    joinsPreviousCountryRun: false,
  }));

  let start = 0;
  while (start < stops.length) {
    const countryCode = normalizedCountryCode(stops[start]);
    if (!countryCode) {
      start += 1;
      continue;
    }

    let end = start + 1;
    while (end < stops.length && normalizedCountryCode(stops[end]) === countryCode) {
      end += 1;
    }

    if (end - start >= 3) {
      for (let stopIndex = start; stopIndex < end; stopIndex += 1) {
        const segmentIndex = stopIndex - 1;
        if (segmentIndex < 0 || segmentIndex >= safeSegments.length) continue;
        presentation[segmentIndex] = {
          countryRunPosition:
            stopIndex === start ? 'start' : stopIndex === end - 1 ? 'end' : 'middle',
          joinsPreviousCountryRun: stopIndex > start,
        };
      }
    }

    start = end;
  }

  return presentation;
}

export function buildItineraryStopSequence(origin, segments, colorForIndex) {
  const safeSegments = Array.isArray(segments) ? segments : [];
  const countryRunPresentation = buildCountryRunPresentation(origin, safeSegments);
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
    const countryRun = countryRunPresentation[index];
    if (!hasChosenCity(segment?.destination)) {
      return {
        number: null,
        colorIndex: null,
        color: null,
        isTerminalReturn: false,
        ...countryRun,
      };
    }

    if (index === terminalReturnIndex) {
      return {
        number: null,
        colorIndex: null,
        color: null,
        isTerminalReturn: true,
        ...countryRun,
      };
    }

    nextNumber += 1;
    const colorIndex = nextNumber - 1;
    return {
      number: nextNumber,
      colorIndex,
      color: typeof colorForIndex === 'function' ? colorForIndex(colorIndex) : null,
      isTerminalReturn: false,
      ...countryRun,
    };
  });
}
