function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function requireEntityVersion(value, label = 'version') {
  if (!isNonNegativeInteger(value)) {
    throw new TypeError(`${label} debe ser un entero no negativo.`);
  }
  return value;
}

export function nextEntityVersion(baseVersion) {
  return requireEntityVersion(baseVersion, 'baseVersion') + 1;
}

export function isValidVersionAdvance(currentVersion, proposedVersion) {
  if (!isNonNegativeInteger(currentVersion)) return false;
  if (!isNonNegativeInteger(proposedVersion)) return false;
  return proposedVersion === currentVersion + 1;
}

export function isStaleBaseVersion(baseVersion, serverVersion) {
  if (!isNonNegativeInteger(baseVersion)) return true;
  if (!isNonNegativeInteger(serverVersion)) return true;
  return baseVersion !== serverVersion;
}
