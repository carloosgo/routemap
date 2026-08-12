import { createV4PilotBackendBundle } from './v4PilotBackendBundle.js';

const pilot = createV4PilotBackendBundle();

export const v4SegmentAggregate = pilot.v4SegmentAggregate;
export const v4PlaceAggregate = pilot.v4PlaceAggregate;
export const v4ConnectionTouch = pilot.v4ConnectionTouch;
export const v4NoteTouch = pilot.v4NoteTouch;
export const v4ChecklistTouch = pilot.v4ChecklistTouch;
export const v4TripLifecycle = pilot.v4TripLifecycle;
export const v4TripPurge = pilot.v4TripPurge;
