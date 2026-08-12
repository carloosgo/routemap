const DATABASE_MARKER = '  match /databases/{database}/documents {';
const USERS_MARKER = '    match /users/{userId} {';
const TRIPS_MARKER = '      match /trips/{tripId} {';
const REVISION_MARKER = '        match /revisions/{revisionId} {';
const CATCH_ALL_MARKER = '    match /{document=**} {';
const LEGACY_ROOT_DELETE = '        allow delete: if ownsUserPath(userId);';
const GUARDED_LEGACY_ROOT_DELETE = `        allow delete: if ownsUserPath(userId)
          && (resource.data.storageVersion == 2 || resource.data.storageVersion == 3);`;

const V4_FUNCTION_NAMES = Object.freeze([
  'signedIn',
  'ownsUserPath',
  'validCount',
  'validAmount',
  'validRank',
  'validStatus',
  'validLifecycle',
  'validCity',
  'validFood',
  'validTransport',
  'validExpenseItems',
  'validExpenses',
  'tripPath',
  'activeTripExists',
  'validTrip',
  'validClientTripCreate',
  'validClientTripUpdate',
  'validEntityCreate',
  'validEntityUpdate',
  'validSegment',
  'validPlace',
  'validConnection',
  'validNote',
  'validChecklist',
]);

function uniqueIndex(source, marker, label) {
  const first = source.indexOf(marker);
  const last = source.lastIndexOf(marker);
  if (first < 0 || first !== last) {
    throw new Error(`No se encontró un único marcador ${label}.`);
  }
  return first;
}

function pilotFunctionName(name) {
  return `pilot${name[0].toUpperCase()}${name.slice(1)}`;
}

function prefixV4FunctionNames(source) {
  return [...V4_FUNCTION_NAMES]
    .sort((left, right) => right.length - left.length)
    .reduce((text, name) => {
      const pattern = new RegExp(`\\b${name}\\b`, 'g');
      return text.replace(pattern, pilotFunctionName(name));
    }, source);
}

function extractV4Sections(v4Rules) {
  const databaseIndex = uniqueIndex(v4Rules, DATABASE_MARKER, 'database v4');
  const usersIndex = uniqueIndex(v4Rules, USERS_MARKER, 'users v4');
  const catchAllIndex = uniqueIndex(v4Rules, CATCH_ALL_MARKER, 'catch-all v4');
  if (!(databaseIndex < usersIndex && usersIndex < catchAllIndex)) {
    throw new Error('La estructura de firestore-v4.rules no coincide con la esperada.');
  }

  const databaseLineEnd = v4Rules.indexOf('\n', databaseIndex + DATABASE_MARKER.length);
  if (databaseLineEnd < 0) throw new Error('No se pudo aislar el bloque database v4.');
  return {
    helpers: v4Rules.slice(databaseLineEnd + 1, usersIndex).trimEnd(),
    usersBlock: v4Rules.slice(usersIndex, catchAllIndex).trimEnd(),
  };
}

function guardLegacyRootDelete(v3Rules) {
  const tripsIndex = uniqueIndex(v3Rules, TRIPS_MARKER, 'trips v3');
  const revisionIndex = uniqueIndex(v3Rules, REVISION_MARKER, 'revision v3');
  if (tripsIndex >= revisionIndex) {
    throw new Error('La estructura legacy de trips/revisions no coincide con la esperada.');
  }

  const rootBlock = v3Rules.slice(tripsIndex, revisionIndex);
  const firstDelete = rootBlock.indexOf(LEGACY_ROOT_DELETE);
  const lastDelete = rootBlock.lastIndexOf(LEGACY_ROOT_DELETE);
  if (firstDelete < 0 || firstDelete !== lastDelete) {
    throw new Error('No se encontró un único delete legacy del root para proteger.');
  }
  const guardedRootBlock = rootBlock.replace(LEGACY_ROOT_DELETE, GUARDED_LEGACY_ROOT_DELETE);
  return `${v3Rules.slice(0, tripsIndex)}${guardedRootBlock}${v3Rules.slice(revisionIndex)}`;
}

export function composePilotWriteRules(v3Rules, v4Rules) {
  if (typeof v3Rules !== 'string' || !v3Rules.trim()) {
    throw new TypeError('Se requieren las Rules v3 activas como texto.');
  }
  if (typeof v4Rules !== 'string' || !v4Rules.trim()) {
    throw new TypeError('Se requieren las Rules v4 candidatas como texto.');
  }

  const guardedV3 = guardLegacyRootDelete(v3Rules);
  const v3UsersIndex = uniqueIndex(guardedV3, USERS_MARKER, 'users v3');
  uniqueIndex(guardedV3, CATCH_ALL_MARKER, 'catch-all v3');
  const { helpers, usersBlock } = extractV4Sections(v4Rules);

  const helperInsertion = [
    '    // Storage v4 PILOT: helpers aislados para coexistencia v2/v3/v4.',
    prefixV4FunctionNames(helpers),
    '',
  ].join('\n');
  let composed = `${guardedV3.slice(0, v3UsersIndex)}${helperInsertion}${guardedV3.slice(v3UsersIndex)}`;

  const catchAllIndex = uniqueIndex(composed, CATCH_ALL_MARKER, 'catch-all compuesto');
  const usersInsertion = [
    '    // Storage v4 PILOT: reglas completas v4; legacy permanece operativo.',
    '    // El hard delete del root v4 sigue prohibido; lifecycle es backend-only.',
    prefixV4FunctionNames(usersBlock),
    '',
  ].join('\n');
  composed = `${composed.slice(0, catchAllIndex)}${usersInsertion}${composed.slice(catchAllIndex)}`;
  return composed;
}
