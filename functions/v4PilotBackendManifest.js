export const V4_PILOT_FIRESTORE_EVENT_REGION = 'northamerica-south1';
export const V4_PILOT_SERVICE_REGION = 'us-central1';
// Compatibility alias for non-Firestore pilot services.
export const V4_PILOT_BACKEND_REGION = V4_PILOT_SERVICE_REGION;

export const V4_PILOT_BACKEND_FUNCTION_NAMES = Object.freeze([
  'v4SegmentAggregate',
  'v4PlaceAggregate',
  'v4ConnectionTouch',
  'v4NoteTouch',
  'v4ChecklistTouch',
  'v4TripLifecycle',
  'v4TripPurge',
]);

export const V4_PILOT_BACKEND_FUNCTION_REGIONS = Object.freeze({
  v4SegmentAggregate: V4_PILOT_FIRESTORE_EVENT_REGION,
  v4PlaceAggregate: V4_PILOT_FIRESTORE_EVENT_REGION,
  v4ConnectionTouch: V4_PILOT_FIRESTORE_EVENT_REGION,
  v4NoteTouch: V4_PILOT_FIRESTORE_EVENT_REGION,
  v4ChecklistTouch: V4_PILOT_FIRESTORE_EVENT_REGION,
  v4TripLifecycle: V4_PILOT_SERVICE_REGION,
  v4TripPurge: V4_PILOT_SERVICE_REGION,
});
