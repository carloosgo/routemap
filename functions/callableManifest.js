export const CALLABLE_FUNCTIONS_REGION = 'us-central1';

export const CALLABLE_FUNCTIONS = Object.freeze([
  Object.freeze({ name: 'geoapifyCityAutocomplete', file: 'geoapifyCityFunctions.js' }),
  Object.freeze({ name: 'geoapifyAutocomplete', file: 'geoapifyPlaceFunctions.js' }),
  Object.freeze({ name: 'geoapifyPlaceDetails', file: 'geoapifyPlaceFunctions.js' }),
  Object.freeze({ name: 'geoapifyPlaceEnrichment', file: 'geoapifyPlaceFunctions.js' }),
  Object.freeze({ name: 'geoapifyPlaceSearch', file: 'geoapifyPlaceFunctions.js' }),
  Object.freeze({ name: 'geoapifyReverse', file: 'geoapifyRouteFunctions.js' }),
  Object.freeze({ name: 'geoapifyRoute', file: 'geoapifyRouteFunctions.js' }),
  Object.freeze({ name: 'geoapifyBatchGeocode', file: 'geoapifyBatchFunctions.js' }),
  Object.freeze({ name: 'geoapifyBatchGeocodeResult', file: 'geoapifyBatchFunctions.js' }),
  Object.freeze({ name: 'geoapifyCountryBoundary', file: 'countryBoundaryFunction.js' }),
  Object.freeze({ name: 'googlePlaceAutocomplete', file: 'googleMapsFunctions.js' }),
  Object.freeze({ name: 'googlePlaceSearch', file: 'googleMapsFunctions.js' }),
  Object.freeze({ name: 'googlePlaceDetailsEssentials', file: 'googlePlaceDetailsEssentialsFunction.js' }),
  Object.freeze({ name: 'googlePlaceLocations', file: 'googlePlaceLocationFunction.js' }),
  Object.freeze({ name: 'googleCountryPlaceIds', file: 'googleCountryPlaceIdsFunction.js' }),
  Object.freeze({ name: 'googleRouteOptimized', file: 'googleOptimizedRouteFunction.js' }),
  Object.freeze({ name: 'storageV4RolloutTelemetry', file: 'v4RolloutTelemetryFunction.js' }),
  Object.freeze({ name: 'storageV4SyncTelemetry', file: 'v4SyncTelemetryFunction.js' }),
]);

export const CALLABLE_FUNCTION_NAMES = Object.freeze(
  CALLABLE_FUNCTIONS.map(({ name }) => name)
);
