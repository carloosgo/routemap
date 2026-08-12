const TRIPS_MATCH_MARKER = '      match /trips/{tripId} {';
const REVISION_MATCH_MARKER = '        match /revisions/{revisionId} {';
const LEGACY_ROOT_DELETE = '        allow delete: if ownsUserPath(userId);';
const GUARDED_LEGACY_ROOT_DELETE = `        allow delete: if ownsUserPath(userId)
          && (resource.data.storageVersion == 2 || resource.data.storageVersion == 3);`;

export const GATE_G_V4_READ_MATCHES = `        // Gate G READ coexistence: v4 entities are readable by the owner,
        // but all client writes remain disabled until the PILOT write gate.
        match /segments/{documentId} {
          allow get, list: if ownsUserPath(userId);
          allow create, update, delete: if false;
        }

        match /places/{documentId} {
          allow get, list: if ownsUserPath(userId);
          allow create, update, delete: if false;
        }

        match /connections/{documentId} {
          allow get, list: if ownsUserPath(userId);
          allow create, update, delete: if false;
        }

        match /notes/{documentId} {
          allow get, list: if ownsUserPath(userId);
          allow create, update, delete: if false;
        }

        match /checklist/{documentId} {
          allow get, list: if ownsUserPath(userId);
          allow create, update, delete: if false;
        }`;

function uniqueIndex(source, marker, label) {
  const first = source.indexOf(marker);
  const last = source.lastIndexOf(marker);
  if (first < 0 || first !== last) {
    throw new Error(`No se encontró un único ${label} en las Rules.`);
  }
  return first;
}

function guardLegacyRootDelete(v3Rules) {
  const tripsStart = uniqueIndex(v3Rules, TRIPS_MATCH_MARKER, 'bloque trips v3');
  const revisionStart = uniqueIndex(v3Rules, REVISION_MATCH_MARKER, 'bloque revisions v3');
  if (tripsStart >= revisionStart) {
    throw new Error('La estructura de trips/revisions v3 no coincide con la esperada.');
  }

  const rootBlock = v3Rules.slice(tripsStart, revisionStart);
  const firstDelete = rootBlock.indexOf(LEGACY_ROOT_DELETE);
  const lastDelete = rootBlock.lastIndexOf(LEGACY_ROOT_DELETE);
  if (firstDelete < 0 || firstDelete !== lastDelete) {
    throw new Error('No se encontró un único delete legacy del root para proteger.');
  }

  const guardedRoot = rootBlock.replace(LEGACY_ROOT_DELETE, GUARDED_LEGACY_ROOT_DELETE);
  return `${v3Rules.slice(0, tripsStart)}${guardedRoot}${v3Rules.slice(revisionStart)}`;
}

export function composeGateGReadRules(v3Rules) {
  if (typeof v3Rules !== 'string' || !v3Rules.trim()) {
    throw new TypeError('Se requieren las Rules v3 como texto.');
  }
  const guardedV3 = guardLegacyRootDelete(v3Rules);
  const revisionStart = uniqueIndex(
    guardedV3,
    REVISION_MATCH_MARKER,
    'punto seguro para inyectar Gate G READ'
  );

  return `${guardedV3.slice(0, revisionStart)}${GATE_G_V4_READ_MATCHES}\n\n${guardedV3.slice(revisionStart)}`;
}
