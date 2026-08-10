export function normalizeLandmarkCityName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function landmarkForCityName() {
  return null;
}

export function itineraryLandmarksFromFeatures() {
  return [];
}
