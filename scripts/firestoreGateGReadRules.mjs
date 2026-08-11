const REVISION_MATCH_MARKER = '        match /revisions/{revisionId} {';

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

export function composeGateGReadRules(v3Rules) {
  if (typeof v3Rules !== 'string' || !v3Rules.trim()) {
    throw new TypeError('Se requieren las Rules v3 como texto.');
  }
  const first = v3Rules.indexOf(REVISION_MATCH_MARKER);
  const last = v3Rules.lastIndexOf(REVISION_MATCH_MARKER);
  if (first < 0 || first !== last) {
    throw new Error('No se encontró un único punto seguro para inyectar Gate G READ.');
  }
  return v3Rules.replace(
    REVISION_MATCH_MARKER,
    `${GATE_G_V4_READ_MATCHES}\n\n${REVISION_MATCH_MARKER}`
  );
}
