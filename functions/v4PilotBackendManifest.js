export const V4_PILOT_EVENTARC_REGION = 'northamerica-south1';
export const V4_PILOT_SERVICE_REGION = 'us-central1';
export const V4_PILOT_BACKEND_REGION = V4_PILOT_SERVICE_REGION;
export const V4_PILOT_EVENTARC_DESTINATION_FUNCTION = 'v4FirestoreEventIngress';

export const V4_PILOT_BACKEND_FUNCTION_NAMES = Object.freeze([
  V4_PILOT_EVENTARC_DESTINATION_FUNCTION,
  'v4TripLifecycle',
  'v4TripPurge',
]);

export const V4_PILOT_BACKEND_FUNCTION_REGIONS = Object.freeze({
  [V4_PILOT_EVENTARC_DESTINATION_FUNCTION]: V4_PILOT_SERVICE_REGION,
  v4TripLifecycle: V4_PILOT_SERVICE_REGION,
  v4TripPurge: V4_PILOT_SERVICE_REGION,
});

export const V4_PILOT_EVENTARC_TRIGGERS = Object.freeze([
  Object.freeze({
    name: 'atlas-v4-segment-written',
    collection: 'segments',
    document: 'users/{userId}/trips/{tripId}/segments/{entityId}',
  }),
  Object.freeze({
    name: 'atlas-v4-place-written',
    collection: 'places',
    document: 'users/{userId}/trips/{tripId}/places/{entityId}',
  }),
  Object.freeze({
    name: 'atlas-v4-connection-written',
    collection: 'connections',
    document: 'users/{userId}/trips/{tripId}/connections/{entityId}',
  }),
  Object.freeze({
    name: 'atlas-v4-note-written',
    collection: 'notes',
    document: 'users/{userId}/trips/{tripId}/notes/{entityId}',
  }),
  Object.freeze({
    name: 'atlas-v4-checklist-written',
    collection: 'checklist',
    document: 'users/{userId}/trips/{tripId}/checklist/{entityId}',
  }),
]);
