const LANDMARKS = [
  {
    id: 'paris-eiffel',
    aliases: ['paris'],
    imageUrl: new URL('../../assets/city-landmarks/paris-eiffel.svg', import.meta.url).href,
    priority: 100,
    scale: 0.92,
  },
  {
    id: 'berlin-brandenburg',
    aliases: ['berlin'],
    imageUrl: new URL('../../assets/city-landmarks/berlin-brandenburg.svg', import.meta.url).href,
    priority: 94,
    scale: 0.89,
  },
  {
    id: 'barcelona-sagrada',
    aliases: ['barcelona'],
    imageUrl: new URL('../../assets/city-landmarks/barcelona-sagrada.svg', import.meta.url).href,
    priority: 92,
    scale: 0.89,
  },
  {
    id: 'amsterdam-canal-houses',
    aliases: ['amsterdam'],
    imageUrl: new URL('../../assets/city-landmarks/amsterdam-canal-houses.svg', import.meta.url).href,
    priority: 88,
    scale: 0.84,
  },
  {
    id: 'munich-frauenkirche',
    aliases: ['munich', 'munchen'],
    imageUrl: new URL('../../assets/city-landmarks/munich-frauenkirche.svg', import.meta.url).href,
    priority: 84,
    scale: 0.88,
  },
  {
    id: 'brussels-landmark',
    aliases: ['bruselas', 'brussels', 'bruxelles', 'brussel'],
    imageUrl: new URL('../../assets/city-landmarks/brussels-atomium.svg', import.meta.url).href,
    priority: 72,
    scale: 0.84,
  },
];

export function normalizeLandmarkCityName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function landmarkForCityName(name) {
  const normalized = normalizeLandmarkCityName(name);
  if (!normalized) return null;
  return LANDMARKS.find((landmark) => landmark.aliases.some((alias) => (
    normalized === alias
    || normalized.startsWith(`${alias} `)
    || normalized.startsWith(`${alias},`)
  ))) || null;
}

export function itineraryLandmarksFromFeatures(cityFeatures = []) {
  return cityFeatures.flatMap((feature) => {
    const landmark = landmarkForCityName(feature?.properties?.name);
    if (!landmark) return [];
    const [lng, lat] = feature?.geometry?.coordinates || [];
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{
      ...landmark,
      lat: latitude,
      lng: longitude,
      cityName: String(feature?.properties?.name || ''),
    }];
  });
}
