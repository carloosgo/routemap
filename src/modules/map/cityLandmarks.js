export const CITY_LANDMARKS = {
  'berlin-DE': {
    imageId: 'atlas-landmark-berlin',
    path: '/icons/landmarks/berlin.svg',
    label: 'Brandenburg Gate',
    priority: 100,
  },
  'budapest-HU': {
    imageId: 'atlas-landmark-budapest',
    path: '/icons/landmarks/budapest.svg',
    label: 'Hungarian Parliament Building',
    priority: 100,
  },
  'amsterdam-NL': {
    imageId: 'atlas-landmark-amsterdam',
    path: '/icons/landmarks/amsterdam.svg',
    label: 'Amsterdam canal houses',
    priority: 100,
  },
  'madrid-ES': {
    imageId: 'atlas-landmark-madrid',
    path: '/icons/landmarks/madrid.svg',
    label: 'Puerta de Alcalá',
    priority: 100,
  },
  'bruges-BE': {
    imageId: 'atlas-landmark-bruges',
    path: '/icons/landmarks/bruges.svg',
    label: 'Belfry of Bruges',
    priority: 100,
  },
};

const CITY_ALIASES = {
  brujas: 'bruges',
  brugge: 'bruges',
};

export function normalizeCityName(value = '') {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return CITY_ALIASES[normalized] || normalized;
}

export function landmarkForCity(city) {
  if (!city?.name || !city?.countryCode) return null;
  const key = `${normalizeCityName(city.name)}-${city.countryCode.toUpperCase()}`;
  return CITY_LANDMARKS[key] || null;
}

export const LANDMARK_IMAGES = Object.values(CITY_LANDMARKS);
