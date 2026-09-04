function normalizedCountryName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function planningGroupKey(place) {
  const segmentId = typeof place?.segmentId === 'string' ? place.segmentId.trim() : '';
  const dayOffset = Number(place?.dayOffset);
  if (!segmentId || !Number.isInteger(dayOffset) || dayOffset < 0) return 'unassigned';
  return `${segmentId}\u0000${dayOffset}`;
}

export function placeCountryKey(place) {
  const countryCode = String(place?.countryCode || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(countryCode)) return `code:${countryCode}`;

  const country = normalizedCountryName(place?.country);
  return country ? `name:${country}` : 'unknown';
}

export function groupPlacesByCountry(places) {
  const groups = new Map();

  (Array.isArray(places) ? places : []).forEach((place) => {
    const countryKey = placeCountryKey(place);
    if (!groups.has(countryKey)) groups.set(countryKey, []);
    groups.get(countryKey).push(place);
  });

  return [...groups.values()].flat();
}

export function insertPlaceByCountry(places, place) {
  const currentPlaces = Array.isArray(places) ? places : [];
  return [...currentPlaces, place];
}

export function contiguousPlaceGroups(places) {
  const groups = [];

  (Array.isArray(places) ? places : []).forEach((place, index) => {
    const countryKey = placeCountryKey(place);
    let group = groups.at(-1);

    if (!group || group.countryKey !== countryKey) {
      group = {
        id: `${countryKey}:${index}`,
        countryKey,
        country: place?.country || '',
        countryCode: place?.countryCode || '',
        startIndex: index,
        places: [],
      };
      groups.push(group);
    } else {
      if (!group.country && place?.country) group.country = place.country;
      if (!group.countryCode && place?.countryCode) {
        group.countryCode = place.countryCode;
      }
    }

    group.places.push(place);
  });

  return groups;
}

export function reorderPlaceList(
  places,
  sourceId,
  targetId,
  placement = 'before'
) {
  const currentPlaces = Array.isArray(places) ? places : [];
  if (!sourceId || !targetId || sourceId === targetId) return currentPlaces;

  const sourceIndex = currentPlaces.findIndex((place) => place.id === sourceId);
  const target = currentPlaces.find((place) => place.id === targetId);
  if (sourceIndex < 0 || !target) return currentPlaces;

  const source = currentPlaces[sourceIndex];
  if (planningGroupKey(source) !== planningGroupKey(target)) return currentPlaces;

  const reordered = [...currentPlaces];
  const [moved] = reordered.splice(sourceIndex, 1);
  const targetIndex = reordered.findIndex((place) => place.id === targetId);
  reordered.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, moved);

  const changed = reordered.some((place, index) => place !== currentPlaces[index]);
  return changed ? reordered : currentPlaces;
}
