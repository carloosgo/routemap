export const DEV_TTL_FIELD = 'expiresAt';

export const DEV_TTL_POLICIES = Object.freeze([
  Object.freeze({ collectionGroup: 'citySearchCache', field: DEV_TTL_FIELD, kind: 'provider-cache' }),
  Object.freeze({ collectionGroup: 'placeSearchCache', field: DEV_TTL_FIELD, kind: 'provider-cache' }),
  Object.freeze({ collectionGroup: 'geocodeCache', field: DEV_TTL_FIELD, kind: 'provider-cache' }),
  Object.freeze({ collectionGroup: 'placeDetailsCache', field: DEV_TTL_FIELD, kind: 'provider-cache' }),
  Object.freeze({ collectionGroup: 'placeEnrichmentCache', field: DEV_TTL_FIELD, kind: 'provider-cache' }),
  Object.freeze({ collectionGroup: 'routeCache', field: DEV_TTL_FIELD, kind: 'provider-cache' }),
  Object.freeze({ collectionGroup: 'routeEstimateCache', field: DEV_TTL_FIELD, kind: 'provider-cache' }),
  Object.freeze({ collectionGroup: 'countryBoundaryCache', field: DEV_TTL_FIELD, kind: 'provider-cache' }),
  Object.freeze({ collectionGroup: 'googlePlaceLocationCache', field: DEV_TTL_FIELD, kind: 'provider-cache' }),
  Object.freeze({ collectionGroup: 'googleCountryPlaceIdCacheV4', field: DEV_TTL_FIELD, kind: 'provider-cache' }),
  Object.freeze({ collectionGroup: 'geoapifyBatchJobs', field: DEV_TTL_FIELD, kind: 'provider-temporary-state' }),
  Object.freeze({ collectionGroup: 'functionRateLimits', field: DEV_TTL_FIELD, kind: 'internal-ephemeral-state' }),
]);

export const DEV_TTL_COLLECTION_GROUPS = Object.freeze(
  DEV_TTL_POLICIES.map(({ collectionGroup }) => collectionGroup)
);
