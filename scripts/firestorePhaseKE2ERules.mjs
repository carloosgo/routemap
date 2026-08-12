const DATABASE_MARKER = '  match /databases/{database}/documents {';
const USERS_MARKER = '    match /users/{userId} {';
const CATCH_ALL_MARKER = '    match /{document=**} {';

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

export const PHASE_K_E2E_TRIP_PREFIX = 'phase-k-e2e-';

function uniqueIndex(source, marker, label) {
  const first = source.indexOf(marker);
  const last = source.lastIndexOf(marker);
  if (first < 0 || first !== last) {
    throw new Error(`No se encontro un unico marcador ${label}.`);
  }
  return first;
}

function prefixedFunctionName(name) {
  return `phaseK${name[0].toUpperCase()}${name.slice(1)}`;
}

function prefixV4FunctionNames(source) {
  return [...V4_FUNCTION_NAMES]
    .sort((left, right) => right.length - left.length)
    .reduce((text, name) => {
      const pattern = new RegExp(`\\b${name}\\b`, 'g');
      return text.replace(pattern, prefixedFunctionName(name));
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

function phaseKProbeGuard() {
  return `    function phaseKOwnsProbeTrip(userId, tripId) {
      return phaseKOwnsUserPath(userId)
        && tripId.matches('^phase-k-e2e-[a-z0-9_-]{8,80}$');
    }`;
}

function scopeV4UsersBlock(usersBlock) {
  let scoped = prefixV4FunctionNames(usersBlock);
  scoped = scoped.replaceAll(
    'phaseKOwnsUserPath(userId)',
    'phaseKOwnsProbeTrip(userId, tripId)'
  );
  scoped = scoped.replaceAll(
    'allow delete: if false;',
    'allow delete: if phaseKOwnsProbeTrip(userId, tripId);'
  );
  return scoped;
}

export function composePhaseKE2ERules(v3Rules, v4Rules) {
  if (typeof v3Rules !== 'string' || !v3Rules.trim()) {
    throw new TypeError('Se requieren las Rules v3 activas como texto.');
  }
  if (typeof v4Rules !== 'string' || !v4Rules.trim()) {
    throw new TypeError('Se requieren las Rules v4 como texto.');
  }

  const v3UsersIndex = uniqueIndex(v3Rules, USERS_MARKER, 'users v3');
  uniqueIndex(v3Rules, CATCH_ALL_MARKER, 'catch-all v3');

  const { helpers, usersBlock } = extractV4Sections(v4Rules);
  const prefixedHelpers = prefixV4FunctionNames(helpers);
  const scopedUsersBlock = scopeV4UsersBlock(usersBlock);

  const helperInsertion = [
    '    // Phase K E2E temporal: helpers v4 aislados por prefijo.',
    prefixedHelpers,
    '',
    phaseKProbeGuard(),
    '',
  ].join('\n');

  let composed = `${v3Rules.slice(0, v3UsersIndex)}${helperInsertion}${v3Rules.slice(v3UsersIndex)}`;
  const catchAllIndex = uniqueIndex(composed, CATCH_ALL_MARKER, 'catch-all compuesto');
  const scopedInsertion = [
    '    // Phase K E2E temporal: v4 write solo para trips sinteticos.',
    '    // No desplegar sin autorizacion explicita; el ruleset activo normal no cambia.',
    scopedUsersBlock,
    '',
  ].join('\n');

  composed = `${composed.slice(0, catchAllIndex)}${scopedInsertion}${composed.slice(catchAllIndex)}`;
  return composed;
}
